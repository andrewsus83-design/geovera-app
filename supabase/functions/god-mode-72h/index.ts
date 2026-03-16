import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ════════════════════════════════════════════════
// GEOVERA — god-mode-72h (LEAN TASK ENGINE)
// Cron: every 72 hours (0 20 */3 * *)
// Reads pre-computed RAG/ML/QA + Perplexity trends → generates tasks, sends WA
// ════════════════════════════════════════════════

// ── TYPES ──
type PersonaId = "ceo"|"cbo"|"research"|"finance"|"content"|"authority"|"ops";
type Tier = "go"|"pro"|"enterprise";
interface ODRIPScore {
  objective: string;
  depth: { score: number; reason: string; sources: number; freshness: string };
  risk_reward: { risk: number; reward: number; net: number; risk_note: string; reward_note: string };
  impact: { pillar: string; delta: string; timeframe: string; confidence: string };
  priority: { rank: string; effort: number; owner: string; kill_criterion: string };
}
interface PersonaInsight {
  persona_id: PersonaId; persona_icon: string; signal: string;
  finding: string; action: string; odrip: ODRIPScore;
  pillar?: string;
}
interface Brand {
  id: string; name: string; wa_number: string; tier: Tier;
  cycle_count: number; p1: PersonaId; p2: PersonaId; p3: PersonaId;
}
// FIX: Use correct tier names matching DB (go/pro/enterprise)
const TIER_QA: Record<string, number> = { go: 50, pro: 100, enterprise: 150 };
const PERSONA_META: Record<PersonaId, { icon: string; label: string; platform: string }> = {
  ceo:       { icon:"\ud83d\udc54", label:"CEO / Founder",          platform:"claude_opus" },
  cbo:       { icon:"\ud83e\udd1d", label:"Chief Business Officer", platform:"claude_opus" },
  research:  { icon:"\ud83d\udd2c", label:"Research & Intelligence",platform:"perplexity" },
  finance:   { icon:"\ud83d\udcca", label:"Analytics & Finance",    platform:"claude_opus" },
  content:   { icon:"\ud83c\udfa8", label:"Content Strategist",     platform:"gpt4o" },
  authority: { icon:"\ud83c\udfc6", label:"Authority & SEO",        platform:"gemini" },
  ops:       { icon:"\u26a1",       label:"Ops & Automation",       platform:"claude_sonnet" },
};

// ── WA SEND ──
async function sendWA(p: { to: string; message: string; token: string }) {
  try {
    const res = await fetch("https://api.fonnte.com/send", {
      method: "POST",
      headers: { "Authorization": p.token, "Content-Type": "application/json" },
      body: JSON.stringify({ target: p.to, message: p.message, delay: 0, countryCode: "62" }),
    });
    const d = await res.json();
    return d.status ? { ok: true } : { ok: false, error: d.reason };
  } catch (e) { return { ok: false, error: String(e) }; }
}

