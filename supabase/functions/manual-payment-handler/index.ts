import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function generateInvoiceNumber(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const random = Math.floor(Math.random() * 90000) + 10000;
  return `GV-${year}${month}-${random}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Verify internal caller — must send X-Internal-Secret matching INTERNAL_HANDLER_SECRET
  const internalSecret = Deno.env.get("INTERNAL_HANDLER_SECRET") ?? "";
  const callerSecret = req.headers.get("x-internal-secret") ?? "";
  if (!internalSecret || callerSecret !== internalSecret) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const body = await req.json();
    const { action, ...data } = body;

    // ── GET SUBSCRIPTION ─────────────────────────────────────────────
    if (action === "get_subscription") {
      const { user_id } = data;
      if (!user_id) {
        return new Response(JSON.stringify({ error: "user_id required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const { data: sub } = await supabase
        .from("subscriptions")
        .select("*, plans(name, slug, price_idr)")
        .eq("user_id", user_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      return new Response(JSON.stringify({ success: true, subscription: sub || null }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── REQUEST SUBSCRIPTION (manual approval) ────────────────────────
    if (action === "request_subscription") {
      const { user_id, plan_id, email, full_name } = data;

      if (!user_id || !plan_id) {
        return new Response(JSON.stringify({ error: "user_id and plan_id required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Get plan details
      const { data: plan, error: planErr } = await supabase
        .from("plans")
        .select("id, name, price_idr, slug")
        .eq("id", plan_id)
        .single();

      if (planErr || !plan) {
        return new Response(JSON.stringify({ error: "Plan not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Get bank settings
      const { data: settings } = await supabase
        .from("app_settings")
        .select("key, value")
        .in("key", ["bank_name", "bank_account_no", "bank_account_name", "bank_transfer_note"]);

      const bankSettings: Record<string, string> = {};
      settings?.forEach((s: { key: string; value: string }) => {
        bankSettings[s.key] = s.value;
      });

      const invoice_number = generateInvoiceNumber();

      // Cancel any existing pending subscription for this user
      await supabase
        .from("subscriptions")
        .update({ status: "cancelled" })
        .eq("user_id", user_id)
        .eq("status", "pending_payment");

      // Create pending subscription
      const { data: sub, error: subErr } = await supabase
        .from("subscriptions")
        .insert({
          user_id,
          plan_id,
          status: "pending_payment",
          invoice_number,
        })
        .select()
        .single();

      if (subErr) throw subErr;

      // Send invoice email
      const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
      const invoiceRes = await fetch(`${supabaseUrl}/functions/v1/send-invoice`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({
          user_id,
          email,
          full_name: full_name || email?.split("@")[0] || "User",
          plan_name: plan.name,
          plan_price: plan.price_idr,
          invoice_number,
          bank_settings: {
            bank_name: bankSettings.bank_name || "BCA",
            bank_account_no: bankSettings.bank_account_no || "",
            bank_account_name: bankSettings.bank_account_name || "",
            bank_transfer_note: bankSettings.bank_transfer_note || "",
          },
        }),
      });

      if (invoiceRes.ok) {
        await supabase
          .from("subscriptions")
          .update({ invoice_sent_at: new Date().toISOString() })
          .eq("id", sub.id);
      } else {
        console.error("[manual-payment-handler] send-invoice failed:", await invoiceRes.text());
      }

      return new Response(JSON.stringify({
        success: true,
        invoice_number,
        plan_name: plan.name,
        plan_price_idr: plan.price_idr,
        bank_settings: {
          bank_name: bankSettings.bank_name || "BCA",
          bank_account_no: bankSettings.bank_account_no || "",
          bank_account_name: bankSettings.bank_account_name || "",
          bank_transfer_note: bankSettings.bank_transfer_note || "",
        },
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── ACTIVATE FREE TIER ────────────────────────────────────────────
    if (action === "activate_free_tier") {
      const { user_id } = data;
      if (!user_id) {
        return new Response(JSON.stringify({ error: "user_id required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const { data: basicPlan } = await supabase
        .from("plans")
        .select("id")
        .eq("slug", "basic")
        .single();

      const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      // Only cancel pending requests — never cancel a live paid subscription
      await supabase
        .from("subscriptions")
        .update({ status: "cancelled" })
        .eq("user_id", user_id)
        .eq("status", "pending_payment");

      const { error } = await supabase
        .from("subscriptions")
        .insert({
          user_id,
          plan_id: basicPlan?.id ?? null,
          status: "active",
          invoice_number: `FREE-${Date.now()}`,
          activated_at: new Date().toISOString(),
          expires_at: periodEnd.toISOString(),
          notes: "Free trial",
        });

      if (error) throw error;

      // Grant dashboard access
      await supabase
        .from("user_profiles")
        .update({ status: "active" })
        .eq("id", user_id);

      return new Response(JSON.stringify({ success: true, message: "Free trial activated" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── SEND APPROVAL EMAIL ───────────────────────────────────────────
    if (action === "send_approval_email") {
      const { user_email, user_name, plan_name, plan_price, invoice_number } = data;
      if (!user_email || !invoice_number) {
        return new Response(JSON.stringify({ error: "user_email and invoice_number required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
      const APP_URL = Deno.env.get("APP_URL") || "https://app.geovera.xyz";

      const formatIDR = (n: number) =>
        new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

      const html = `<!DOCTYPE html>
<html lang="id">
<head><meta charset="UTF-8"/><title>Pembayaran Disetujui - GeoVera</title></head>
<body style="margin:0;padding:0;background:#F4F7F8;font-family:'Inter',system-ui,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F4F7F8;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:24px;box-shadow:0 8px 32px rgba(0,0,0,0.08);overflow:hidden;">
        <tr>
          <td style="background:linear-gradient(135deg,#5F8F8B 0%,#7AB3AB 100%);padding:32px 40px;">
            <span style="font-size:22px;font-weight:700;color:white;letter-spacing:-0.02em;">GeoVera</span>
            <p style="color:rgba(255,255,255,0.8);font-size:14px;margin:12px 0 0;">Konfirmasi Pembayaran</p>
          </td>
        </tr>
        <tr>
          <td style="padding:40px;">
            <div style="text-align:center;margin-bottom:32px;">
              <div style="width:64px;height:64px;border-radius:50%;background:#ECFDF5;border:2px solid #10B981;display:inline-flex;align-items:center;justify-content:center;margin-bottom:16px;">
                <span style="font-size:28px;">✓</span>
              </div>
              <h2 style="font-size:22px;font-weight:700;color:#1F2428;margin:0 0 8px;">Pembayaran Disetujui!</h2>
              <p style="font-size:15px;color:#6B7280;margin:0;">Akun GeoVera kamu sudah aktif</p>
            </div>

            <p style="font-size:15px;color:#1F2428;margin:0 0 24px;">Halo <strong>${user_name || user_email.split("@")[0]}</strong>,</p>
            <p style="font-size:15px;color:#6B7280;line-height:1.6;margin:0 0 32px;">
              Terima kasih! Tim GeoVera telah memverifikasi pembayaranmu dan akun kamu kini telah <strong style="color:#10B981;">aktif</strong>.
              Kamu sudah bisa login dan menggunakan semua fitur plan <strong>${plan_name || "GeoVera"}</strong> sekarang.
            </p>

            <table width="100%" cellpadding="0" cellspacing="0" style="background:#F4F7F8;border-radius:16px;padding:24px;margin-bottom:32px;">
              <tr><td>
                <table width="100%" cellpadding="4" cellspacing="0">
                  <tr>
                    <td style="font-size:14px;color:#6B7280;">No. Invoice</td>
                    <td style="font-size:14px;font-weight:600;color:#1F2428;text-align:right;">${invoice_number}</td>
                  </tr>
                  <tr>
                    <td style="font-size:14px;color:#6B7280;">Plan Aktif</td>
                    <td style="font-size:14px;font-weight:600;color:#1F2428;text-align:right;">${plan_name || "—"}</td>
                  </tr>
                  ${plan_price ? `<tr>
                    <td style="font-size:14px;color:#6B7280;">Nominal</td>
                    <td style="font-size:14px;font-weight:600;color:#5F8F8B;text-align:right;">${formatIDR(plan_price)}</td>
                  </tr>` : ""}
                  <tr>
                    <td style="font-size:14px;color:#6B7280;">Status</td>
                    <td style="font-size:14px;font-weight:700;color:#10B981;text-align:right;">✓ Aktif</td>
                  </tr>
                </table>
              </td></tr>
            </table>

            <div style="text-align:center;margin-bottom:32px;">
              <a href="${APP_URL}/signin" style="display:inline-block;background:linear-gradient(135deg,#5F8F8B,#7AB3AB);color:white;font-size:16px;font-weight:600;padding:14px 36px;border-radius:12px;text-decoration:none;">
                Login ke GeoVera
              </a>
            </div>

            <p style="font-size:13px;color:#9CA3AF;line-height:1.6;margin:0;text-align:center;">
              Simpan email ini sebagai bukti pembayaranmu.<br/>
              Pertanyaan? Hubungi <a href="mailto:billing@geovera.xyz" style="color:#5F8F8B;">billing@geovera.xyz</a>
            </p>
          </td>
        </tr>
        <tr>
          <td style="background:#F9FAFB;padding:24px 40px;border-top:1px solid #E5E7EB;">
            <p style="font-size:12px;color:#9CA3AF;margin:0;text-align:center;">
              &copy; 2025 GeoVera &mdash; Email ini dikirim otomatis, mohon tidak membalas langsung.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

      if (!RESEND_API_KEY) {
        console.log("[manual-payment-handler] No RESEND_API_KEY, skipping approval email");
        return new Response(JSON.stringify({ success: true, note: "email_skipped_no_api_key" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const emailRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: "GeoVera Billing <billing@geovera.xyz>",
          to: [user_email],
          subject: `Pembayaran Disetujui - Akun GeoVera Kamu Sudah Aktif!`,
          html,
        }),
      });

      if (!emailRes.ok) {
        const err = await emailRes.text();
        console.error("[manual-payment-handler] approval email error:", err);
        return new Response(JSON.stringify({ success: false, error: err }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      return new Response(JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[manual-payment-handler] error:", msg);
    return new Response(JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
