import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// wa-receive v24 — Security: block unregistered WA numbers

const BASE_URL   = 'https://vozjwptzutolvkvfpknk.supabase.co/functions/v1';
const FONNTE_URL = 'https://api.fonnte.com/send';

async function sendWA(to: string, message: string, token: string) {
  try {
    const isGroup = to.includes('@g.us') || to.includes('-');
    const params: Record<string, string> = { target: to, message, delay: '0' };
    if (!isGroup) params.countryCode = '62';
    const res = await fetch(FONNTE_URL, { method: 'POST', headers: { Authorization: token, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params).toString() });
    console.log(`[sendWA] to:${to} status:${res.status}`);
  } catch (e) { console.error('sendWA error:', e); }
}

function resolveToken(stored: string | null, fallback: string): string {
  if (!stored) return fallback;
  if (/^[A-Z][A-Z0-9_]+$/.test(stored)) return Deno.env.get(stored) ?? fallback;
  return stored;
}

function parseCommand(text: string): { cmd: string; arg?: string; num?: number } {
  // Strip ALL @ mentions from start: "@Geovera help" → "help", "@114xxx buat artikel X" → "buat artikel X"
  const cleaned = text.trim().replace(/^(@\S+\s*)+/i, '').trim();
  const t = cleaned || text.trim(); const tup = t.toUpperCase();
  if (/^(DONE|D)\s*(\d+)$/i.test(t))  { const m = t.match(/(\d+)/); return { cmd: 'DONE',  num: m ? parseInt(m[1]) : undefined }; }
  if (/^\d+$/.test(t))                 return { cmd: 'DONE',  num: parseInt(t) };
  if (/^(SKIP|S)\s*(\d+)$/i.test(t))  { const m = t.match(/(\d+)/); return { cmd: 'SKIP',  num: m ? parseInt(m[1]) : undefined }; }
  if (/^(TUNDA|T)\s*(\d+)$/i.test(t)) { const m = t.match(/(\d+)/); return { cmd: 'TUNDA', num: m ? parseInt(m[1]) : undefined }; }
  if (/^APPROVE(\s+[A-Z0-9]+)?$/i.test(t)) { const m = t.match(/APPROVE\s+([A-Z0-9]+)/i); return { cmd: 'APPROVE', arg: m ? m[1].toUpperCase() : undefined }; }
  if (/^(REJECT|TOLAK)(\s+.*)?$/i.test(t)) { const m = t.match(/(?:REJECT|TOLAK)\s*(.*)/i); return { cmd: 'REJECT', arg: m?.[1]?.trim() || 'Tidak sesuai' }; }
  if (/^(REVISI|REVISE)(\s+.*)?$/i.test(t)) { const m = t.match(/(?:REVISI|REVISE)\s*(.*)/i); return { cmd: 'REVISI', arg: m?.[1]?.trim() || '' }; }
  if (/^QUEUE(\s+.*)?$/i.test(t)) return { cmd: 'QUEUE' };
  if (/^LAPORAN(\s+.*)?$/i.test(t)) return { cmd: 'LAPORAN' };
  // Content generation — very flexible: "buat artikel X", "buatkan saya 3 artikel X", "artikel X"
  // Pattern: optional prefix (buatkan/buat + optional words + optional number) + keyword + topic
  if (/\b(ARTIKEL|ARTICLE)\b/i.test(t)) { const m = t.match(/\b(?:ARTIKEL|ARTICLE)\s+(.+)/i); if (m) return { cmd: 'GEN_ARTICLE', arg: m[1].trim() }; }
  if (/\b(GAMBAR|IMAGE)\b/i.test(t)) { const m = t.match(/\b(?:GAMBAR|IMAGE)\s+(.+)/i); if (m) return { cmd: 'GEN_IMAGE', arg: m[1].trim() }; }
  if (/\b(VIDEO)\b/i.test(t) && !/^(DONE|SKIP|TUNDA|APPROVE|REJECT)/i.test(t)) { const m = t.match(/\bVIDEO\s+(.+)/i); if (m) return { cmd: 'GEN_VIDEO', arg: m[1].trim() }; }
  if (tup === 'HELP' || tup === 'BANTUAN') return { cmd: 'HELP' };
  if (tup === 'STATUS' || tup === 'STAT')  return { cmd: 'STATUS' };
  if (tup === 'TASKS' || tup === 'LIST')   return { cmd: 'TASKS' };
  return { cmd: 'UNKNOWN' };
}

