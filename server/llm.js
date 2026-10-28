/**
 * llm.js — Un solo cliente para Groq, xAI (Grok) y OpenAI.
 *
 * Groq es el proveedor recomendado: latencia muy baja, API OpenAI-compatible y
 * capa gratuita para probar. xAI (Grok) sigue soportado porque el backend de voz
 * ya estaba construido sobre él; OpenAI queda como tercera opción.
 *
 * Prioridad (explícita, para que no haya sorpresas):
 *   1. GROQ_API_KEY     → https://api.groq.com/openai/v1
 *   2. XAI_API_KEY / GROK_API_KEY → api.x.ai (delegado a grok.js)
 *   3. OPENAI_KEY       → api.openai.com
 *
 * Sin claves no se llama a nadie: el sitio degrada al motor determinista.
 */

import { grok, parsearSSE, mapearFinish, MODELO_CHAT as XAI_CHAT, MODELO_EXTRACT as XAI_EXTRACT } from './grok.js';

export const GROQ_BASE = 'https://api.groq.com/openai/v1';
export const GROQ_CHAT = 'llama-3.3-70b-versatile';
export const GROQ_FAST = 'llama-3.1-8b-instant';
export const OPENAI_CHAT = 'gpt-4o-mini';

/** Proveedor activo según las claves del entorno. */
export function proveedor(env = {}) {
  if (env.GROQ_API_KEY) return 'groq';
  if (env.XAI_API_KEY || env.GROK_API_KEY) return 'xai';
  if (env.OPENAI_KEY) return 'openai';
  return null;
}

/** Modelo por defecto del proveedor activo. */
export function modeloChat(env = {}) {
  if (env.GROQ_API_KEY) return env.GROQ_MODEL || GROQ_CHAT;
  if (env.XAI_API_KEY || env.GROK_API_KEY) return env.XAI_MODEL || env.GROK_MODEL || env.CHAT_MODEL || XAI_CHAT;
  if (env.OPENAI_KEY) return env.OPENAI_MODEL || OPENAI_CHAT;
  return null;
}

export function modeloExtraccion(env = {}) {
  if (env.GROQ_API_KEY) return env.GROQ_EXTRACT_MODEL || env.GROQ_MODEL || GROQ_CHAT;
  if (env.XAI_API_KEY || env.GROK_API_KEY) return env.XAI_EXTRACT_MODEL || env.EXTRACT_MODEL || XAI_EXTRACT;
  if (env.OPENAI_KEY) return env.OPENAI_EXTRACT_MODEL || env.EXTRACT_MODEL || OPENAI_CHAT;
  return null;
}

function textoDe(c) {
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) return c.filter((p) => p && p.type === 'text').map((p) => p.text || '').join('');
  return '';
}

function toolCallDe(tc) {
  const fn = (tc && tc.function) || {};
  let input = {};
  try { input = JSON.parse(fn.arguments || '{}') || {}; } catch (e) { input = {}; }
  return { id: (tc && tc.id) || '', name: fn.name || '', input };
}