// ── CACHE HELPERS ──
async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,"0")).join("");
}
async function buildCacheKey(provider: string, model: string, prompt: string): Promise<string> {
  return `${provider}:${(await sha256(`${provider}:${model}:${prompt}`)).slice(0,48)}`;
}
const CACHE_TTL: Record<string,number> = { perplexity:6, anthropic:24, openai_chat:24 };
const COST_TABLE: Record<string,{input:number;output:number}> = {
  "claude-opus-4-6":    { input:15.00, output:75.00 },
  "claude-sonnet-4-6":  { input:3.00,  output:15.00 },
  "sonar":              { input:1.00,  output:1.00  },
};
function calcCost(model: string, ti: number, to: number): number {
  const p = COST_TABLE[model] ?? { input:1, output:1 };
  return (ti/1e6*p.input) + (to/1e6*p.output);
}
async function cacheGet(sb: ReturnType<typeof createClient>, provider: string, model: string, prompt: string) {
  const key = await buildCacheKey(provider, model, prompt);
  const { data } = await sb.rpc("api_cache_get", { p_cache_key: key });
  return data ? { hit: true, text: data.response_text, costSaved: data.cost_saved } : { hit: false };
}
async function cacheSet(sb: ReturnType<typeof createClient>, provider: string, model: string, prompt: string, body: unknown, text: string, ti: number, to: number) {
  const key = await buildCacheKey(provider, model, prompt);
  const hash = (await sha256(prompt)).slice(0,32);
  await sb.rpc("api_cache_set", {
    p_cache_key: key, p_provider: provider, p_model: model, p_prompt_hash: hash,
    p_response: body, p_response_text: text, p_ttl_hours: CACHE_TTL[provider]??24,
    p_tokens_in: ti, p_tokens_out: to, p_cost_usd: calcCost(model, ti, to),
  }).catch(()=>{});
}
async function cachedClaude(params: {
  system: string; userMsg: string; model: string; anthropicKey: string;
  sb: ReturnType<typeof createClient>; maxTokens?: number;
}): Promise<{ text: string; fromCache: boolean }> {
  const prompt = `${params.system}\n||||\n${params.userMsg}`;
  const cached = await cacheGet(params.sb, "anthropic", params.model, prompt);
  if (cached.hit && cached.text) return { text: cached.text as string, fromCache: true };
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": params.anthropicKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: params.model, max_tokens: params.maxTokens??700, system: params.system, messages: [{ role:"user", content: params.userMsg }] }),
  });
  const data = await res.json();
  const text = data.content?.[0]?.text ?? "";
  const ti = data.usage?.input_tokens??0, to = data.usage?.output_tokens??0;
  await cacheSet(params.sb, "anthropic", params.model, prompt, data, text, ti, to);
  return { text, fromCache: false };
}
async function cachedPerplexity(query: string, system: string, apiKey: string, sb: ReturnType<typeof createClient>): Promise<{ text: string; fromCache: boolean }> {
  const prompt = `${system}\n\nUSER: ${query}`;
  const cached = await cacheGet(sb, "perplexity", "sonar", prompt);
  if (cached.hit && cached.text) return { text: cached.text as string, fromCache: true };
  const res = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model:"sonar", messages:[{role:"system",content:system},{role:"user",content:query}], max_tokens:1024, temperature:0.2 }),
  });
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content ?? "";
  const ti = data.usage?.prompt_tokens??0, to = data.usage?.completion_tokens??0;
  await cacheSet(sb, "perplexity", "sonar", prompt, data, text, ti, to);
  return { text, fromCache: false };
}

// ── PERSONA PROMPTS ──
const ODRIP_SUFFIX = `\n\n━━━ OUTPUT WAJIB: FORMAT ODRIP (MAX 600 TOKEN) ━━━\nReturn ONLY valid JSON: {"signal":"...","finding":"...","action":"...","pillar":"Visibility|Discovery|Authority|Trust","odrip":{"objective":"...","depth":{"score":7,"reason":"...","sources":3,"freshness":"HOT"},"risk_reward":{"risk":2,"reward":4,"net":2,"risk_note":"...","reward_note":"..."},"impact":{"pillar":"Visibility","delta":"+10 GEO","timeframe":"7d","confidence":"B"},"priority":{"rank":"P1","effort":4,"owner":"content","kill_criterion":"net<0 7 hari"}}}. No markdown. No preamble.`;
const PERSONA_SYSTEMS: Record<PersonaId,string> = {
  ceo: `CEO/Founder: berpikir compounding effects. Temukan SATU lever yang mengubah posisi kompetitif.${ODRIP_SUFFIX}`,
  cbo: `CBO: lihat peluang revenue tersembunyi. Map channel 30 hari, score revenue potential.${ODRIP_SUFFIX}`,
  research: `Research Analyst: triangulasi sinyal. HOT(24j)|WARM(7h)|COLD(30h+). Cite sources.${ODRIP_SUFFIX}`,
  finance: `CFO/Analytics: terjemahkan GEO score ke keputusan budget. ROI tertinggi vs terendah.${ODRIP_SUFFIX}`,
  content: `Content Strategist: Hook First. Brand DNA + trending = konten yang stop scroll.${ODRIP_SUFFIX}`,
  authority: `Authority/SEO: entity clarity, topical authority ladder, AI citation optimization.${ODRIP_SUFFIX}`,
  ops: `Ops Engineer: setiap tugas manual = kegagalan imajinasi. Workflow: Trigger→Condition→Action→Fallback.${ODRIP_SUFFIX}`,
};
function buildPersonaPrompt(params: {
  personaId: PersonaId; brandName: string; category: string;
  geoScore: number; priority: string; ragContext: string; brandDNA: string;
}): { system: string; user: string } {
  const system = `${PERSONA_SYSTEMS[params.personaId]}\n\nBrand: ${params.brandName} | Category: ${params.category} | GEO: ${params.geoScore}/100 | Priority: ${params.priority} | DNA: ${params.brandDNA}${params.ragContext ? `\n\nCONTEXT:\n${params.ragContext}` : ""}`;
  const user = `Analisa brand intelligence untuk ${params.brandName} (GEO: ${params.geoScore}/100). Berikan 1 insight ODRIP. Return ONLY valid JSON.`;
  return { system, user };
}

