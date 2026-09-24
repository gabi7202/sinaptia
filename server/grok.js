/**
 * grok.js — xAI (Grok) por REST con fetch plano. CERO dependencias.
 *
 * Sustituye al cliente de Anthropic: mismo papel, dialecto OpenAI-compatible
 * (POST /v1/chat/completions, Authorization: Bearer, tools tipo function).
 *
 * Dos modos:
 *   · stream: false → JSON completo (lo usa el resumen de sesión)
 *   · stream: true  → SSE: cada delta de texto sale por onTexto en cuanto llega
 *     (la primera frase se habla antes de que el modelo termine), y al final se
 *     devuelve el mensaje ensamblado con sus tool_calls y finish_reason.
 *
 * Detalles de Grok que importan aquí:
 *   · Es un modelo de razonamiento: el stream trae `delta.reasoning_content`
 *     (su pensamiento). NUNCA se emite por onTexto: no se habla ni se guarda.
 *   · `max_completion_tokens` cuenta solo la salida visible (el razonamiento va
 *     aparte), así que 350 tokens siguen siendo 350 tokens dichos en voz alta.
 *   · `reasoning_effort: 'low'` = latencia baja y tool calling simple: lo que
 *     necesita una conversación de voz (sube a 'medium'/'high' con GROK_EFFORT).
 *   · `stop`, `presence_penalty` y `frequency_penalty` NO se mandan: los modelos
 *     de razonamiento los rechazan con error.
 */

const API = 'https://api.x.ai/v1/chat/completions';

/** Modelo por defecto (verificables con CHAT_MODEL / EXTRACT_MODEL en Vercel). */
export const MODELO_CHAT = 'grok-4.7';
export const MODELO_EXTRACT = 'grok-4.7';
export const ESFUERZO_DEFECTO = 'low';

/** finish_reason de xAI → vocabulario interno ('tool_calls' | 'length' | 'stop'). */
export function mapearFinish(f) {
  if (f === 'tool_calls' || f === 'function_call') return 'tool_calls';
  if (f === 'length') return 'length';
  return 'stop';
}

function safeJson(s) {
  try { const v = JSON.parse(s); return v && typeof v === 'object' ? v : {}; } catch (e) { return {}; }
}

/** La clave vive solo en el entorno del servidor. XAI_API_KEY es el nombre oficial. */
export function claveGrok(env) {
  return String((env && (env.XAI_API_KEY || env.GROK_API_KEY)) || '');
}

/** content puede venir como string o como lista de partes: devuelve solo texto. */
function textoDe(c) {
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) return c.filter((p) => p && p.type === 'text').map((p) => p.text || '').join('');
  return '';
}

function toolCallDe(tc) {
  const fn = (tc && tc.function) || {};
  return { id: tc && tc.id ? tc.id : '', name: fn.name || '', input: safeJson(fn.arguments || '') };
}

/**
 * Llama a Grok. Devuelve SIEMPRE el turno ensamblado:
 *   { texto, tools: [{id,name,input}], finish: 'stop'|'tool_calls'|'length', uso }
 * En streaming, además, va llamando a onTexto(delta) con cada trozo de texto.
 *
 * opts: { model, max_tokens, system, tools, messages, stream, json, onTexto }
 *   · messages/tools ya vienen en dialecto OpenAI (los arma agente.js/chat.js)
 *   · json: true → response_format json_object (lo usa el resumen de sesión)
 */
export async function grok(env, opts, fetchImpl) {
  const f = fetchImpl || ((...a) => globalThis.fetch(...a));
  const {
    model, max_tokens = 350, system, tools = null, messages,
    stream = false, json = false, onTexto = null,
  } = opts;

  const cuerpo = {
    model: model || MODELO_CHAT,
    max_completion_tokens: max_tokens,
    reasoning_effort: String((env && env.GROK_EFFORT) || ESFUERZO_DEFECTO),
    messages: [
      ...(system ? [{ role: 'system', content: String(system) }] : []),
      ...(messages || []),
    ],
    ...(tools && tools.length ? { tools, tool_choice: 'auto', parallel_tool_calls: false } : {}),
    ...(json ? { response_format: { type: 'json_object' } } : {}),
    ...(stream ? { stream: true } : {}),
  };

  const r = await f(String((env && env.XAI_BASE_URL) || API), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${claveGrok(env)}`,
    },
    body: JSON.stringify(cuerpo),
  });

  if (!r.ok) {
    let detalle = '';
    try { detalle = await r.text(); } catch (e) { /* nada */ }
    throw new Error(`grok ${r.status} ${detalle.slice(0, 200)}`);
  }

  if (!stream) {
    const j = await r.json();
    const ch = (j && j.choices && j.choices[0]) || {};
    const msg = ch.message || {};
    return {
      texto: textoDe(msg.content),
      tools: (msg.tool_calls || []).map(toolCallDe).filter((t) => t.name),
      finish: mapearFinish(ch.finish_reason),
      uso: j && j.usage ? j.usage : null,
    };
  }
  return parsearSSE(r.body, onTexto);
}

/**
 * Parser SSE de chat.completion.chunk: lee el cuerpo por trozos (que pueden
 * partir UTF-8 y eventos a la mitad), emite el texto apenas llega y acumula los
 * tool_calls por índice (sus arguments vienen fragmentados). `data: [DONE]` cierra.
 */
export async function parsearSSE(cuerpo, onTexto) {
  const reader = cuerpo.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let texto = '';
  let finish = null;
  let uso = null;
  const llamadas = new Map();   // índice → { id, name, args }

  const procesarEvento = (evento) => {
    for (const linea of evento.split('\n')) {
      if (!linea.startsWith('data:')) continue;
      const crudo = linea.slice(5).trim();
      if (!crudo || crudo === '[DONE]') continue;
      let d;
      try { d = JSON.parse(crudo); } catch (e) { continue; }

      if (d.usage) uso = d.usage;
      const ch = (d.choices && d.choices[0]) || null;
      if (!ch) continue;
      const delta = ch.delta || {};

      // el razonamiento se ignora a propósito: no se habla ni se transcribe
      if (typeof delta.content === 'string' && delta.content) {
        texto += delta.content;
        if (onTexto) onTexto(delta.content);
      }
      if (ch.finish_reason) finish = ch.finish_reason;

      for (const tc of delta.tool_calls || []) {
        const i = Number.isInteger(tc.index) ? tc.index : llamadas.size;
        let acc = llamadas.get(i);
        if (!acc) { acc = { id: '', name: '', args: '' }; llamadas.set(i, acc); }
        if (tc.id) acc.id = tc.id;
        const fn = tc.function || {};
        if (fn.name) acc.name += fn.name;
        if (fn.arguments) acc.args += fn.arguments;
      }
    }
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true }).replace(/\r/g, '');
    let idx;
    while ((idx = buf.indexOf('\n\n')) >= 0) {
      procesarEvento(buf.slice(0, idx));
      buf = buf.slice(idx + 2);
    }
  }
  buf += dec.decode();
  if (buf.trim()) procesarEvento(buf.replace(/\r/g, ''));

  const tools = [...llamadas.values()]
    .filter((a) => a.name)
    .map((a) => ({ id: a.id, name: a.name, input: safeJson(a.args) }));

  return { texto, tools, finish: mapearFinish(finish), uso };
}