function isAgentMsg(msg: string, botPrefix: string, internalIds: string[], demoMode: boolean, isGroup: boolean): boolean {
  if (demoMode && isGroup) return true;
  if (new RegExp(`@${botPrefix}`, 'i').test(msg)) return true;
  if (/@geovera/i.test(msg)) return true;
  for (const id of internalIds) { if (id && msg.includes(`@${id}`)) return true; }
  const EMOJIS = ['\u274c','\u23f0','\u23ed\ufe0f','\u2705','\ud83d\udc4d','\ud83d\udd34'];
  if (EMOJIS.includes(msg.trim())) return false;
  if (msg.trim().length > 10) { const { cmd } = parseCommand(msg); if (cmd === 'UNKNOWN') return true; }
  return false;
}

/** Check if WA number is authorized for this brand */
async function isAuthorized(supabase: ReturnType<typeof createClient>, brandId: string, waNumber: string): Promise<{ authorized: boolean; name: string; role: string }> {
  // Check brand_users first (primary auth table)
  const { data: bu } = await supabase
    .from('brand_users')
    .select('name, role, is_active')
    .eq('brand_id', brandId)
    .eq('wa_number', waNumber)
    .eq('is_active', true)
    .maybeSingle();
  if (bu) return { authorized: true, name: bu.name || waNumber, role: bu.role || 'viewer' };

  // Fallback: check wa_group_members
  const { data: wgm } = await supabase
    .from('wa_group_members')
    .select('name, role, is_active')
    .eq('brand_id', brandId)
    .eq('wa_number', waNumber)
    .eq('is_active', true)
    .maybeSingle();
  if (wgm) return { authorized: true, name: wgm.name || waNumber, role: wgm.role || 'viewer' };

  // Check if this is the brand owner's WA number
  const { data: brand } = await supabase
    .from('brands')
    .select('wa_number')
    .eq('id', brandId)
    .maybeSingle();
  if (brand?.wa_number === waNumber) return { authorized: true, name: 'Owner', role: 'owner' };

  return { authorized: false, name: '', role: '' };
}

