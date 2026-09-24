import type { APIRoute } from 'astro';
import type Anthropic from '@anthropic-ai/sdk';
import { db, isUUID, sameOrigin, json } from '../../../lib/server';
import { anthropic, CHAT_MODEL, buildSystem, tools, runTool } from '../../../lib/agent';
import type { LangKey } from '../../../lib/langs';

export const prerender = false;
const MAX_PER_HOUR = 60; // mensajes de usuario por visitante por hora

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!sameOrigin(request)) return json({ error: 'origin' }, 403);
  const vid = cookies.get('vid')?.value;
  const body: any = await request.json().catch(() => null);
  const text = String(body?.text ?? '').trim().slice(0, 1000);
  if (!text || !isUUID(vid) || !isUUID(body?.sessionId)) return json({ error: 'bad' }, 400);

  const { data: s } = await db.from('sessions').select('id,lang').eq('id', body.sessionId).eq('visitor_id', vid).single();
  if (!s) return json({ error: 'session' }, 403);

  // Límite de gasto por visitante
  const since = new Date(Date.now() - 3600e3).toISOString();
  const { count } = await db.from('messages').select('id', { count: 'exact', head: true })
    .eq('visitor_id', vid).eq('role', 'user').gte('created_at', since);
  if ((count ?? 0) >= MAX_PER_HOUR) return json({ error: 'limit' }, 429);

  await db.from('messages').insert({ session_id: s.id, visitor_id: vid, role: 'user', content: text, lang: s.lang });
  await db.from('sessions').update({ needs_summary: true, last_msg_at: new Date().toISOString() }).eq('id', s.id);

  // Historial (Claude exige que empiece con "user" y que los roles alternen)
  const { data: hist } = await db.from('messages').select('role,content').eq('session_id', s.id)
    .order('created_at', { ascending: false }).limit(30);
  const msgs: Anthropic.MessageParam[] = [];
  for (const m of (hist ?? []).reverse()) {
    if (!msgs.length && m.role !== 'user') continue;
    const last = msgs[msgs.length - 1];
    if (last && last.role === m.role) last.content += '\n' + m.content;
    else msgs.push({ role: m.role as 'user' | 'assistant', content: m.content });
  }

  const { data: v } = await db.from('visitors').select('lead_id').eq('id', vid).single();
  const lead = v?.lead_id ? (await db.from('leads').select('*').eq('id', v.lead_id).single()).data : null;
  const system = buildSystem(s.lang as LangKey, lead);

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let full = '', open = true, failed: unknown = null;
      const push = (t: string) => { if (open) try { controller.enqueue(enc.encode(t)); } catch { open = false; } };
      try {
        for (let round = 0; round < 4; round++) {
          const st = anthropic.messages.stream({ model: CHAT_MODEL, max_tokens: 350, system, tools, messages: msgs });
          st.on('text', (t) => { full += t; push(t); });
          const final = await st.finalMessage();
          if (final.stop_reason !== 'tool_use') break;

          msgs.push({ role: 'assistant', content: final.content });
          const results: Anthropic.ToolResultBlockParam[] = [];
          for (const b of final.content) {
            if (b.type === 'tool_use') {
              const out = await runTool(b.name, b.input, { visitorId: vid });
              results.push({ type: 'tool_result', tool_use_id: b.id, content: JSON.stringify(out) });
            }
          }
          msgs.push({ role: 'user', content: results });
          if (full && !/\s$/.test(full)) { full += ' '; push(' '); }
        }
      } catch (e) { failed = e; console.error('chat error', e); }

      if (full.trim()) {
        await db.from('messages').insert({ session_id: s.id, visitor_id: vid, role: 'assistant', content: full.trim(), lang: s.lang });
      }
      if (open) { try { failed ? controller.error(failed) : controller.close(); } catch {} }
    },
    cancel() {},
  });

  return new Response(stream, {
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'x-accel-buffering': 'no' },
  });
};
