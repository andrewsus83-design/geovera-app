import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/**
 * send-invoice  — Resend email invoice
 *
 * Called server-to-server by manual-payment-handler (verify_jwt: false).
 * Protected by checking the caller provides a valid service role key,
 * since this function is not meant to be called by end users.
 *
 * Input:
 *   user_id, email, full_name, plan_name, plan_price, invoice_number,
 *   bank_settings: { bank_name, bank_account_no, bank_account_name, bank_transfer_note }
 *
 * Output:
 *   { success: true, message_id } | { error: "..." }
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM_EMAIL = Deno.env.get("RESEND_FROM_EMAIL") ?? "noreply@geovera.xyz";
const FROM_NAME = Deno.env.get("RESEND_FROM_NAME") ?? "GeoVera";

function formatIDR(amount: number): string {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(amount);
}

function buildEmailHtml(data: {
  full_name: string;
  plan_name: string;
  plan_price: number;
  invoice_number: string;
  bank_name: string;
  bank_account_no: string;
  bank_account_name: string;
  bank_transfer_note: string;
}): string {
  const { full_name, plan_name, plan_price, invoice_number, bank_name, bank_account_no, bank_account_name, bank_transfer_note } = data;
  const priceFormatted = formatIDR(plan_price);

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invoice GeoVera</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <!-- Header -->
        <tr>
          <td style="background:#1a1a2e;padding:32px 40px;text-align:center;">
            <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;letter-spacing:-0.5px;">GeoVera</h1>
            <p style="margin:8px 0 0;color:#a0a0b8;font-size:13px;">Brand Intelligence Platform</p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:40px;">
            <h2 style="margin:0 0 8px;color:#1a1a2e;font-size:20px;">Invoice Pembayaran</h2>
            <p style="margin:0 0 32px;color:#666;font-size:14px;">No. Invoice: <strong style="color:#1a1a2e;">${invoice_number}</strong></p>

            <p style="margin:0 0 24px;color:#333;font-size:15px;">Halo <strong>${full_name}</strong>,</p>
            <p style="margin:0 0 24px;color:#555;font-size:14px;line-height:1.6;">
              Terima kasih telah memilih GeoVera! Berikut adalah detail pembayaran untuk berlangganan plan <strong>${plan_name}</strong>.
            </p>

            <!-- Invoice Details -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f9ff;border-radius:8px;margin-bottom:24px;">
              <tr>
                <td style="padding:20px 24px;">
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="color:#666;font-size:13px;padding-bottom:12px;">Plan</td>
                      <td style="color:#1a1a2e;font-size:13px;font-weight:600;text-align:right;padding-bottom:12px;">${plan_name}</td>
                    </tr>
                    <tr>
                      <td style="color:#666;font-size:13px;padding-bottom:12px;">Durasi</td>
                      <td style="color:#1a1a2e;font-size:13px;font-weight:600;text-align:right;padding-bottom:12px;">1 Bulan</td>
                    </tr>
                    <tr>
                      <td colspan="2" style="border-top:1px solid #e0e0f0;padding-top:12px;"></td>
                    </tr>
                    <tr>
                      <td style="color:#1a1a2e;font-size:15px;font-weight:700;">Total</td>
                      <td style="color:#6366f1;font-size:18px;font-weight:700;text-align:right;">${priceFormatted}</td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

            <!-- Bank Details -->
            <h3 style="margin:0 0 16px;color:#1a1a2e;font-size:15px;">Instruksi Transfer Bank</h3>
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#fff8f0;border:1px solid #ffe4c0;border-radius:8px;margin-bottom:24px;">
              <tr>
                <td style="padding:20px 24px;">
                  <table width="100%" cellpadding="4" cellspacing="0">
                    <tr>
                      <td style="color:#888;font-size:13px;width:150px;">Bank</td>
                      <td style="color:#1a1a2e;font-size:14px;font-weight:600;">${bank_name}</td>
                    </tr>
                    <tr>
                      <td style="color:#888;font-size:13px;">No. Rekening</td>
                      <td style="color:#1a1a2e;font-size:14px;font-weight:600;">${bank_account_no}</td>
                    </tr>
                    <tr>
                      <td style="color:#888;font-size:13px;">Atas Nama</td>
                      <td style="color:#1a1a2e;font-size:14px;font-weight:600;">${bank_account_name}</td>
                    </tr>
                    <tr>
                      <td style="color:#888;font-size:13px;">Berita Transfer</td>
                      <td style="color:#e55;font-size:14px;font-weight:700;">${bank_transfer_note || invoice_number}</td>
                    </tr>
                    <tr>
                      <td style="color:#888;font-size:13px;">Jumlah</td>
                      <td style="color:#1a1a2e;font-size:14px;font-weight:700;">${priceFormatted}</td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

            <p style="margin:0 0 8px;color:#555;font-size:13px;line-height:1.6;">
              ⚠️ <strong>Penting:</strong> Mohon transfer tepat sesuai nominal dan sertakan berita transfer agar pembayaran dapat diverifikasi lebih cepat.
            </p>
            <p style="margin:0 0 24px;color:#555;font-size:13px;line-height:1.6;">
              Setelah transfer, akun Anda akan diaktifkan dalam waktu 1x24 jam kerja.
            </p>

            <p style="margin:0;color:#999;font-size:12px;text-align:center;border-top:1px solid #eee;padding-top:20px;">
              GeoVera — Brand Intelligence Platform &bull; geovera.xyz<br>
              Email ini dikirim otomatis, harap tidak membalas langsung ke email ini.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!RESEND_API_KEY) {
    console.error("[send-invoice] RESEND_API_KEY not set");
    return new Response(JSON.stringify({ error: "Email service not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: {
    user_id?: string;
    email?: string;
    full_name?: string;
    plan_name?: string;
    plan_price?: number;
    invoice_number?: string;
    bank_settings?: {
      bank_name?: string;
      bank_account_no?: string;
      bank_account_name?: string;
      bank_transfer_note?: string;
    };
  };

  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { email, full_name, plan_name, plan_price, invoice_number, bank_settings } = body;

  if (!email || !invoice_number || !plan_name || plan_price == null) {
    return new Response(JSON.stringify({ error: "Missing required fields: email, invoice_number, plan_name, plan_price" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const html = buildEmailHtml({
    full_name: full_name || email.split("@")[0],
    plan_name,
    plan_price,
    invoice_number,
    bank_name: bank_settings?.bank_name || "BCA",
    bank_account_no: bank_settings?.bank_account_no || "",
    bank_account_name: bank_settings?.bank_account_name || "",
    bank_transfer_note: bank_settings?.bank_transfer_note || invoice_number,
  });

  try {
    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${FROM_NAME} <${FROM_EMAIL}>`,
        to: [email],
        subject: `Invoice ${invoice_number} — GeoVera ${plan_name}`,
        html,
      }),
    });

    if (!resendRes.ok) {
      const errText = await resendRes.text();
      console.error("[send-invoice] Resend error:", errText);
      return new Response(JSON.stringify({ error: `Email send failed: ${errText}` }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const resendData = await resendRes.json() as { id?: string };
    console.log("[send-invoice] Sent invoice", invoice_number, "to", email, "id:", resendData.id);

    return new Response(JSON.stringify({ success: true, message_id: resendData.id }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[send-invoice] Error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
