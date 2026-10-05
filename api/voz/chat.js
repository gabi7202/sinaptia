/**
 * api/voz/chat.js — Un turno de conversación con el LLM (Groq/Gemini/Grok, ver server/llm.js), en streaming real.
 *
 * POST { sessionId, text } · cookie vid
 *   → text/plain en stream: el cliente habla la primera frase antes de que el
 *     modelo termine (la ventaja nº1 sobre el proxy JSON).
 *
 * Seguridad y costo: mismo origen, UUID estrictos, sesión propiedad del
 * visitante, límite de 60 mensajes/hora/visitante (INCR con ventana en KV),
 * texto ≤1000. Bucle de herramientas ≤4 rondas (buscar_cliente) y respuesta
 * final guardada en los mensajes de la sesión para el resumen de cierre.
 * Límite duro de llamada: si la sesión supera MAX_MINUTOS_LLAMADA, el system
 * prompt del turno lleva avisoLimite() (el agente concreta el pago, redirige
 * firme o se despide — nunca se alarga).
 *
 * Persistencia: Vercel KV (server/kv.js). Supabase quedó eliminado del proyecto.
 */
import { crearKV } from '../../server/kv.js';
import { isUUID, mismoOrigen, leerCookies, leerCuerpo, json } from '../../server/nucleo.js';
import { llm, modeloChat } from '../../server/llm.js';
import { buildSystem, tools, runTool, normalizarHistorial, MAX_POR_HORA, RONDAS_TOOLS,
  MAX_MINUTOS_LLAMADA, minutosTranscurridos, avisoLimite } from '../../server/agente.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') return json(res, 405, { error: 'método no permitido' });
  if (!mismoOrigen(req)) return json(res, 403, { error: 'origin' });

  const env = process.env;
  const db = crearKV(env);
  if (!db.disponible()) return json(res, 503, { error: 'backend sin configurar' });

  const vid = leerCookies(req).vid;
  const b = await leerCuerpo(req);
  const text = String((b && b.text) || '').trim().slice(0, 1000);
  if (!text || !isUUID(vid) || !isUUID(b && b.sessionId)) return json(res, 400, { error: 'bad' });

  const s = await db.getSession(b.sessionId);
  if (!s || s.visitor_id !== vid) return json(res, 403, { error: 'session' });

  // límite de gasto por visitante: contador en KV con ventana de 1 h (INCR+EXPIRE)
  const rl = await db.incrConVentana(`rl:${vid}`, 3600);
  if (rl.ok && rl.n > MAX_POR_HORA) return json(res, 429, { error: 'limit' });

  const now = new Date().toISOString();
  await db.pushMessage(s.id, { role: 'user', content: text, lang: s.lang, ts: now });
  await db.setSession(s.id, { ...s, needs_summary: true, last_msg_at: now });
  await db.marcarPendiente(s.id, vid, Date.now());   // red del cron si el end nunca llega

  // historial: últimos 30 mensajes, normalizado (empieza en user, alterna roles)
  const msgs = normalizarHistorial((await db.getMessages(s.id)).slice(-30));

  const v = await db.getVisitor(vid);
  const lead = v && v.lead_id ? await db.getLead(v.lead_id) : null;
  // límite duro de llamada: pasado el tope, el turno viaja con el aviso de cierre
  const system = buildSystem(s.lang, lead) +
    (minutosTranscurridos(s.created_at) >= MAX_MINUTOS_LLAMADA ? `\n\n${avisoLimite()}` : '');

  // ── stream ── (la cabecera 200 sale con el primer delta: si el LLM falla
  //    antes de producir nada, aún podemos responder un 502 JSON limpio)
  const CABECERAS = {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Accel-Buffering': 'no',
  };
  let full = '';
  let abierto = true;
  let cabeceraEnviada = false;
  const push = (t) => {
    if (!abierto) return;
    try {
      if (!cabeceraEnviada) { cabeceraEnviada = true; res.writeHead(200, CABECERAS); }
      res.write(t);
    } catch (e) { abierto = false; }
  };

  try {
    for (let ronda = 0; ronda < RONDAS_TOOLS; ronda++) {
      const r = await llm(env, {
        model: env.CHAT_MODEL || modeloChat(env),
        // gpt-oss (Groq) consume tokens de razonamiento ANTES del texto:
        // con 350 el modelo agota el presupuesto en reasoning y devuelve
        // content:"" (verificado en vivo 2026-10-05). 800 deja margen real.
        max_tokens: Number(env.CHAT_MAX_TOKENS) || 800,
        system,
        tools,
        messages: msgs,
        stream: true,
        onTexto: (t) => { full += t; push(t); },
      });
      if (r.finish !== 'tool_calls' || !r.tools.length) break;

      // el turno del asistente viaja completo (texto + tool_calls) y cada
      // resultado vuelve como mensaje role:'tool' con su tool_call_id
      msgs.push({
        role: 'assistant',
        content: r.texto || null,
        tool_calls: r.tools.map((tc) => ({
          id: tc.id, type: 'function', sig: tc.sig || '',   // Gemini: thoughtSignature de vuelta
          function: { name: tc.name, arguments: JSON.stringify(tc.input || {}) },
        })),
      });
      for (const tc of r.tools) {
        const out = await runTool(db, tc.name, tc.input, { visitorId: vid });
        msgs.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(out) });
      }
      if (full && !/\s$/.test(full)) { full += ' '; push(' '); }
    }
  } catch (e) {
    console.error('chat error', e);
    // si el stream no llegó a empezar, hay status de error; si ya empezó, se corta limpio
    if (!cabeceraEnviada) {
      try { return json(res, 502, { error: 'ia' }); } catch (e2) { /* nada */ }
    }
    abierto = false;
  }

  if (full.trim()) {
    await db.pushMessage(s.id, { role: 'assistant', content: full.trim(), lang: s.lang, ts: new Date().toISOString() });
  }
  if (abierto) {
    try {
      if (!cabeceraEnviada) res.writeHead(200, CABECERAS);
      res.end();
    } catch (e) { /* cliente colgado */ }
  } else {
    try { res.end(); } catch (e) { /* nada */ }
  }
}
