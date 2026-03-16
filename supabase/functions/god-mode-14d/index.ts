import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ════════════════════════════════════════════════
// GEOVERA — god-mode-14d
// Cron: every 14 days per brand (0 21 */14 * *)
// Claude Opus reads biweekly research + client priorities
// → produces 14D directive + strategic WA
// ════════════════════════════════════════════════

type PersonaId = "ceo"|"cbo"|"research"|"finance"|"content"|"authority"|"ops";
// FIX: Use correct tier names matching DB (go/pro/enterprise)
type Tier = "go"|"pro"|"enterprise";

const TIER_QA: Record<string, number> = { go:50, pro:100, enterprise:150 };
const PERSONA_META: Record<PersonaId,{icon:string;label:string}> = {
  ceo:       {icon:"\ud83d\udc54", label:"CEO / Founder"},
  cbo:       {icon:"\ud83e\udd1d", label:"Chief Business Officer"},
  research:  {icon:"\ud83d\udd2c", label:"Research & Intelligence"},
  finance:   {icon:"\ud83d\udcca", label:"Analytics & Finance"},
  content:   {icon:"\ud83c\udfa8", label:"Content Strategist"},
  authority: {icon:"\ud83c\udfc6", label:"Authority & SEO"},
  ops:       {icon:"\u26a1",       label:"Ops & Automation"},
};

async function sendWA(p:{to:string;message:string;token:string}) {
  try {
    const res = await fetch("https://api.fonnte.com/send", {
      method:"POST",
      headers:{"Authorization":p.token,"Content-Type":"application/json"},
      body:JSON.stringify({target:p.to,message:p.message,delay:0,countryCode:"62"}),
    });
    const d = await res.json();
    return d.status ? {ok:true} : {ok:false,error:d.reason};
  } catch(e) { return {ok:false,error:String(e)}; }
}

async function callOpus(system:string, user:string, key:string): Promise<Record<string,unknown>> {
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method:"POST",
      headers:{"x-api-key":key,"anthropic-version":"2023-06-01","content-type":"application/json"},
      body:JSON.stringify({model:"claude-opus-4-6",max_tokens:2000,system,messages:[{role:"user",content:user}]}),
    });
    const data = await res.json();
    const text = data.content?.[0]?.text??"{}";
    return JSON.parse(text.replace(/```json|```/g,"").trim());
  } catch { return {}; }
}

Deno.serve(async (req) => {
  if (req.method!=="POST" && req.method!=="GET") return new Response("Method not allowed",{status:405});

  const SUPABASE_URL   = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_KEY   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  const ANTHROPIC_KEY  = Deno.env.get("ANTHROPIC_API_KEY")!;
  const PERPLEXITY_KEY = Deno.env.get("PERPLEXITY_API_KEY")!;
  const FONNTE_TOKEN   = Deno.env.get("FONNTE_TOKEN")!;

  let manualBrandId: string|undefined;
  try { const b = await req.clone().json(); manualBrandId = b.brand_id; } catch {}

  let brands: {brand_id:string;brand_name:string;wa_number:string;tier:Tier;p1:PersonaId;p2:PersonaId;p3:PersonaId}[];
  if (manualBrandId) {
    const {data} = await supabase.from("brands").select("id,name,wa_number,tier,brand_priorities(p1,p2,p3)").eq("id",manualBrandId).single();
    if (!data) return new Response(JSON.stringify({ok:false,error:"Brand not found"}),{status:404});
    const bp = (data.brand_priorities as {p1:string;p2:string;p3:string}[])?.[0]??{};
    brands = [{brand_id:data.id,brand_name:data.name,wa_number:data.wa_number,tier:data.tier,p1:bp.p1 as PersonaId,p2:bp.p2 as PersonaId,p3:bp.p3 as PersonaId}];
  } else {
    const {data} = await supabase.rpc("get_brands_due_14d");
    brands = data??[];
  }

  if (!brands||brands.length===0) return new Response(JSON.stringify({ok:true,processed:0}),{status:200,headers:{"Content-Type":"application/json"}});

  const results = await Promise.allSettled(brands.map(b => run14D(b,{supabase,ANTHROPIC_KEY,PERPLEXITY_KEY,FONNTE_TOKEN,SUPABASE_URL,SUPABASE_KEY})));
  return new Response(JSON.stringify({
    ok:true,
    processed: results.filter(r=>r.status==="fulfilled").length,
    failed:    results.filter(r=>r.status==="rejected").length,
  }),{status:200,headers:{"Content-Type":"application/json"}});
});