const CYCLE_HOURS = 72;
const TASK_DEADLINE_DAYS = 7;

Deno.serve(async (req) => {
  if (req.method !== "POST" && req.method !== "GET")
    return new Response("Method not allowed", { status: 405 });

  const SUPABASE_URL   = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_KEY   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANTHROPIC_KEY  = Deno.env.get("ANTHROPIC_API_KEY")!;
  const PERPLEXITY_KEY = Deno.env.get("PERPLEXITY_API_KEY")!;
  const FONNTE_TOKEN   = Deno.env.get("FONNTE_TOKEN")!;
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  let manualBrandId: string|undefined;
  try { const b = await req.clone().json(); manualBrandId = b.brand_id; } catch {}

  let brands: (Brand & { p1: PersonaId; p2: PersonaId; p3: PersonaId; cycle_count: number })[];
  if (manualBrandId) {
    const { data } = await supabase.from("brands").select("*, brand_priorities(p1,p2,p3)").eq("id", manualBrandId).single();
    if (!data) return new Response(JSON.stringify({ ok:false, error:"Brand not found" }), { status:404 });
    const bp = (data.brand_priorities as { p1:string; p2:string; p3:string }[])?.[0] ?? {};
    brands = [{ ...data, p1: bp.p1 as PersonaId, p2: bp.p2 as PersonaId, p3: bp.p3 as PersonaId }];
  } else {
    const { data } = await supabase.rpc("get_brands_due_72h");
    brands = data ?? [];
  }

  if (brands.length === 0)
    return new Response(JSON.stringify({ ok:true, processed:0 }), { status:200, headers:{"Content-Type":"application/json"} });

  const results: { brand:string; ok:boolean; tasks:number; cacheHits:number; error?:string }[] = [];
  for (let i = 0; i < brands.length; i += 5) {
    const batch = brands.slice(i, i+5);
    const settled = await Promise.allSettled(batch.map(b =>
      run72H(b, { supabase, ANTHROPIC_KEY, PERPLEXITY_KEY, FONNTE_TOKEN })
    ));
    for (let j = 0; j < settled.length; j++) {
      const r = settled[j];
      results.push({
        brand: batch[j].name,
        ok: r.status==="fulfilled",
        tasks: r.status==="fulfilled" ? r.value.tasks : 0,
        cacheHits: r.status==="fulfilled" ? r.value.cacheHits : 0,
        error: r.status==="rejected" ? String(r.reason) : undefined,
      });
    }
  }

  return new Response(JSON.stringify({
    ok: true,
    processed:  results.filter(r=>r.ok).length,
    failed:     results.filter(r=>!r.ok).length,
    total_tasks:results.reduce((s,r)=>s+r.tasks,0),
    total_cache:results.reduce((s,r)=>s+r.cacheHits,0),
    results,
  }), { headers: { "Content-Type": "application/json" } });
});