Deno.serve(async (req) => {
  if (req.method === 'GET') return new Response(JSON.stringify({ ok: true, service: 'wa-receive v25' }), { headers: { 'Content-Type': 'application/json' } });
  // ★ READ BODY BEFORE returning — body becomes unavailable after Response is sent
  let p: Record<string, unknown> = {};
  try { const raw = await req.text(); try { p = JSON.parse(raw); } catch { p = Object.fromEntries(new URLSearchParams(raw)); } } catch { return new Response('PARSE_FAIL'); }
  // DEBUG MODE: run synchronously and return result
  const debugMode = req.headers.get('x-debug') === 'true';
  if (debugMode) {
    try {
      const result = await handleMessage(p);
      return new Response(JSON.stringify({ ok: true, debug: result, keys: Object.keys(p) }), { headers: { 'Content-Type': 'application/json' } });
    } catch (e: unknown) {
      return new Response(JSON.stringify({ ok: false, error: (e as Error).message, stack: (e as Error).stack, keys: Object.keys(p) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
  }
  const promise = handleMessage(p).catch(e => console.error('wa-receive err:', e));
  // @ts-ignore
  if (typeof EdgeRuntime !== 'undefined') { EdgeRuntime.waitUntil(promise); }
  return new Response('OK', { status: 200 });
});

async function handleMessage(p: Record<string, unknown>) {
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const FONNTE_TOKEN = Deno.env.get('FONNTE_TOKEN')!;


  const rawIsGroup  = p.isgroup ?? p.isGroup ?? p.is_group ?? false;
  const isGroup     = rawIsGroup === true || rawIsGroup === 'true' || rawIsGroup === '1';
  const senderField = String(p.sender ?? p.pengirim ?? '');
  const memberField = String(p.member ?? p.from ?? '');
  const waNumber    = isGroup ? memberField.replace(/[^0-9]/g, '') : senderField.replace(/[^0-9]/g, '');
  const replyTo     = isGroup ? senderField : waNumber;
  const message     = String(p.message ?? p.pesan ?? p.text ?? p.msg ?? '');
  const message_id  = String(p.id ?? p.inboxid ?? '');
  const deviceNumber = String(p.device ?? '').replace(/[^0-9]/g, '');

  console.log(`[recv] isGroup:${isGroup} from:${waNumber} replyTo:${replyTo} device:${deviceNumber} msg:"${message.slice(0,60)}" raw_keys:${Object.keys(p).join(',')}`);
  if (!waNumber || !message) return;

  // ★ GROUP RULE: Only process messages with "@" mention — ignore everything else
  if (isGroup && !message.includes('@')) { console.log('[skip] No @ mention in group'); return; }

  // ★ ANTI-LOOP: Skip Fonnte status callbacks (no real message content)
  const rawStatus = String(p.status ?? '');
  if (rawStatus && ['sent','delivered','read','failed','pending'].includes(rawStatus.toLowerCase())) { console.log(`[skip] Fonnte status: ${rawStatus}`); return; }
  // Skip if fromMe/self flag is set (Fonnte echo indicator)
  if (p.fromMe === true || p.fromMe === 'true' || p.self === true || p.self === 'true') { console.log('[skip] fromMe echo'); return; }

  const { data: allDevices } = await supabase.from('wa_devices').select('device_number, fonnte_token, brand_id, forced_agent, group_only, wa_internal_id, demo_mode, is_active').eq('is_active', true);
  const allDeviceNums = (allDevices ?? []).map(d => String(d.device_number));

  // ★ ANTI-LOOP: Ignore echoes — sender matches any bot device number
  if (!isGroup && allDeviceNums.includes(waNumber)) { console.log(`[skip] Bot device echo: ${waNumber}`); return; }
  // Ignore Fonnte signature echoes (bot replies bounced back as incoming)
  if (message.includes('fonnte.com') || message.includes('Sent via fonnte')) { console.log('[skip] Fonnte signature echo'); return; }
  // Ignore bot-generated message patterns (emoji + formatting = bot reply echo)
  const BOT_PATTERNS = ['_Sedang generate', '✅ *', '❌ Gagal', '🧠 *', '📝 *', '🎨 *', '🎬 *', '📊 _Sedang', '🔔 *@Geovera'];
  if (BOT_PATTERNS.some(pat => message.includes(pat))) { console.log('[skip] Bot pattern echo'); return; }
  const devices     = (allDevices ?? []) as Array<Record<string, unknown>>;
  const dev         = devices.find(d => d.device_number === deviceNumber) || devices[0];
  const token       = resolveToken(dev?.fonnte_token as string | null, FONNTE_TOKEN);
  const internalIds = devices.map(d => d.wa_internal_id as string).filter(Boolean);
  const demoMode    = dev?.demo_mode === true;

  const m0 = message.match(/@(\d{10,})/);
  if (isGroup && m0 && dev && !dev.wa_internal_id) { supabase.from('wa_devices').update({ wa_internal_id: m0[1] }).eq('device_number', deviceNumber); internalIds.push(m0[1]); }

  // Master admin commands (always allowed)
  const { data: admin } = await supabase.from('master_admins').select('wa_number').eq('wa_number', waNumber).eq('is_active', true).maybeSingle();
  if (admin) {
    const upper = message.trim().toUpperCase();
    const isCmd = ['ONBOARD ','STATUS ONBOARD','COMPLETE ONBOARD','CANCEL ONBOARD','LIST BRANDS','BRANDS','HELP ADMIN','ADMIN HELP'].some(k => upper.startsWith(k));
    if (isCmd) { fetch(`${BASE_URL}/wa-master-admin`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message, admin_wa_number: waNumber, group_wa_number: replyTo }) }); return; }
  }

  let brandId = '', brandName = '', botPrefix = 'Geovera', groupOnly = true;
  if (dev) {
    brandId   = dev.brand_id as string;
    groupOnly = dev.group_only !== false;
    const { data: b } = await supabase.from('brands').select('name, bot_prefix').eq('id', brandId).maybeSingle();
    brandName = (b?.name as string) ?? ''; botPrefix = (b?.bot_prefix as string) || 'Geovera';
  }
  if (!brandId) {
    const { data: ob } = await supabase.from('brands').select('id, name, bot_prefix').eq('wa_number', waNumber).maybeSingle();
    if (ob) { brandId = ob.id as string; brandName = ob.name as string; botPrefix = (ob.bot_prefix as string) || 'Geovera'; }
    else {
      const { data: mb } = await supabase.from('wa_group_members').select('brand_id').eq('wa_number', waNumber).eq('is_active', true).maybeSingle();
      if (mb) { brandId = mb.brand_id as string; const { data: b } = await supabase.from('brands').select('name, bot_prefix').eq('id', brandId).maybeSingle(); brandName = (b?.name as string) ?? ''; botPrefix = (b?.bot_prefix as string) || 'Geovera'; }
    }
  }
  if (!brandId) { console.log('Brand not found:', waNumber); return; }

  // ★ SECURITY: Check if WA number is authorized for this brand
  const auth = await isAuthorized(supabase, brandId, waNumber);
  if (!auth.authorized && !admin) {
    console.log(`[BLOCKED] Unregistered number ${waNumber} for brand ${brandId}`);
    await supabase.from('wa_log').insert({
      brand_id: brandId, wa_number: waNumber, direction: 'in',
      message: message.slice(0,500), processed: false, command: 'blocked_unregistered',
      device_number: deviceNumber||null, group_id: isGroup?replyTo:null,
      received_at: new Date().toISOString(),
    });
    // Silently ignore — don't reveal that the bot exists to unauthorized users
    return;
  }

  const memberName = auth.name;
  const memberRole = auth.role;

  if (groupOnly && !isGroup && !demoMode) {
    await supabase.from('wa_log').insert({ brand_id: brandId, wa_number: waNumber, direction: 'in', message: message.slice(0,500), processed: false, command: 'private_ignored', device_number: deviceNumber||null, group_id: null, received_at: new Date().toISOString() });
    return;
  }
  await supabase.from('wa_log').insert({ brand_id: brandId, wa_number: waNumber, direction: 'in', message: message.slice(0,500), processed: false, device_number: deviceNumber||null, group_id: isGroup?replyTo:null, received_at: new Date().toISOString() });

  const { cmd, arg, num } = parseCommand(message);
  const useAgent = isAgentMsg(message, botPrefix, internalIds, demoMode, isGroup);

  if (useAgent && cmd === 'UNKNOWN') {
    const routerRes = await fetch(`${BASE_URL}/wa-router`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message, wa_number: waNumber, brand_id: brandId, brand_name: brandName, message_id }) });
    if (!routerRes.ok) { console.error('Router error:', routerRes.status); return; }
    const routing = await routerRes.json();
    console.log(`[router] agent:${routing.agent}`);
    if (!routing.ok || routing.agent === 'none') return;
    const ep: Record<string,string> = { ai:`${BASE_URL}/geovera-ai`, analytic:`${BASE_URL}/geovera-analytic`, social:`${BASE_URL}/geovera-social`, alert:`${BASE_URL}/geovera-alert`, ops:`${BASE_URL}/geovera-ops` };
    const endpoint = ep[routing.agent] ?? '';
    if (!endpoint) { await sendWA(replyTo, `@${botPrefix}${routing.agent} dalam pengembangan.`, token); return; }
    const ar = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ brand_id: brandId, brand_name: brandName, wa_number: waNumber, member_name: memberName, member_role: memberRole, message, clean_message: routing.clean_message || message, intent: routing.intent, persona_hint: routing.persona_hint, is_question: routing.is_question, thread_id: routing.thread_id, last_context: routing.last_context, urgency: routing.urgency }) });
    const ad = await ar.json();
    if (!ar.ok || !ad.ok || !ad.wa_message) { await sendWA(replyTo, `Error: ${ad.error ?? 'gagal'}`, token); return; }
    await sendWA(replyTo, ad.wa_message, token);
    await supabase.from('wa_log').insert({ brand_id: brandId, wa_number: waNumber, direction: 'out', message: ad.wa_message.slice(0,500), command: `agent:${routing.agent}`, device_number: deviceNumber||null, group_id: isGroup?replyTo:null, processed: true, received_at: new Date().toISOString() });
    return;
  }

  let reply = '';

  // ★ CONTENT GENERATION — Article, Image, Video via content-studio-handler
  if (cmd === 'GEN_ARTICLE' || cmd === 'GEN_IMAGE' || cmd === 'GEN_VIDEO') {
    const actionMap: Record<string,{action:string,emoji:string,label:string}> = {
      GEN_ARTICLE: { action: 'generate_article', emoji: '\ud83d\udcdd', label: 'artikel' },
      GEN_IMAGE:   { action: 'generate_image',   emoji: '\ud83c\udfa8', label: 'gambar' },
      GEN_VIDEO:   { action: 'video_pipeline_start', emoji: '\ud83c\udfac', label: 'video' },
    };
    const { action, emoji, label } = actionMap[cmd];
    const prompt = arg || brandName;
    const waitMsg = cmd === 'GEN_VIDEO'
      ? `${emoji} _Sedang generate ${label}: "${prompt.slice(0,80)}"..._\n\n_Video pipeline: Scene Director → Flux Schnell → Quality Gate → Flux Dev → Runway Gen4 → Smart Loop.\nEstimasi 3-5 menit. Hasil akan dikirim otomatis ke group ini._`
      : `${emoji} _Sedang generate ${label}: "${prompt.slice(0,80)}"..._\n\n_Mohon tunggu, proses ini memakan waktu beberapa menit._`;
    await sendWA(replyTo, waitMsg, token);

    // Fire-and-forget to content-studio-handler
    const csPayload: Record<string, unknown> = {
      action,
      brand_id: brandId,
      prompt,
      wa_callback: replyTo,
      wa_token: token,
      requested_by: memberName || waNumber,
    };
    if (cmd === 'GEN_ARTICLE') {
      // Handler expects 'topic' — set explicitly for compatibility
      csPayload.topic = prompt;
      csPayload.objective = 'random';
      csPayload.length = 'medium';
    }
    if (cmd === 'GEN_IMAGE') {
      csPayload.aspect_ratio = '1:1';
      csPayload.num_images = 1;
    }
    if (cmd === 'GEN_VIDEO') {
      csPayload.aspect_ratio = '16:9';
    }

    const svcKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const csUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/content-studio-handler`;
    fetch(csUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${svcKey}`, 'apikey': svcKey },
      body: JSON.stringify(csPayload),
    }).then(async (res) => {
      const result = await res.json().catch(() => ({}));
      const fnErr = res.ok ? null : { message: result.error || `HTTP ${res.status}` };
      if (!fnErr && result && result.ok !== false) {
        const Label = label.charAt(0).toUpperCase() + label.slice(1);
        let successMsg = `${emoji} *${Label} berhasil di-generate!*`;
        // Only send URLs — never dump full content into WA
        if (result.url) successMsg += `\n\n\ud83d\udd17 ${result.url}`;
        if (result.article_url) successMsg += `\n\n\ud83d\udd17 ${result.article_url}`;
        if (result.images && Array.isArray(result.images) && result.images.length > 0) {
          successMsg += `\n\n\ud83d\uddbc *${result.images.length} gambar:*`;
          result.images.slice(0, 4).forEach((img: Record<string,string>, i: number) => {
            if (img?.url) successMsg += `\n${i+1}. ${img.url}`;
          });
          if (result.images.length > 4) successMsg += `\n_...dan ${result.images.length - 4} lainnya_`;
        }
        if (result.video_url) successMsg += `\n\n\ud83c\udfac ${result.video_url}`;
        if (result.job_id) successMsg += `\n\n\u23f3 _Video sedang diproses (${result.job_id}), akan dikirim setelah selesai._`;
        if (!result.url && !result.article_url && !result.images && !result.video_url && !result.job_id) {
          successMsg += `\n\n_Konten tersimpan di dashboard._`;
        }
        await sendWA(replyTo, successMsg, token);
      } else {
        const errMsg = fnErr?.message || (result && (result.error || result.message)) || 'Unknown error';
        await sendWA(replyTo, `\u274c Gagal generate ${label}: ${errMsg}`, token);
      }
    }).catch(async (err: Error) => {
      await sendWA(replyTo, `\u274c Error generate ${label}: ${err.message}`, token);
    });

    await supabase.from('wa_log').insert({ brand_id: brandId, wa_number: waNumber, direction: 'out', message: `[${cmd}] ${prompt.slice(0,200)}`, command: cmd.toLowerCase(), device_number: deviceNumber||null, group_id: isGroup?replyTo:null, processed: true, received_at: new Date().toISOString() });
    return;
  }

  // ★ LAPORAN — generate & kirim PDF sebagai attachment
  if (cmd === 'LAPORAN') {
    await sendWA(replyTo, `\ud83d\udcca _Sedang generate laporan PDF untuk *${brandName}*..._`, token);
    fetch(`${BASE_URL}/wa-report-pdf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brand_id: brandId, target: replyTo }),
    });
    await supabase.from('wa_log').insert({ brand_id: brandId, wa_number: waNumber, direction: 'out', message: `[PDF] Generating report for ${brandName}`, command: 'laporan', device_number: deviceNumber||null, group_id: isGroup?replyTo:null, processed: true, received_at: new Date().toISOString() });
    return;
  }

  if (cmd === 'APPROVE') {
    let q: Record<string,unknown>|null = null;
    if (arg) { const {data} = await supabase.from('wa_social_queue').select('*').eq('brand_id',brandId).eq('queue_ref',arg).eq('status','draft').maybeSingle(); q=data as Record<string,unknown>|null; }
    else { const {data} = await supabase.from('wa_social_queue').select('*').eq('brand_id',brandId).eq('status','draft').order('created_at',{ascending:false}).limit(1).maybeSingle(); q=data as Record<string,unknown>|null; }
    if (!q) { reply='Tidak ada konten draft. Ketik QUEUE.'; }
    else {
      await supabase.from('wa_social_queue').update({status:'approved',approved_by:waNumber,approved_at:new Date().toISOString()}).eq('id',q.id as string);
      await supabase.from('social_publish_log').insert({brand_id:brandId,queue_id:q.id,platform:q.platform,content_type:q.content_type,status:'pending',metadata:{approved_by:waNumber}});
      const icons: Record<string,string>={instagram:'\ud83d\udcf8',tiktok:'\ud83c\udfb5',linkedin:'\ud83d\udcbc',facebook:'\ud83d\udc65',twitter:'\ud83d\udc26'};
      reply=['\u2705 *APPROVED!*','',`${icons[q.platform as string]??'\ud83d\udcdd'} *${String(q.platform).charAt(0).toUpperCase()+String(q.platform).slice(1)}* - ${q.content_type}`,`_Ref: ${q.queue_ref}_`,'',String(q.generated).slice(0,350),'',`\ud83e\udd16 _Generating report..._`].join('\n');
      fetch(`${BASE_URL}/wa-post-approve`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({brand_id:brandId,brand_name:brandName,bot_prefix:botPrefix,queue_id:q.id,queue_ref:q.queue_ref,wa_number:replyTo,platform:q.platform,content_type:q.content_type,prompt:q.prompt,generated:q.generated,member_name:memberName,member_role:memberRole})}).catch(()=>{});
    }
  } else if (cmd === 'REJECT') {
    const {data} = await supabase.from('wa_social_queue').select('id,platform,content_type,queue_ref').eq('brand_id',brandId).in('status',['draft','approved']).order('created_at',{ascending:false}).limit(1).maybeSingle();
    if (!data) { reply='Tidak ada konten yang bisa ditolak.'; }
    else { const q=data as Record<string,unknown>; await supabase.from('wa_social_queue').update({status:'rejected',rejected_at:new Date().toISOString(),reject_reason:arg??'Tidak sesuai'}).eq('id',q.id as string); reply=`\ud83d\udd34 REJECTED. _${q.queue_ref}_${arg?` - ${arg}`:''}`;  }
  } else if (cmd === 'QUEUE') {
    const {data:items}=await supabase.from('wa_social_queue').select('queue_ref,platform,content_type,status,created_at').eq('brand_id',brandId).order('created_at',{ascending:false}).limit(5);
    if (!items||items.length===0){reply=`Queue kosong.`;}
    else { const si: Record<string,string>={draft:'\ud83d\udfe1',approved:'\u2705',rejected:'\ud83d\udd34',published:'\ud83d\udccc'}; const lines=(items as Array<Record<string,unknown>>).map((q,i)=>{const d=new Date(q.created_at as string).toLocaleDateString('id-ID',{day:'numeric',month:'short'});return `${i+1}. ${si[q.status as string]??'\u26aa'} *${q.queue_ref}* - ${q.platform}/${q.content_type} _${d}_`;}).join('\n'); const drafts=(items as Array<Record<string,unknown>>).filter(q=>q.status==='draft').length; reply=[`\ud83d\udcdd *Queue - ${brandName}*`,'',lines,'',drafts>0?`\ud83d\udfe1 ${drafts} menunggu APPROVE`:'Semua selesai'].join('\n'); }
  } else if (cmd==='DONE'||cmd==='SKIP'||cmd==='TUNDA') {
    const {data:at}=await supabase.from('tasks').select('id,persona_icon,priority,action_text,odrip,deadline').eq('brand_id',brandId).eq('status','active').order('priority_score',{ascending:false}).limit(10);
    const tasks=(at??[]) as Record<string,unknown>[];
    if (!num||num<1||num>tasks.length){reply=`Task #${num??'?'} tidak ditemukan.`;}
    else { const t=tasks[num-1]; const net=(((t.odrip as Record<string,unknown>)?.risk_reward as Record<string,unknown>)?.net as number)??0; if(cmd==='DONE'){await supabase.from('tasks').update({status:'done',completed_at:new Date().toISOString()}).eq('id',t.id as string);await supabase.from('learning_signals').insert({brand_id:brandId,task_id:t.id,source:'wa_command',outcome:'done',signal_type:'task_done',created_at:new Date().toISOString()}).catch(()=>{});reply=`\u2705 DONE #${num} ${t.persona_icon}\n_${String(t.action_text).slice(0,100)}_`;} else if(cmd==='SKIP'){await supabase.from('tasks').update({status:'skipped',skipped_at:new Date().toISOString()}).eq('id',t.id as string);reply=`SKIP #${num}`;} else{await supabase.from('tasks').update({snoozed_until:new Date(Date.now()+86400000).toISOString()}).eq('id',t.id as string);reply=`TUNDA #${num} - 24 jam.`;} }
  } else if (cmd==='STATUS') {
    const [{data:h},{data:g},{count:d7},{count:dr}]=await Promise.all([supabase.from('health_scores').select('score,grade').eq('brand_id',brandId).maybeSingle(),supabase.from('geo_scores').select('geo_score').eq('brand_id',brandId).order('recorded_at',{ascending:false}).limit(1).maybeSingle(),supabase.from('tasks').select('id',{count:'exact',head:true}).eq('brand_id',brandId).eq('status','done').gte('completed_at',new Date(Date.now()-604800000).toISOString()),supabase.from('wa_social_queue').select('id',{count:'exact',head:true}).eq('brand_id',brandId).eq('status','draft')]);
    const sc=(h?.score as number)??0; const ic=sc>=80?'\ud83d\udfe2':sc>=60?'\ud83d\udfe1':'\ud83d\udd34';
    reply=[`\ud83e\udde0 *${brandName}*`,`${ic} Health: ${sc}/100`,`\ud83d\udcca GEO: ${(g?.geo_score as number)?.toFixed(1)??'-'}/100`,`\u2705 Done 7d: ${d7??0}`,dr&&dr>0?`\ud83d\udfe1 Queue: ${dr}`:''].filter(Boolean).join('\n');
  } else if (cmd==='TASKS') {
    const {data:at}=await supabase.from('tasks').select('id,persona_icon,priority,action_text,odrip,deadline').eq('brand_id',brandId).eq('status','active').order('priority_score',{ascending:false}).limit(7);
    const tasks=(at??[]) as Record<string,unknown>[];
    if(!tasks.length){reply='Belum ada tasks aktif.';} else{const lines=tasks.map((t,i)=>{const net=(((t.odrip as Record<string,unknown>)?.risk_reward as Record<string,unknown>)?.net as number)??0; return `${i+1}. [${t.priority} ${t.persona_icon}] ${String(t.action_text).slice(0,70)} Net:${net>=0?'+':''}${net}`;}).join('\n'); reply=[`\ud83d\udcc8 *TASKS (${tasks.length})*`,'',lines,'','DONE N | SKIP N | TUNDA N'].join('\n');}
  } else if (cmd==='HELP') {
    reply=[`\ud83e\udde0 *${brandName} AI*`,'',`@${botPrefix}AI | @${botPrefix}Analytic | @${botPrefix}Social | @${botPrefix}OPS | @${botPrefix}Alert`,'','*Content Generation:*','ARTIKEL <topik> | GAMBAR <prompt> | VIDEO <prompt>','','*Task & Queue:*','TASKS | STATUS | QUEUE | APPROVE | LAPORAN | HELP'].join('\n');
  }

  if (reply) {
    await sendWA(replyTo, reply, token);
    await supabase.from('wa_log').insert({brand_id:brandId,wa_number:waNumber,direction:'out',message:reply.slice(0,500),command:cmd,device_number:deviceNumber||null,group_id:isGroup?replyTo:null,processed:true,received_at:new Date().toISOString()});
  }
}
