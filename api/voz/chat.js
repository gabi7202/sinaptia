/**
 * api/voz/chat.js — Un turno de conversación con Groq, en streaming real.
 *
 * POST { sessionId, text, memoria? } · cookie vid (solo si hay Supabase)
 *   → text/plain en stream: el cliente habla la primera frase antes de que el
 *     modelo termine.
 *
 * Dos modos:
 *   · CON Supabase: sesión + historial + memoria de cliente + tool use + rate limit.
 *   · SIN Supabase (o sesión `efimero-…`): memoria temporal del navegador. Groq
 *     recibe el hilo desde `memoria.turnos` y responde igual, sin guardar nada.
 *     Es lo que permite que el sitio funcione con solo GROQ_API_KEY.
 *
 * Seguridad y costo: mismo origen, UUID estrictos (o sesión efímera), texto
 * ≤1000, bucle de herramientas ≤4 rondas y respuesta final guardada en messages.
 */
import { crearSupabase, isUUID, mismoOrigen, leerCookies, leerCuerpo, json, eq } from '../../server/nucleo.js';
import { completar, modeloChat } from '../../server/llm.js';
import { buildSystem, tools, runTool, normalizarHistorial, MAX_POR_HORA, RONDAS_TOOLS } from '../../server/agente.js';
import { normalizarMemoria } from '../../server/memoria-sesion.js';
import { PROMPT_VERSION } from '../../server/prompt-maestro.js';

const CABECERAS = {
  'Content-Type': 'text/plain; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Accel-Buffering': 'no',
  'X-Prompt-Version': PROMPT_VERSION,
};

const esEfimero = (s) => typeof s === 'string' && /^efimero-[0-9a-f-]{16,}$/i.test(s);

/** Turno sin base de datos: el hilo viene del navegador. */
async function responderEfimero(res, { text, lang, memoria, env }) {
  const system = buildSystem(lang, null, memoria, { herramientas: false });
  const historial = (memoria && memoria.turnos ? memoria.turnos : [])
    .slice(-14)
    .map((t) => ({ role: t.rol === 'bot' ? 'assistant' : 'user', content: t.texto }));
  // El cliente añade el mensaje actual a la memoria antes de llamar: se quita
  // de aquí para no mandarlo dos veces (una en historial y otra en `text`).
  if (historial.length && historial[historial.length - 1].role === 'user' &&
      historial[historial.length - 1].content.trim() === text.trim()) {
    historial.pop();
  }
  const mensajes = [...historial, { role: 'user', content: text }];

  let full = '';
  let cabecera = false;
  try {
    await completar(env, {
      model: modeloChat(env),
      max_tokens: 280,
      temperature: 0.45,
      system,
      messages: mensajes,
      stream: true,
      onTexto: (t) => {
        full += t;
        if (!cabecera) { cabecera = true; res.writeHead(200, CABECERAS); }
        res.write(t);
      },
    });
    if (!cabecera) res.writeHead(200, CABECERAS);
    res.end();
  } catch (e) {
    if (!cabecera) {
      try { json(res, 502, { error: 'ia', promptVersion: PROMPT_VERSION }); } catch (e2) { /* nada */ }
      return;
    }
    try { res.end(); } catch (e2) { /* nada */ }
  }
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') return json(res, 405, { error: 'método no permitido' });
  if (!mismoOrigen(req)) return json(res, 403, { error: 'origin' });

  const env = process.env;
  const db = crearSupabase(env);
  const b = await leerCuerpo(req);
  const text = String((b && b.text) || '').trim().slice(0, 1000);
  if (!text) return json(res, 400, { error: 'bad' });

  const memoria = normalizarMemoria(b && b.memoria);
  const sessionId = b && b.sessionId;
  const langSesion = memoria && ['es', 'en', 'pt'].includes(memoria.idioma) ? memoria.idioma : 'es';

  // Sin Supabase, o con una sesión efímera: memoria del navegador y nada guardado.
  if (!db.disponible() || esEfimero(sessionId)) {
    return responderEfimero(res, { text, lang: langSesion, memoria, env });
  }

  const vid = leerCookies(req).vid;
  if (!isUUID(vid) || !isUUID(sessionId)) return json(res, 400, { error: 'bad' });

  const { data: s } = await db.select('sessions',
    `select=id,lang&${eq('id', sessionId)}&${eq('visitor_id', vid)}`, { single: true });
  if (!s) return json(res, 403, { error: 'session' });

  // límite de gasto por visitante: mensajes de usuario en la última hora
  const desde = new Date(Date.now() - 3600e3).toISOString();
  const recientes = await db.contar('messages',
    `${eq('visitor_id', vid)}&${eq('role', 'user')}&created_at=gte.${desde}`);
  if (recientes >= MAX_POR_HORA) return json(res, 429, { error: 'limit' });

  const now = new Date().toISOString();
  await db.insertar('messages', { session_id: s.id, visitor_id: vid, role: 'user', content: text, lang: s.lang });
  await db.actualizar('sessions', eq('id', s.id), { needs_summary: true, last_msg_at: now });

  // historial: últimos 30 mensajes, normalizado para el modelo (empieza en user, alterna)
  const { data: hist } = await db.select('messages',
    `select=role,content&${eq('session_id', s.id)}&order=created_at.desc&limit=30`);
  const msgs = normalizarHistorial((hist || []).slice().reverse());

  const { data: v } = await db.select('visitors', `select=lead_id&${eq('id', vid)}`, { single: true });
  const lead = v && v.lead_id
    ? (await db.select('leads', `select=*&${eq('id', v.lead_id)}`, { single: true })).data
    : null;
  const system = buildSystem(s.lang, lead, memoria);

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
      const r = await completar(env, {
        model: modeloChat(env),
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
          id: tc.id, type: 'function',
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
    if (!cabeceraEnviada) {
      try { return json(res, 502, { error: 'ia', promptVersion: PROMPT_VERSION }); } catch (e2) { /* nada */ }
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
