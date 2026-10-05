/**
 * groq.js — Groq (groq.com) por REST con fetch plano. CERO dependencias.
 *
 * Mismo dialecto OpenAI-compatible que grok.js: POST /v1/chat/completions,
 * Authorization: Bearer, tools tipo function. La clave vive SOLO en el entorno
 * del servidor: GROQ_API_KEY es el nombre oficial de su variable.
 *
 * Dos modos (contrato idéntico al resto de proveedores):
 *   · stream: false → JSON completo (resumen de sesión)
 *   · stream: true  → SSE: cada delta sale por onTexto en cuanto llega
 *     (la primera frase se habla antes de que el modelo termine).
 *
 * Detalles de Groq que importan aquí:
 *   · Los modelos "compás" (compound, p.ej. compound-mini) razonan con tool
 *     calling normal; los que no (llama-3.x) simplemente no emiten reasoning.
 *     El parser ignora cualquier delta.reasoning_content por si acaso.
 *   · response_format json_object solo está soportado en algunos modelos;
 *     se manda únicamente cuando json:true (el resumen usa EXTRACT_MODEL).
 */

const API = 'https://api.groq.com/openai/v1/chat/completions';

/**
 * Modelo de conversación. El default está VERIFICADO contra la API real de
 * Groq (2026-10-05): el catálogo de cada cuenta se consulta con
 * GET /openai/v1/models y los modelos que no existan devuelven 400
 * model_not_found y rompen el chat — por eso NO se hardcodea aquí: se lee
 * del entorno en cada llamada (los módulos ESM se memoizan y las env vars
 * cambian entre despliegues sin tocar código).
 *   · openai/gpt-oss-120b → razona + tool calling verificado en vivo
 *   · compound-mini       → solo si aparece en el listado de TU cuenta
 * Overridable con CHAT_MODEL / EXTRACT_MODEL.
 */
export function modeloChat(env) {
  return String((env && env.CHAT_MODEL) || 'openai/gpt-oss-120b');
}
export function modeloExtract(env) {
  return String((env && env.EXTRACT_MODEL) || 'openai/gpt-oss-20b');
}

/**
 * Los modelos gpt-oss exigen max_completion_tokens; los demás aceptan
 * max_tokens. Se decide por nombre para no romper ninguno.
 */
export function campoLimite(modelo) {
  return String(modelo || '').includes('gpt-oss') ? 'max_completion_tokens' : 'max_tokens';
}

/** finish_reason de Groq → vocabulario interno ('tool_calls' | 'length' | 'stop'). */
export function mapearFinish(f) {
  if (f === 'tool_calls' || f === 'function_call') return 'tool_calls';
  if (f === 'length') return 'length';
  return 'stop';
}

function safeJson(s) {
  try { const v = JSON.parse(s); return v && typeof v === 'object' ? v : {}; } catch (e) { return {}; }
}

/** La clave vive solo en el entorno del servidor. GROQ_API_KEY es el nombre oficial. */
export function claveGroq(env) {
  return String((env && env.GROQ_API_KEY) || '');
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
 * Llama a Groq. Devuelve SIEMPRE el turno ensamblado:
 *   { texto, tools: [{id,name,input}], finish: 'stop'|'tool_calls'|'length', uso }
 * En streaming, además, va llamando a onTexto(delta) con cada trozo de texto.
 *
 * opts: { model, max_tokens, system, tools, messages, stream, json, onTexto }
 */
export async function groq(env, opts, fetchImpl) {
  const f = fetchImpl || ((...a) => globalThis.fetch(...a));
  const {
    model, max_tokens = 350, system, tools = null, messages,
    stream = false, json = false, onTexto = null,
  } = opts;

  const modeloFinal = model || modeloChat(env);
  const cuerpo = {
    model: modeloFinal,
    [campoLimite(modeloFinal)]: max_tokens,   // gpt-oss → max_completion_tokens
    temperature: 0.6,
    messages: [
      ...(system ? [{ role: 'system', content: String(system) }] : []),
      ...(messages || []),
    ],
    ...(tools && tools.length ? { tools, tool_choice: 'auto', parallel_tool_calls: false } : {}),
    ...(json ? { response_format: { type: 'json_object' } } : {}),
    ...(stream ? { stream: true } : {}),
  };

  const r = await f(String((env && env.GROQ_BASE_URL) || API), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${claveGroq(env)}`,
    },
    body: JSON.stringify(cuerpo),
  });

  if (!r.ok) {
    let detalle = '';
    try { detalle = await r.text(); } catch (e) { /* nada */ }
    throw new Error(`groq ${r.status} ${detalle.slice(0, 200)}`);
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
 * Parser SSE del dialecto OpenAI-compatible (antes vivía en grok.js; con la
 * eliminación de Gemini/Grok, groq.js es su único dueño). Lee eventos
 * chat.completion.chunk separados por línea en blanco — tolera UTF-8 partido,
 * keep-alives (líneas ':'), basura intermedia y [DONE] — y devuelve el turno
 * ensamblado { texto, tools:[{id,name,input}], finish, uso }.
 * El delta.reasoning_content (modelos que razonan) NUNCA se habla ni transcribe.
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