async function run72H(
  brand: Brand & { p1:PersonaId; p2:PersonaId; p3:PersonaId; cycle_count:number },
  env: { supabase: ReturnType<typeof createClient>; ANTHROPIC_KEY:string; PERPLEXITY_KEY:string; FONNTE_TOKEN:string }
): Promise<{ tasks:number; cacheHits:number }> {
  const cycleId = `72h_${Date.now()}_${brand.id.slice(0,8)}`;
  const ranked  = [brand.p1, brand.p2, brand.p3].filter(Boolean) as PersonaId[];
  let cacheHits = 0;

  // Load pre-computed context
  const [directiveRes, dnaRes, geoRes, mlWeightsRes, ragCacheRes, patternsRes] = await Promise.allSettled([
    env.supabase.from("directive_14d").select("*").eq("brand_id",brand.id).order("created_at",{ascending:false}).limit(1).single(),
    env.supabase.from("brand_dna").select("*").eq("brand_id",brand.id).single(),
    env.supabase.from("geo_scores").select("geo_score").eq("brand_id",brand.id).order("recorded_at",{ascending:false}).limit(1).single(),
    env.supabase.from("ml_weights").select("weight_type,weight_key,weight_value").eq("brand_id",brand.id),
    env.supabase.from("rag_context_cache").select("context_text,chunk_count,generated_at,expires_at").eq("brand_id",brand.id).single(),
    env.supabase.from("learned_patterns").select("pattern_type,pattern_key,pattern_value,confidence").eq("brand_id",brand.id).order("confidence",{ascending:false}).limit(8),
  ]);

  const directive = directiveRes.status==="fulfilled" ? directiveRes.value.data : null;
  const dna       = dnaRes.status==="fulfilled"       ? dnaRes.value.data       : null;
  const geoScore  = geoRes.status==="fulfilled"       ? (geoRes.value.data?.geo_score??40) : 40;
  const mlWeights = mlWeightsRes.status==="fulfilled" ? (mlWeightsRes.value.data??[]) : [];
  const ragCache  = ragCacheRes.status==="fulfilled"  ? ragCacheRes.value.data  : null;
  const patterns  = patternsRes.status==="fulfilled" ? (patternsRes.value.data??[]) : [];

  type WeightRow = { weight_type:string; weight_key:string; weight_value:number };
  const getWeight = (type:string, key:string) => {
    const w = (mlWeights as WeightRow[]).find(w=>w.weight_type===type&&w.weight_key===key);
    return w ? +w.weight_value : 1.0;
  };

  const brandDNA = dna ? `Voice: ${dna.brand_voice??"N/A"} | USP: ${dna.usp??"N/A"}` : "Brand DNA belum tersedia";
  const ragIsValid = ragCache && ragCache.expires_at && new Date(ragCache.expires_at) > new Date();
  const ragSection = ragIsValid ? `\n\n\ud83d\udcda BRAND KNOWLEDGE (${ragCache!.chunk_count} chunks):\n${ragCache!.context_text.slice(0,1200)}` : "";
  const mlSection = patterns.length > 0 ? `\n\n\ud83e\udde0 ML PATTERNS:\n` + patterns.slice(0,4).map((p: {pattern_type:string;pattern_key:string;pattern_value:string;confidence:number}) => `\u2022 ${p.pattern_type}/${p.pattern_key}: ${p.pattern_value} (conf:${p.confidence?.toFixed(2)})`).join("\n") : "";
  const ragContext = [mlSection, ragSection].filter(Boolean).join("\n");

  const activePersonas: PersonaId[] = directive?.persona_priorities
    ? (directive.persona_priorities as {persona_id:PersonaId;rank:number}[]).filter(p=>p.rank>0&&p.rank<=3).sort((a,b)=>a.rank-b.rank).map(p=>p.persona_id)
    : ranked;

  const personaResults = await Promise.allSettled(
    activePersonas.map(async (personaId) => {
      const rank = ranked.indexOf(personaId)+1;
      const priorityLabel = (rank===1?"P1":rank===2?"P2":"P3") as "P1"|"P2"|"P3";
      const { system, user } = buildPersonaPrompt({
        personaId, brandName: brand.name,
        category: (dna as {category?:string}|null)?.category??"General",
        geoScore, priority: priorityLabel, ragContext, brandDNA,
      });
      let insight: PersonaInsight|null = null;
      let fromCache = false;
      // Research persona uses Perplexity for trend discovery (allowed in 72H cycle)
      if (personaId==="research") {
        const res = await cachedPerplexity(user, system, env.PERPLEXITY_KEY, env.supabase);
        fromCache = res.fromCache;
        try { insight = JSON.parse(res.text.replace(/```json|```/g,"").trim()); } catch {}
      } else {
        const model = personaId==="ops" ? "claude-sonnet-4-6" : "claude-opus-4-6";
        const res = await cachedClaude({ system, userMsg:user, model, anthropicKey:env.ANTHROPIC_KEY, sb:env.supabase, maxTokens:700 });
        fromCache = res.fromCache;
        try { insight = JSON.parse(res.text.replace(/```json|```/g,"").trim()); } catch {}
      }
      if (fromCache) cacheHits++;
      return { personaId, insight, rank };
    })
  );

  const insights: PersonaInsight[] = [];
  const taskInserts: Record<string,unknown>[] = [];

  for (const result of personaResults) {
    if (result.status==="rejected") continue;
    const { personaId, insight, rank } = result.value;
    if (!insight) continue;
    const meta = PERSONA_META[personaId];
    const odrip = insight.odrip as ODRIPScore;
    const net = odrip?.risk_reward?.net??0;
    const depth = odrip?.depth?.score??5;
    const { data: insightRow } = await env.supabase.from("insights").insert({
      brand_id:brand.id, cycle_id:cycleId, persona_id:personaId, persona_icon:meta.icon,
      signal:insight.signal, finding:insight.finding, action:insight.action, odrip,
    }).select("id").single();
    insights.push({ ...insight, persona_id:personaId, persona_icon:meta.icon });
    if (net>0 && depth>=4 && insightRow) {
      const pWeight = getWeight("persona_score", personaId);
      const pillarW = getWeight("pillar_priority", insight.pillar??"visibility");
      const score = net * depth * (rank===1?3:rank===2?2:1) * pWeight * pillarW;
      taskInserts.push({
        brand_id:brand.id, insight_id:insightRow.id, persona_id:personaId, persona_icon:meta.icon, persona_label:meta.label,
        priority:rank===1?"P1":rank===2?"P2":"P3", action_text:insight.action, odrip, status:"active",
        priority_score:score, pillar:insight.pillar??"visibility",
        deadline:new Date(Date.now()+TASK_DEADLINE_DAYS*86400000).toISOString(),
        ml_weight_applied: { pWeight, pillarW },
      });
      await env.supabase.from("learning_signals").insert({
        brand_id:brand.id, signal_type:"task_created",
        metadata: { persona_id:personaId, pillar:insight.pillar, priority_score:score, net, depth },
        created_at: new Date().toISOString(),
      }).catch(()=>{});
    }
  }

  await env.supabase.from("tasks").update({status:"expired",expired_at:new Date().toISOString()}).eq("brand_id",brand.id).eq("status","active").lt("deadline",new Date().toISOString());
  if (taskInserts.length>0) await env.supabase.from("tasks").insert(taskInserts);

  const healthScore = await computeHealth(brand.id, env.supabase);
  const { data: activeTasks } = await env.supabase.rpc("get_active_tasks", { p_brand_id:brand.id, p_limit:5 });
  const waMsg = buildTaskWA(brand.name, activeTasks??[], healthScore, (brand.cycle_count??0)+1, cacheHits, ragIsValid?ragCache!.chunk_count:0);
  await sendWA({ to:brand.wa_number, message:waMsg, token:env.FONNTE_TOKEN });

  const avgNet = insights.reduce((s,i)=>s+(i.odrip?.risk_reward?.net??0),0)/Math.max(insights.length,1);
  await Promise.all([
    env.supabase.from("geo_scores").insert({ brand_id:brand.id, geo_score:Math.min(100,Math.max(0,geoScore+avgNet*0.3)), recorded_at:new Date().toISOString() }),
    env.supabase.from("brands").update({ last_72h_at:new Date().toISOString(), next_72h_at:new Date(Date.now()+CYCLE_HOURS*3600000).toISOString(), cycle_count:(brand.cycle_count??0)+1 }).eq("id",brand.id),
    env.supabase.from("wa_log").insert({ brand_id:brand.id, wa_number:brand.wa_number, direction:"out", message:waMsg, processed:true, received_at:new Date().toISOString() }),
  ]);

  return { tasks: taskInserts.length, cacheHits };
}

