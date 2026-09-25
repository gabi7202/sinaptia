/**
 * api/voz/chat.js — Un turno de conversación con el LLM (Gemini o Grok, ver server/llm.js), en streaming real.
 *
 * POST { sessionId, text } · cookie vid
 *   → text/plain en stream: el cliente habla la primera frase antes de que el
 *     modelo termine (la ventaja nº1 de B sobre el proxy JSON de A).
 *
 * Seguridad y costo (heredado de B): mismo origen, UUID estrictos, sesión
 * propiedad del visitante, límite de 60 mensajes/hora/visitante, texto ≤1000.
 * Bucle de herramientas ≤4 rondas (buscar_cliente) y respuesta final guardada
 * en messages para el resumen de cierre.
 */
import { crearSupabase, isUUID, mismoOrigen, leerCookies, leerCuerpo, json, eq } from '../../server/nucleo.js';
import { llm, modeloChat } from '../../server/llm.js';
import { buildSystem, tools, runTool, normalizarHistorial, MAX_POR_HORA, RONDAS_TOOLS } from '../../server/agente.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') return json(res, 405, { error: 'método no permitido' });
  if (!mismoOrigen(req)) return json(res, 403, { error: 'origin' });

  const env = process.env;
  const db = crearSupabase(env);
  if (!db.disponible()) return json(res, 503, { error: 'backend sin configurar' });

  const vid = leerCookies(req).vid;
  const b = await leerCuerpo(req);
  const text = String((b && b.text) || '').trim().slice(0, 1000);
  if (!text || !isUUID(vid) || !isUUID(b && b.sessionId)) return json(res, 400, { error: 'bad' });

  const { data: s } = await db.select('sessions',
    `select=id,lang&${eq('id', b.sessionId)}&${eq('visitor_id', vid)}`, { single: true });
  if (!s) return json(res, 403, { error: 'session' });

  // límite de gasto por visitante: mensajes de usuario en la última hora
  const desde = new Date(Date.now() - 3600e3).toISOString();
  const recientes = await db.contar('messages',
    `${eq('visitor_id', vid)}&${eq('role', 'user')}&created_at=gte.${desde}`);
  if (recientes >= MAX_POR_HORA) return json(res, 429, { error: 'limit' });

  const now = new Date().toISOString();
  await db.insertar('messages', { session_id: s.id, visitor_id: vid, role: 'user', content: text, lang: s.lang });
  await db.actualizar('sessions', eq('id', s.id), { needs_summary: true, last_msg_at: now });

  // historial: últimos 30 mensajes, normalizado para Grok (empieza en user, alterna)
  const { data: hist } = await db.select('messages',
    `select=role,content&${eq('session_id', s.id)}&order=created_at.desc&limit=30`);
  const msgs = normalizarHistorial((hist || []).slice().reverse());

  const { data: v } = await db.select('visitors', `select=lead_id&${eq('id', vid)}`, { single: true });
  const lead = v && v.lead_id
    ? (await db.select('leads', `select=*&${eq('id', v.lead_id)}`, { single: true })).data
    : null;
  const system = buildSystem(s.lang, lead);

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
        max_tokens: 350,
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
    await db.insertar('messages', { session_id: s.id, visitor_id: vid, role: 'assistant', content: full.trim(), lang: s.lang });
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
