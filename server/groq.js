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

/** Modelos por defecto: rápidos y con tool calling (ver CHAT_MODEL/EXTRACT_MODEL). */
export const MODELO_CHAT = 'compound-mini';
export const MODELO_EXTRACT = 'llama-3.3-70b-versatile';

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

  const cuerpo = {
    model: model || MODELO_CHAT,
    max_tokens,
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

  // reutiliza el parser SSE probado de grok.js (mismo formato OpenAI-compatible)
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
  const { parsearSSE } = await import('./grok.js');
  return parsearSSE(r.body, onTexto);
}