function buildTaskWA(brandName:string, tasks:{persona_icon:string;priority:string;action_text:string;odrip:ODRIPScore;short_code:string;deadline:string}[], health:number, cycleNum:number, cacheHits:number, ragChunks:number): string {
  const icon = health>=80?"\ud83d\udfe2":health>=60?"\ud83d\udfe1":"\ud83d\udd34";
  const meta = [cacheHits>0?`\u26a1${cacheHits} cache`:"" , ragChunks>0?`\ud83d\udcda${ragChunks} chunks`:""].filter(Boolean).join(" \u00b7 ");
  const taskLines = tasks.slice(0,5).map((t,i) => {
    const net = t.odrip?.risk_reward?.net??0;
    const dead = new Date(t.deadline).toLocaleDateString("id-ID",{weekday:"short",day:"numeric",month:"short"});
    return `${i+1}\ufe0f\u20e3 [${t.priority}\u00b7${t.persona_icon}\u00b7net${net>=0?"+":""}${net}] ${t.action_text}\n   \ud83d\udcc5 ${dead} \u2192 t.gvr.id/${t.short_code}`;
  }).join("\n\n");
  return [`\ud83e\udde0 *GOD MODE \u2014 ${brandName}*`,`_Cycle #${cycleNum} \u00b7 ${icon} ${health}/100${meta?` \u00b7 ${meta}`:""}_`,"",tasks.length>0?taskLines:"_Tidak ada tasks baru._","","*DONE 1* \u00b7 *SKIP 2* \u00b7 *TUNDA 3* \u00b7 *HELP*"].filter(s=>s!=="").join("\n");
}

