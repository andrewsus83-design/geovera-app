import { NextRequest, NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { createClient } from "@supabase/supabase-js";

const ACCOUNT_ID  = process.env.CLOUDFLARE_ACCOUNT_ID ?? "";
const ACCESS_KEY  = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID ?? "";
const SECRET_KEY  = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY ?? "";
const BUCKET      = process.env.CLOUDFLARE_R2_BUCKET ?? "payment-proofs";
const PUBLIC_URL  = (process.env.CLOUDFLARE_R2_PUBLIC_URL ?? "").replace(/\/$/, "");

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY },
});

export async function POST(req: NextRequest) {
  // ── 1. Verify JWT ──────────────────────────────────────────────────────────
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const { data: { user }, error: authErr } = await adminClient.auth.getUser(token);
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── 2. Parse form data ─────────────────────────────────────────────────────
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file          = formData.get("file") as File | null;
  const invoiceNumber = (formData.get("invoiceNumber") as string | null) ?? "";

  if (!file || !invoiceNumber) {
    return NextResponse.json({ error: "Missing file or invoiceNumber" }, { status: 400 });
  }

  // ── 3. Validate file ───────────────────────────────────────────────────────
  const allowed = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
  if (!allowed.includes(file.type)) {
    return NextResponse.json({ error: "Hanya JPG, PNG, WebP, atau PDF." }, { status: 400 });
  }
  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: "Ukuran file maksimal 5 MB." }, { status: 400 });
  }

  // ── 4. Verify subscription belongs to user ─────────────────────────────────
  const { data: sub } = await adminClient
    .from("subscriptions")
    .select("id")
    .eq("invoice_number", invoiceNumber)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!sub) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  // ── 5. Upload to Cloudflare R2 ─────────────────────────────────────────────
  const ext  = file.name.split(".").pop() ?? "jpg";
  const key  = `proofs/${invoiceNumber}.${ext}`;
  const body = Buffer.from(await file.arrayBuffer());

  try {
    await r2.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: file.type,
    }));
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
    .update({
      proof_url: publicUrl,
      proof_uploaded_at: new Date().toISOString(),
      status: "proof_uploaded",
    })
    .eq("id", sub.id);

  if (dbErr) {
    console.error("[upload-proof] DB update failed:", dbErr.message);
    return NextResponse.json({ error: "DB update gagal." }, { status: 500 });
  }

  return NextResponse.json({ url: publicUrl });
}
