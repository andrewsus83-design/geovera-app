import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ════════════════════════════════════════════════
// GEOVERA — god-mode-biweekly  (INTELLIGENCE REFRESH)
// Cron: 1st & 15th each month (0 20 1,15 * *)
// 1. RAG Embed  2. Claude QA Bank  3. ML-Learn  4. Strategic WA
// ════════════════════════════════════════════════

const CYCLE_DAYS   = 14;
const EMBED_MODEL  = "text-embedding-3-small";
const CLAUDE_MODEL = "claude-sonnet-4-5-20251022";
const FONNTE_URL   = "https://api.fonnte.com/send";

// FIX: Use correct tier names matching DB (go/pro/enterprise)
type Tier      = "go"|"pro"|"enterprise";
type PersonaId = "ceo"|"cbo"|"research"|"finance"|"content"|"authority"|"ops";

const TIER_QA: Record<string, number> = { go:50, pro:100, enterprise:150 };
const QA_SPLIT = { P1: 0.40, P2: 0.35, P3: 0.25 };

async function sendWA(p: { to:string; message:string; token:string }) {
  try {
    const res = await fetch(FONNTE_URL, {
      method: "POST",
      headers: { "Authorization": p.token, "Content-Type": "application/json" },
      body: JSON.stringify({ target:p.to, message:p.message, delay:0, countryCode:"62" }),
    });
    const d = await res.json();
    return d.status ? { ok:true } : { ok:false, error:d.reason };
  } catch(e) { return { ok:false, error:String(e) }; }
}

async function sha256(text:string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,"0")).join("");
}
async function buildCacheKey(provider:string, model:string, prompt:string): Promise<string> {
  return `${provider}:${(await sha256(`${provider}:${model}:${prompt}`)).slice(0,48)}`;
}
const CACHE_TTL: Record<string,number> = { anthropic:12, openai_embed:168 };
const COST_TABLE: Record<string,{input:number;output:number}> = {
  "claude-sonnet-4-5-20251022": { input:3.00,  output:15.00 },
  "text-embedding-3-small":     { input:0.02,  output:0.00  },
};
function calcCost(model:string, ti:number, to:number): number {
  const p = COST_TABLE[model]??{input:1,output:1};
  return (ti/1e6*p.input)+(to/1e6*p.output);
}