async function computeHealth(brandId:string, supabase:ReturnType<typeof createClient>): Promise<number> {
  const cutoff = new Date(Date.now()-14*86400000).toISOString();
  const [tR,sR,pR,gR] = await Promise.allSettled([
    supabase.from("tasks").select("status").eq("brand_id",brandId).gte("created_at",cutoff),
    supabase.from("learning_signals").select("signal_type").eq("brand_id",brandId).gte("created_at",cutoff),
    supabase.from("learned_patterns").select("confidence").eq("brand_id",brandId).gte("confidence",0.5),
    supabase.from("geo_scores").select("geo_score").eq("brand_id",brandId).order("recorded_at",{ascending:false}).limit(4),
  ]);
  const tasks    = tR.status==="fulfilled"?(tR.value.data??[]) as {status:string}[]    :[];
  const signals  = sR.status==="fulfilled"?(sR.value.data??[]) as {signal_type:string}[] :[];
  const patterns = pR.status==="fulfilled"?(pR.value.data??[]) as {confidence:number}[] :[];
  const geoRows  = gR.status==="fulfilled"?(gR.value.data??[]) as {geo_score:number}[]  :[];
  const done=tasks.filter(t=>t.status==="done").length;
  const compPts=tasks.length>0?Math.round(done/tasks.length*30):15;
  const pos=signals.filter(s=>s.signal_type.includes("done")||s.signal_type.includes("approved")).length;
  const neg=signals.filter(s=>s.signal_type.includes("skip")||s.signal_type.includes("reject")).length;
  const sigPts=signals.length>0?Math.round(Math.max(0,(pos-neg*0.5)/signals.length)*25):12;
  const avgConf=patterns.length>0?patterns.reduce((s,p)=>s+p.confidence,0)/patterns.length:0;
  const lPts=Math.round(Math.min(patterns.length/10,1)*10+avgConf*10);
  const geoDelta=geoRows.length>=2?geoRows[0].geo_score-geoRows[geoRows.length-1].geo_score:0;
  const gPts=geoDelta>=5?15:geoDelta>=2?10:geoDelta>=0?7:3;
  const score=Math.min(100,compPts+sigPts+lPts+gPts);
  await supabase.from("health_scores").upsert({
    brand_id:brandId, score,
    grade:score>=90?"A+":score>=80?"A":score>=65?"B":score>=50?"C":"F",
    trend:geoDelta>0?"\u2191":geoDelta<-2?"\u2193":"\u2192",
    components:{task_completion:compPts,signal_quality:sigPts,learning_velocity:lPts,geo_momentum:gPts},
    computed_at:new Date().toISOString(),
  },{onConflict:"brand_id"});
  return score;
}
