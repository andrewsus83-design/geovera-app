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

      await supabase
        .from("subscriptions")
        .update({ status: "cancelled" })
        .eq("user_id", user_id)
        .in("status", ["pending_payment", "active"]);

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

      return new Response(JSON.stringify({ success: true, message: "Free trial activated" }),
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
