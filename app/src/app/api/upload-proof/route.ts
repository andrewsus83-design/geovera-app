import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createHmac, createHash } from "crypto";

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID ?? "";
const ACCESS_KEY = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID ?? "";
const SECRET_KEY = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY ?? "";
const BUCKET     = process.env.CLOUDFLARE_R2_BUCKET ?? "payment-proofs";
const PUBLIC_URL = (process.env.CLOUDFLARE_R2_PUBLIC_URL ?? "").replace(/\/$/, "");

/* ── AWS Sig V4 for R2 (no external SDK needed) ── */
function hmac(key: Uint8Array | string, data: string): Buffer {
  return createHmac("sha256", key as unknown as Buffer).update(data).digest();
}
function sha256hex(data: Uint8Array | string): string {
  return createHash("sha256").update(data as unknown as Buffer).digest("hex");
}

async function uploadToR2(key: string, body: Uint8Array, contentType: string): Promise<void> {
  const host   = `${ACCOUNT_ID}.r2.cloudflarestorage.com`;
  const now    = new Date();
  const date   = now.toISOString().replace(/[:-]|\.\d{3}/g, "").slice(0, 15) + "Z"; // YYYYMMDDTHHmmssZ
  const dateD  = date.slice(0, 8); // YYYYMMDD
  const scope  = `${dateD}/auto/s3/aws4_request`;
  const payloadHash = sha256hex(body);

  const canonHeaders = `content-type:${contentType}\nhost:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${date}\n`;
  const signedHdrs   = "content-type;host;x-amz-content-sha256;x-amz-date";
  const canonReq     = `PUT\n/${BUCKET}/${key}\n\n${canonHeaders}\n${signedHdrs}\n${payloadHash}`;
  const strToSign    = `AWS4-HMAC-SHA256\n${date}\n${scope}\n${sha256hex(canonReq)}`;

  const sigKey = hmac(
    hmac(hmac(hmac(`AWS4${SECRET_KEY}`, dateD), "auto"), "s3"),
    "aws4_request",
  );
  const sig = hmac(sigKey, strToSign).toString("hex");

  const res = await fetch(`https://${host}/${BUCKET}/${key}`, {
    method: "PUT",
    headers: {
      "Content-Type":         contentType,
      "x-amz-date":           date,
      "x-amz-content-sha256": payloadHash,
      "Authorization":        `AWS4-HMAC-SHA256 Credential=${ACCESS_KEY}/${scope}, SignedHeaders=${signedHdrs}, Signature=${sig}`,
    },
    body: body as unknown as BodyInit,
  });

  if (!res.ok) {
    throw new Error(`R2 PUT failed: ${res.status} ${await res.text()}`);
  }
}

export async function POST(req: NextRequest) {
  // ── 1. Verify JWT ──────────────────────────────────────────────────────────
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const { data: { user }, error: authErr } = await adminClient.auth.getUser(token);
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // ── 2. Parse form data ─────────────────────────────────────────────────────
  let formData: FormData;
  try { formData = await req.formData(); }
  catch { return NextResponse.json({ error: "Invalid form data" }, { status: 400 }); }

  const file          = formData.get("file") as File | null;
  const invoiceNumber = (formData.get("invoiceNumber") as string | null) ?? "";
  if (!file || !invoiceNumber)
    return NextResponse.json({ error: "Missing file or invoiceNumber" }, { status: 400 });

  // ── 3. Validate file ───────────────────────────────────────────────────────
  const allowed = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
  if (!allowed.includes(file.type))
    return NextResponse.json({ error: "Hanya JPG, PNG, WebP, atau PDF." }, { status: 400 });
  if (file.size > 5 * 1024 * 1024)
    return NextResponse.json({ error: "Ukuran file maksimal 5 MB." }, { status: 400 });

  // ── 4. Verify subscription belongs to user ─────────────────────────────────
  const { data: sub } = await adminClient
    .from("subscriptions").select("id")
    .eq("invoice_number", invoiceNumber).eq("user_id", user.id).maybeSingle();
  if (!sub) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

  // ── 5. Upload to Cloudflare R2 (native Sig V4) ────────────────────────────
  const ext  = (file.name.split(".").pop() ?? "jpg").toLowerCase();
  const key  = `proofs/${invoiceNumber}.${ext}`;
  const body = new Uint8Array(await file.arrayBuffer());

  try {
    await uploadToR2(key, body, file.type);
  } catch (err) {
    console.error("[upload-proof] R2 upload failed:", err);
    return NextResponse.json({ error: "Upload ke Cloudflare gagal." }, { status: 502 });
  }

  // ── 6. Build public URL ────────────────────────────────────────────────────
  const publicUrl = PUBLIC_URL
    ? `${PUBLIC_URL}/${key}`
    : `https://${ACCOUNT_ID}.r2.cloudflarestorage.com/${BUCKET}/${key}`;

  // ── 7. Update subscription in DB ──────────────────────────────────────────
  const { error: dbErr } = await adminClient
    .from("subscriptions")
    .update({ proof_url: publicUrl, proof_uploaded_at: new Date().toISOString(), status: "proof_uploaded" })
    .eq("id", sub.id);
  if (dbErr) {
    console.error("[upload-proof] DB update failed:", dbErr.message);
    return NextResponse.json({ error: "DB update gagal." }, { status: 500 });
  }

  return NextResponse.json({ url: publicUrl });
}