function cuerpoOpenAI(env, opts, { base, modelo, clave, extra = {} }) {
  const {
    system, messages = [], tools = null, stream = false, json = false,
    max_tokens = 350, temperature,
  } = opts;
  const temp = temperature != null ? temperature : Number(env.LLM_TEMPERATURE || 0.5);
  return {
    url: String(env.GROQ_BASE_URL && base === GROQ_BASE ? env.GROQ_BASE_URL : base).replace(/\/+$/, '') + '/chat/completions',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${clave}` },
    body: {
      model: opts.model || modelo,
      max_tokens,
      temperature: Number.isFinite(temp) ? temp : 0.5,
      messages: [
        ...(system ? [{ role: 'system', content: String(system) }] : []),
        ...messages,
      ],
      ...(tools && tools.length ? { tools, tool_choice: 'auto', parallel_tool_calls: false } : {}),
      ...(json ? { response_format: { type: 'json_object' } } : {}),
      ...(stream ? { stream: true } : {}),
      ...extra,
    },
  };
}

/** Parsea el turno no-stream de una respuesta OpenAI-compatible. */
function turnoNoStream(j) {
  const ch = (j && j.choices && j.choices[0]) || {};
  const msg = ch.message || {};
  return {
    texto: textoDe(msg.content),
    tools: (msg.tool_calls || []).map(toolCallDe).filter((t) => t.name),
    finish: mapearFinish(ch.finish_reason),
    uso: (j && j.usage) || null,
  };
}

async function conGroq(env, opts, fetchImpl) {
  const f = fetchImpl || ((...a) => globalThis.fetch(...a));
  const clave = String(env.GROQ_API_KEY || '');
  if (!clave) throw new Error('groq sin clave');
  const { url, headers, body } = cuerpoOpenAI(env, opts, {
    base: GROQ_BASE, modelo: GROQ_CHAT, clave,
    // Groq no acepta reasoning_effort en los modelos Llama; no se manda.
  });

  const pedir = async (cuerpo) => f(url, { method: 'POST', headers, body: JSON.stringify(cuerpo) });
  let r = await pedir(body);

  // Algunos modelos de Groq no soportan response_format: se reintenta sin él
  // antes de rendirse (mejor JSON limpio pedido en el prompt que un 400).
  if (!r.ok && opts.json && (r.status === 400 || r.status === 422)) {
    let detalle = '';
    try { detalle = await r.text(); } catch (e) { /* nada */ }
    if (/response_format|json/i.test(detalle)) {
      const sinJson = { ...body };
      delete sinJson.response_format;
      r = await pedir(sinJson);
    } else {
      throw new Error(`groq ${r.status} ${detalle.slice(0, 180)}`);
    }
  }
  if (!r.ok) {
    let detalle = '';
    try { detalle = await r.text(); } catch (e) { /* nada */ }
    throw new Error(`groq ${r.status} ${detalle.slice(0, 180)}`);
  }

  if (!opts.stream) return turnoNoStream(await r.json());
  return parsearSSE(r.body, opts.onTexto);
}

async function conOpenAI(env, opts, fetchImpl) {
  const f = fetchImpl || ((...a) => globalThis.fetch(...a));
  const clave = String(env.OPENAI_KEY || '');
  if (!clave) throw new Error('openai sin clave');
  const { url, headers, body } = cuerpoOpenAI(env, opts, {
    base: 'https://api.openai.com/v1', modelo: OPENAI_CHAT, clave,
  });
  const r = await f(url, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!r.ok) {
    let detalle = '';
    try { detalle = await r.text(); } catch (e) { /* nada */ }
    throw new Error(`openai ${r.status} ${detalle.slice(0, 180)}`);
  }
  if (!opts.stream) return turnoNoStream(await r.json());
  return parsearSSE(r.body, opts.onTexto);
}

/**
 * Llama al proveedor activo. Devuelve SIEMPRE:
 *   { texto, tools, finish, uso, proveedor, modelo }
 * En streaming va llamando a onTexto(delta) con cada trozo visible.
 *
 * opts: { model, max_tokens, temperature, system, tools, messages, stream, json, onTexto }
 */
export async function completar(env = {}, opts = {}, fetchImpl) {
  const p = proveedor(env);
  if (!p) throw new Error('sin proveedor de IA configurado');
  const modelo = opts.model || (p === 'openai' ? modeloChat(env) : modeloChat(env));
  const opts2 = { ...opts, model: modelo };

  let r;
  if (p === 'groq') r = await conGroq(env, opts2, fetchImpl);
  else if (p === 'xai') {
    r = await grok(env, opts2, fetchImpl);
    r = { ...r, proveedor: 'xai', modelo };
  } else r = await conOpenAI(env, opts2, fetchImpl);

  return { ...r, proveedor: p, modelo };
}

export { parsearSSE };