async function run14D(
  brand:{brand_id:string;brand_name:string;wa_number:string;tier:Tier;p1:PersonaId;p2:PersonaId;p3:PersonaId},
  env:{supabase:ReturnType<typeof createClient>;ANTHROPIC_KEY:string;PERPLEXITY_KEY:string;FONNTE_TOKEN:string;SUPABASE_URL:string;SUPABASE_KEY:string}
): Promise<void> {
  const {supabase} = env;
  const brandId = brand.brand_id;
  const period  = 14;
  const since   = new Date(Date.now()-period*86400000).toISOString();

  // Gather 14D data
  const [insightsRes,tasksRes,geoRes,prioritiesRes] = await Promise.allSettled([
    supabase.from("insights").select("persona_id,signal,finding,action,odrip,created_at").eq("brand_id",brandId).gte("created_at",since).order("created_at",{ascending:false}).limit(50),
    supabase.from("tasks").select("status,persona_id,priority_score").eq("brand_id",brandId).gte("created_at",since),
    supabase.from("geo_scores").select("geo_score,recorded_at").eq("brand_id",brandId).order("recorded_at",{ascending:false}).limit(10),
    supabase.from("brand_priorities").select("p1,p2,p3").eq("brand_id",brandId).single(),
  ]);

  const insights   = insightsRes.status==="fulfilled"   ? (insightsRes.value.data??[])   : [];
  const tasks      = tasksRes.status==="fulfilled"      ? (tasksRes.value.data??[])       : [];
  const geoRows    = geoRes.status==="fulfilled"        ? (geoRes.value.data??[])         : [];
  const priorities = prioritiesRes.status==="fulfilled" ? prioritiesRes.value.data        : null;

  const p1 = (priorities?.p1??brand.p1??"content") as PersonaId;
  const p2 = (priorities?.p2??brand.p2??"authority") as PersonaId;
  const p3 = (priorities?.p3??brand.p3??"research") as PersonaId;
  const ranked: [string,string,string] = [p1,p2,p3];

  const geoStart = (geoRows as {geo_score:number}[])[geoRows.length-1]?.geo_score??40;
  const geoEnd   = (geoRows as {geo_score:number}[])[0]?.geo_score??geoStart;
  const done     = (tasks as {status:string}[]).filter(t=>t.status==="done").length;
  const total    = tasks.length;

  const {data:prevDirective} = await supabase.from("directive_14d").select("active_chains,new_chains").eq("brand_id",brandId).single();
  const activeChains = [...((prevDirective?.active_chains??[]) as string[]),...((prevDirective?.new_chains??[]) as string[])];

  // Biweekly research — FIX: use correct tier names (pro/enterprise instead of premium/partner)
  let researchSummary = "";
  if ((brand.tier==="pro"||brand.tier==="enterprise") && env.PERPLEXITY_KEY) {
    const platforms = ["ChatGPT","Google AI","Perplexity","Bing AI","Gemini"];
    const results: string[] = [];
    for (const [i,plat] of platforms.entries()) {
      try {
        const res = await fetch("https://api.perplexity.ai/chat/completions",{
          method:"POST",
          headers:{"Authorization":`Bearer ${env.PERPLEXITY_KEY}`,"Content-Type":"application/json"},
          body:JSON.stringify({model:"sonar",max_tokens:300,messages:[{role:"system",content:"Jawab faktual dan singkat."},{role:"user",content:`Apakah ${plat} menyebut atau merekomendasikan "${brand.brand_name}" ketika pengguna bertanya tentang produk/layanan di kategorinya?`}]}),
        });
        const d = await res.json();
        const text = d.choices?.[0]?.message?.content??"";
        const mentioned = text.toLowerCase().includes(brand.brand_name.toLowerCase());
        results.push(`[${plat}] ${mentioned?"\u2705 MENTIONED":"\u274c NOT FOUND"}: ${text.slice(0,100)}`);
        await supabase.from("research_signals").insert({brand_id:brandId,platform:platforms[i].toLowerCase().replace(" ","_"),finding:text.slice(0,500),brand_mentioned:mentioned,sentiment:mentioned?"positive":"neutral",position:mentioned?"early":"not_mentioned",freshness:"HOT",recorded_at:new Date().toISOString()}).catch(()=>{});
      } catch { results.push(`[${plat}] Error`); }
    }
    researchSummary = results.join("\n");
  }

  // Build insights block
  const insightBlock = (insights as {persona_id:string;signal:string;action:string;odrip:{risk_reward:{net:number};impact:{confidence:string}}}[]).slice(0,10)
    .map(i=>`[${i.persona_id}|net:${i.odrip?.risk_reward?.net??0}|conf:${i.odrip?.impact?.confidence??"B"}] ${i.signal?.slice(0,80)} \u2192 ${i.action?.slice(0,60)}`).join("\n");

  // Call Claude Opus — Divine Orchestrator
  const opusSystem = `Anda adalah THE DIVINE ORCHESTRATOR \u2014 lapisan kecerdasan tertinggi GeoVera GOD MODE.\n\nBuat keputusan strategis SETIAP 14 HARI berdasarkan:\n1. CLIENT PRIORITY \u2014 persona yang dipilih client (TIDAK BOLEH diabaikan diam-diam)\n2. DATA \u2014 14 hari hasil ODRIP, outcomes, biweekly research\n\nATURAN:\n\u2022 Client priority P1 SELALU berjalan setiap 72H\n\u2022 Jika data bertentangan \u2192 FLAG dengan data, BUKAN override\n\u2022 BUILD momentum chains yang sedang berjalan\n\u2022 TUTUP chains yang tidak bergerak dalam 14 hari\n\nReturn ONLY valid JSON. No markdown.`;

  const opusUser = `Brand: ${brand.brand_name}\nPeriod: ${period} hari | GEO: ${geoStart} \u2192 ${geoEnd} (${geoEnd-geoStart>=0?"+":""}${(geoEnd-geoStart).toFixed(1)})\n\nCLIENT PRIORITIES:\nP1: ${ranked[0]} | P2: ${ranked[1]} | P3: ${ranked[2]}\n\nINSIGHTS:\n${insightBlock||"Belum ada insights"}\n\nACTIVE CHAINS:\n${activeChains.length>0?activeChains.map(c=>`\u2022 ${c}`).join("\n"):"Belum ada"}\n\nBIWEEKLY RESEARCH:\n${researchSummary||"Tidak tersedia (Go tier)"}\n\nReturn JSON: {"one_sentence":"...","momentum":"accelerating|steady|stalling|reversing","confidence":"A+|A|B|C","persona_priorities":[{"persona_id":"...","rank":1,"client_requested":true,"evidence_aligned":true,"flag":null,"focus_areas":["..."],"kill_criterion":"...","cycle_frequency":"72h|7d|14d"}],"active_chains":["..."],"new_chains":["..."],"closed_chains":[],"conflicts":[{"personas":[],"conflict":"...","resolution":"...","flag_to_client":false}],"opus_reasoning":"...","data_confidence":"A+|A|B|C"}`;

  const parsed = await callOpus(opusSystem, opusUser, env.ANTHROPIC_KEY);

  // Enforce client priorities
  const allPersonas: PersonaId[] = ["ceo","cbo","research","finance","content","authority","ops"];
  const parsedPriorities = (parsed.persona_priorities as Record<string,unknown>[]|undefined)??[];
  const qaTotal = TIER_QA[brand.tier]??50; const qaP1=Math.round(qaTotal*0.40); const qaP2=Math.round(qaTotal*0.35); const qaP3=qaTotal-qaP1-qaP2;
  const priorities2 = allPersonas.map(pid=>{
    const existing = parsedPriorities.find(p=>p.persona_id===pid);
    const clientRank = ranked.indexOf(pid)+1;
    const isClient = clientRank>0;
    let rank = (existing?.rank as number)??0;
    if (isClient&&rank===0) rank=clientRank;
    const qa = rank===1?qaP1:rank===2?qaP2:rank===3?qaP3:0;
    const freq = rank===1?"72h":rank===2?"72h":rank===3?"7d":"14d";
    const depth = rank===1?"deep":rank===2?"standard":rank===3?"light":"skip";
    return {persona_id:pid,persona_icon:PERSONA_META[pid as PersonaId].icon,rank,client_requested:isClient,evidence_aligned:(existing?.evidence_aligned as boolean)??true,flag:(existing?.flag as string|null)??null,qa_slots:qa,focus_areas:(existing?.focus_areas as string[])??["Continue current strategy"],kill_criterion:(existing?.kill_criterion as string)??"ODRIP net < 0 selama 7 hari",analysis_depth:depth,cycle_frequency:freq};
  });

  const directive = {
    one_sentence:      (parsed.one_sentence as string)??`Fokus pada ${ranked[0]} strategy`,
    momentum:          (parsed.momentum as string)??"steady",
    confidence:        (parsed.confidence as string)??"B",
    persona_priorities:priorities2,
    active_chains:     (parsed.active_chains as string[])??[],
    new_chains:        (parsed.new_chains as string[])??[],
    closed_chains:     (parsed.closed_chains as unknown[])??[],
    conflicts:         (parsed.conflicts as unknown[])??[],
    opus_reasoning:    (parsed.opus_reasoning as string)??"Directive generated by Claude Opus.",
    data_confidence:   (parsed.data_confidence as string)??"B",
  };

  // Save directive
  const directiveId = `dir_${Date.now()}_${brandId.slice(0,8)}`;
  const expiresAt   = new Date(Date.now()+14*86400000).toISOString();
  await supabase.from("directive_14d").upsert({
    brand_id:brandId,directive_id:directiveId,one_sentence:directive.one_sentence,momentum:directive.momentum,
    confidence:directive.confidence,persona_priorities:directive.persona_priorities,active_chains:directive.active_chains,
    conflicts:directive.conflicts??[],qa_count:qaTotal,opus_reasoning:directive.opus_reasoning,
    data_confidence:directive.data_confidence,created_at:new Date().toISOString(),expires_at:expiresAt,
  },{onConflict:"brand_id"});

  // Save report
  await supabase.from("biweekly_reports").insert({
    brand_id:brandId,report_id:`rpt_${Date.now()}_${brandId.slice(0,8)}`,
    period_start:new Date(since).toISOString(),period_end:new Date().toISOString(),
    tier:brand.tier,geo_start:geoStart,geo_end:geoEnd,geo_delta:geoEnd-geoStart,
    momentum:directive.momentum,
    report_data:{task_completion:total>0?done/total:0,total_tasks:total,done_tasks:done,top_insight:(insights as {action:string}[])[0]?.action??"",active_chains:directive.active_chains,new_chains:directive.new_chains,closed_chains:directive.closed_chains,conflicts:directive.conflicts,research_summary:researchSummary},
  }).catch(()=>{});

  // Update brand timing — FIX: trigger 72H immediately via fetch instead of setTimeout
  // setTimeout is unreliable in 150s edge function limit
  await supabase.from("brands").update({last_14d_at:new Date().toISOString(),next_14d_at:expiresAt,next_72h_at:new Date(Date.now()+2*60000).toISOString()}).eq("id",brandId);

  // WA directive summary
  const icons: Record<string,string> = {accelerating:"\ud83d\ude80",steady:"\ud83d\udcc8",stalling:"\u26a0\ufe0f",reversing:"\ud83d\udd3b"};
  const geoDelta = geoEnd-geoStart;
  const compPct  = total>0?Math.round(done/total*100):0;
  const activeP  = (directive.persona_priorities as {rank:number;persona_icon:string;persona_id:string;cycle_frequency:string;flag:string|null}[]).filter(p=>p.rank>0&&p.rank<=3).sort((a,b)=>a.rank-b.rank);
  const personaLines = activeP.map(p=>{
    const freq = p.cycle_frequency==="72h"?"tiap 72j":p.cycle_frequency==="7d"?"tiap 7h":"tiap 14h";
    return `P${p.rank} ${p.persona_icon} ${p.persona_id} [${freq}]${p.flag?`\n   \u26a1 ${p.flag}`:""}`;
  }).join("\n");
  const waMsg = [
    `\ud83e\udde0 *GOD MODE 14D Directive \u2014 ${brand.brand_name}*`,"",
    `${icons[directive.momentum]??"\ud83d\udcca"} *${directive.one_sentence}*`,
    `Confidence: ${directive.confidence} | Data: ${directive.data_confidence}`,"",
    `\ud83d\udcca *14 Hari Terakhir:*`,
    `GEO: ${geoStart} \u2192 ${geoEnd} (${geoDelta>=0?"+":""}${geoDelta.toFixed(1)} poin)`,
    `Tasks: ${done}/${total} selesai (${compPct}%)`,"",
    `\ud83d\udc65 *Persona Aktif:*`,personaLines,"",
    `\ud83d\udca1 *Reasoning:* ${directive.opus_reasoning}`,"",
    `\u2705 GOD MODE 72H dijadwalkan dalam 2 menit.`,
    `Ketik *STATUS* untuk health score terkini.`,
  ].filter(s=>s!==undefined).join("\n");

  await sendWA({to:brand.wa_number,message:waMsg,token:env.FONNTE_TOKEN});
  await supabase.from("wa_log").insert({brand_id:brandId,wa_number:brand.wa_number,direction:"out",message:waMsg,processed:true,received_at:new Date().toISOString()}).catch(()=>{});

  // FIX: Fire 72H engine via direct fetch (no setTimeout — unreliable in 150s edge limit)
  // The brand's next_72h_at is set to +2min, so the cron scheduler will pick it up.
  // For immediate trigger, fire-and-forget fetch:
  fetch(`${env.SUPABASE_URL}/functions/v1/god-mode-72h`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${env.SUPABASE_KEY}` },
    body: JSON.stringify({ brand_id: brandId }),
  }).catch(() => {});
}