async function claudeCall(
  sb: ReturnType<typeof createClient>,
  system: string,
  userMsg: string,
  model: string,
  anthropicKey: string,
  maxTokens = 2000,
  temp = 0.5
): Promise<{text:string;fromCache:boolean}> {
  const prompt = `${system}\n||||\n${userMsg}`;
  const key = await buildCacheKey("anthropic", model, prompt);
  const { data: cached } = await sb.rpc("api_cache_get", { p_cache_key: key });
  if (cached?.response_text) return { text: cached.response_text, fromCache: true };
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": anthropicKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature: temp,
      system,
      messages: [{ role: "user", content: userMsg }],
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Claude: ${JSON.stringify(data.error)}`);
  const text = data.content?.[0]?.text ?? "";
  const ti = data.usage?.input_tokens ?? 0;
  const to = data.usage?.output_tokens ?? 0;
  const hash = (await sha256(prompt)).slice(0,32);
  await sb.rpc("api_cache_set", {
    p_cache_key: key, p_provider: "anthropic", p_model: model, p_prompt_hash: hash,
    p_response: data, p_response_text: text, p_ttl_hours: CACHE_TTL.anthropic,
    p_tokens_in: ti, p_tokens_out: to, p_cost_usd: calcCost(model, ti, to),
  }).catch(()=>{});
  return { text, fromCache: false };
}

Deno.serve(async (req) => {
  if (req.method!=="POST" && req.method!=="GET") return new Response("Method not allowed",{status:405});
  const SUPABASE_URL   = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_KEY   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const OPENAI_KEY     = Deno.env.get("OPENAI_API_KEY")!;
  const ANTHROPIC_KEY  = Deno.env.get("ANTHROPIC_API_KEY")!;
  const FONNTE_TOKEN   = Deno.env.get("FONNTE_TOKEN")!;
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  let manualBrandId: string|undefined;
  try { const b = await req.clone().json(); manualBrandId = b.brand_id; } catch {}

  let brands: {id:string;name:string;tier:string;wa_number:string;p1:string;p2:string;p3:string;cycle_count:number}[];
  if (manualBrandId) {
    const {data} = await supabase.from("brands").select("*, brand_priorities(p1,p2,p3)").eq("id",manualBrandId).single();
    if (!data) return new Response(JSON.stringify({ok:false,error:"Brand not found"}),{status:404});
    const bp = (data.brand_priorities as {p1:string;p2:string;p3:string}[])?.[0]??{};
    brands = [{...data,p1:bp.p1,p2:bp.p2,p3:bp.p3}];
  } else {
    const {data} = await supabase.rpc("get_brands_due_biweekly_refresh");
    brands = data??[];
  }

  if (brands.length===0)
    return new Response(JSON.stringify({ok:true,processed:0,message:"No brands due"}),{status:200,headers:{"Content-Type":"application/json"}});

  const results: {brand:string;ok:boolean;steps:Record<string,unknown>;error?:string}[] = [];
  for (const brand of brands) {
    try {
      const r = await runBiweeklyRefresh(brand,{supabase,OPENAI_KEY,ANTHROPIC_KEY,FONNTE_TOKEN,SUPABASE_URL});
      results.push({brand:brand.name,ok:true,steps:r});
    } catch(e) {
      results.push({brand:brand.name,ok:false,steps:{},error:String(e)});
    }
  }

  return new Response(JSON.stringify({ok:true,processed:results.filter(r=>r.ok).length,results}),{headers:{"Content-Type":"application/json"}});
});

async function runBiweeklyRefresh(
  brand:{id:string;name:string;tier:string;wa_number:string;p1:string;p2:string;p3:string;cycle_count:number},
  env:{supabase:ReturnType<typeof createClient>;OPENAI_KEY:string;ANTHROPIC_KEY:string;FONNTE_TOKEN:string;SUPABASE_URL:string}
): Promise<Record<string,unknown>> {
  const summary: Record<string,unknown> = {};

  // STEP 1: RAG Embed
  let embedResult = { embedded:0, skipped:0, contextBuilt:false };
  try {
    const res = await fetch(`${env.SUPABASE_URL}/functions/v1/brand-vectorize?brand_id=${brand.id}`,{
      method:"POST",
      headers:{"Content-Type":"application/json","Authorization":`Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!}`},
      body:"{}"
    });
    const d = await res.json();
    embedResult = { embedded:d.total_embedded??0, skipped:d.total_skipped??0, contextBuilt:false };
    // Build RAG context cache
    const qEmbedRes = await fetch("https://api.openai.com/v1/embeddings",{
      method:"POST",
      headers:{"Authorization":`Bearer ${env.OPENAI_KEY}`,"Content-Type":"application/json"},
      body:JSON.stringify({model:EMBED_MODEL,input:`${brand.id} brand strategy insights recommendations`,encoding_format:"float"})
    });
    if (qEmbedRes.ok) {
      const qd = await qEmbedRes.json();
      const vec = qd.data?.[0]?.embedding;
      if (vec) {
        const {data:ragResults} = await env.supabase.rpc("rag_search",{
          p_brand_id:brand.id,p_query_vec:vec,p_top_k:10,p_min_sim:0.65,p_source_filter:null
        });
        if (ragResults?.length>0) {
          type RR = {source_table:string;similarity:number;chunk_text:string};
          const contextText = (ragResults as RR[]).slice(0,8)
            .map(r=>`[${r.source_table}|${(r.similarity*100).toFixed(0)}%] ${r.chunk_text.slice(0,280)}`)
            .join("\n");
          await env.supabase.from("rag_context_cache").upsert({
            brand_id:brand.id,
            context_text:contextText,
            top_chunks:(ragResults as RR[]).slice(0,8).map(r=>({source:r.source_table,sim:r.similarity,text:r.chunk_text.slice(0,100)})),
            chunk_count:(ragResults as RR[]).length,
            generated_at:new Date().toISOString(),
            expires_at:new Date(Date.now()+(CYCLE_DAYS+1)*86400000).toISOString(),
          },{onConflict:"brand_id"});
          embedResult.contextBuilt = true;
        }
      }
    }
  } catch(e) { console.error("rag-embed failed:",e); }
  summary.rag = embedResult;

  // STEP 2: Claude QA Bank
  let qaResult = { generated:0, fromCache:false };
  try {
    const tier = brand.tier as Tier;
    const qaCount = TIER_QA[tier]??50;
    const personas = [brand.p1,brand.p2,brand.p3].filter(Boolean) as PersonaId[];
    const qaAlloc: Record<string,number> = {
      [personas[0]]:Math.round(qaCount*QA_SPLIT.P1),
      [personas[1]]:Math.round(qaCount*QA_SPLIT.P2),
      [personas[2]]:qaCount-Math.round(qaCount*QA_SPLIT.P1)-Math.round(qaCount*QA_SPLIT.P2),
    };
    const {data:patterns} = await env.supabase.from("learned_patterns")
      .select("pattern_type,pattern_value").eq("brand_id",brand.id).limit(5);
    const hints = (patterns??[])
      .map((p:{pattern_type:string;pattern_value:string})=>`• ${p.pattern_type}: ${p.pattern_value.slice(0,80)}`)
      .join("\n");
    const qaPrompt = `Brand: ${brand.name}\nPersona aktif: ${personas.map(p=>`${p}(${qaAlloc[p]}q)`).join(", ")}\nTotal: ${qaCount} pertanyaan 14 hari ke depan\nPola terbukti:\n${hints||"Eksplorasi penuh"}\n\nGenerate strategic Q&A bank. Return ONLY valid JSON array: [{"question":"...","platform":"chatgpt|perplexity|claude|gemini|bing","persona":"persona_id","pillar":"visibility|discovery|authority|trust"}]`;
    const qaRes = await claudeCall(
      env.supabase,
      "Brand intelligence QA generator. Return ONLY valid JSON array. No markdown. No preamble.",
      qaPrompt,
      CLAUDE_MODEL,
      env.ANTHROPIC_KEY,
      3000,
      0.5
    );
    let qaQs: {question:string;platform:string;persona:string;pillar?:string}[] = [];
    try { qaQs = JSON.parse(qaRes.text.replace(/```json|```/g,"").trim()); } catch {}
    if (qaQs.length>0) {
      await env.supabase.from("qa_pairs")
        .update({expires_at:new Date(Date.now()+24*3600000).toISOString()})
        .eq("brand_id",brand.id).eq("qa_bank",true).is("expires_at",null);
      const cycleId = `bw_qa_${Date.now()}_${brand.id.slice(0,8)}`;
      await env.supabase.from("qa_pairs").insert(
        qaQs.map(q=>({
          brand_id:brand.id, cycle_id:cycleId, persona_id:q.persona,
          question:q.question, platform:q.platform, pillar:q.pillar??"visibility",
          qa_bank:true, used_count:0,
          expires_at:new Date(Date.now()+(CYCLE_DAYS+2)*86400000).toISOString(),
          created_at:new Date().toISOString(),
        }))
      );
      qaResult = { generated:qaQs.length, fromCache:qaRes.fromCache };
    }
  } catch(e) { console.error("QA gen failed:",e); }
  summary.qa = qaResult;

  // STEP 3: ML-Learn
  let mlResult = { signals:0, updates:0, patterns:0 };
  try {
    const since = new Date(Date.now()-CYCLE_DAYS*86400000).toISOString();
    const {data:signals} = await env.supabase.from("learning_signals")
      .select("*").eq("brand_id",brand.id)
      .gte("created_at",since).order("created_at",{ascending:true}).limit(500);
    if (signals?.length>0) {
      let updates=0;
      const resolve = (st:string, meta:Record<string,unknown>): {wt:string;wk:string;o:number}[] => {
        const pid=meta.persona_id as string|undefined;
        const pillar=meta.pillar as string|undefined;
        const ct=meta.content_type as string|undefined;
        const m: {wt:string;wk:string;o:number}[] = [];
        switch(st) {
          case "task_done":         if(pid)m.push({wt:"persona_score",wk:pid,o:0.85}); if(pillar)m.push({wt:"pillar_priority",wk:pillar,o:0.80}); break;
          case "task_skip":         if(pid)m.push({wt:"persona_score",wk:pid,o:0.30}); break;
          case "task_decay":        if(pid)m.push({wt:"persona_score",wk:pid,o:0.20}); break;
          case "content_approved":  if(ct)m.push({wt:"content_type",wk:ct,o:0.90}); if(pillar)m.push({wt:"pillar_priority",wk:pillar,o:0.75}); break;
          case "content_rejected":  if(ct)m.push({wt:"content_type",wk:ct,o:0.25}); break;
        }
        return m;
      };
      for (const sig of signals as {signal_type:string;metadata?:Record<string,unknown>}[]) {
        const wus = resolve(sig.signal_type, sig.metadata??{});
        for (const wu of wus) {
          await env.supabase.rpc("process_learning_signal",{
            p_brand_id:brand.id, p_weight_type:wu.wt, p_weight_key:wu.wk, p_outcome:wu.o
          }).then(()=>{updates++;}).catch(()=>{});
        }
      }
      const {data:wts} = await env.supabase.from("ml_weights").select("*").eq("brand_id",brand.id);
      if (wts?.length>0) {
        type W = {weight_type:string;weight_key:string;weight_value:number};
        const grp: Record<string,Record<string,number>> = {};
        for (const w of wts as W[]) {
          if(!grp[w.weight_type])grp[w.weight_type]={};
          grp[w.weight_type][w.weight_key]=+w.weight_value;
        }
        const rank=(o:Record<string,number>)=>Object.entries(o).sort(([,a],[,b])=>b-a);
        for (const p of [
          {pt:"top_performing_personas", pv:rank(grp["persona_score"]??{}).slice(0,3).map(([k,v])=>`${k}(${v.toFixed(2)})`).join(", "), pk:"ranking", cf:0.85},
          {pt:"best_content_types",      pv:rank(grp["content_type"]??{}).slice(0,2).map(([k,v])=>`${k}(${v.toFixed(2)})`).join(", "), pk:"ranking", cf:0.88},
          {pt:"priority_pillars",        pv:rank(grp["pillar_priority"]??{}).slice(0,2).map(([k,v])=>`${k}(${v.toFixed(2)})`).join(", "), pk:"ranking", cf:0.82},
        ]) {
          if(!p.pv) continue;
          await env.supabase.from("learned_patterns").upsert({
            brand_id:brand.id, pattern_type:p.pt, pattern_key:p.pk,
            pattern_value:p.pv, confidence:p.cf, sample_count:signals.length,
            updated_at:new Date().toISOString(),
          },{onConflict:"brand_id,pattern_type,pattern_key"}).catch(()=>{});
        }
      }
      const {count:pc} = await env.supabase.from("learned_patterns")
        .select("id",{count:"exact",head:true}).eq("brand_id",brand.id);
      mlResult = {signals:signals.length, updates, patterns:(pc as unknown as number)??0};
    }
  } catch(e) { console.error("ML learn failed:",e); }
  summary.ml = mlResult;

  // STEP 4: Strategic WA
  try {
    const {data:geoRows} = await env.supabase.from("geo_scores")
      .select("geo_score").eq("brand_id",brand.id)
      .order("recorded_at",{ascending:false}).limit(2);
    const curr = geoRows?.[0]?.geo_score??0;
    const prev = geoRows?.[1]?.geo_score??curr;
    const delta = curr-prev;
    const {data:topPat} = await env.supabase.from("learned_patterns")
      .select("pattern_type,pattern_value,confidence")
      .eq("brand_id",brand.id).order("confidence",{ascending:false}).limit(3);
    const patLines = (topPat??[])
      .map((p:{pattern_type:string;pattern_value:string;confidence:number})=>`\u2022 ${p.pattern_type}: ${p.pattern_value} (${(p.confidence*100).toFixed(0)}%)`)
      .join("\n");
    const rag = summary.rag as {embedded:number;skipped:number;contextBuilt:boolean};
    const qa  = summary.qa  as {generated:number;fromCache:boolean};
    const ml  = summary.ml  as {signals:number;updates:number;patterns:number};
    const msg = [
      `\ud83d\udd2c *BIWEEKLY INTELLIGENCE REFRESH \u2014 ${brand.name}*`,
      `_Knowledge base diperbarui untuk 14 hari ke depan_`, ``,
      `\ud83d\udcca *GEO Score:* ${curr.toFixed(1)} ${delta>0?"\u2191":delta<-1?"\u2193":"\u2192"}${Math.abs(delta).toFixed(1)} vs periode lalu`, ``,
      `\u2705 *Update selesai:*`,
      `\u2022 \ud83d\udcda RAG: ${rag.embedded} chunks di-embed (${rag.skipped} skip)`,
      `\u2022 \ud83e\udd16 QA Bank: ${qa.generated} pertanyaan baru via Claude Sonnet 4.5 (${qa.fromCache?"cache hit":"fresh"})`,
      `\u2022 \ud83e\udde0 ML: ${ml.signals} signal \u2192 ${ml.updates} weight update \u2192 ${ml.patterns} pola`,
      patLines ? `\n\ud83c\udfaf *Top ML Patterns:*\n${patLines}` : ``,
      ``,
      `_GOD MODE 72H akan generate tasks dari knowledge yang sudah diperbarui._`,
      `*STATUS* untuk lihat kondisi terkini`,
    ].filter(s=>s!=="").join("\n");
    await sendWA({to:brand.wa_number, message:msg, token:env.FONNTE_TOKEN});
    await env.supabase.from("wa_log").insert({
      brand_id:brand.id, wa_number:brand.wa_number,
      direction:"out", message:msg, processed:true,
      received_at:new Date().toISOString(),
    }).catch(()=>{});
  } catch(e) { console.error("Strategic WA failed:",e); }

  // STEP 5: Update timestamps
  await env.supabase.from("brands").update({
    last_biweekly_at:  new Date().toISOString(),
    next_biweekly_at:  new Date(Date.now()+CYCLE_DAYS*86400000).toISOString(),
    last_rag_embed_at: new Date().toISOString(),
    last_ml_learn_at:  new Date().toISOString(),
    last_qa_gen_at:    new Date().toISOString(),
  }).eq("id",brand.id);

  return summary;
}
