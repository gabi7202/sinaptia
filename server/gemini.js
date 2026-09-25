/**
 * gemini.js — Google Gemini (AI Studio) por REST con fetch plano. CERO dependencias.
 *
 * Mismo contrato que grok.js: { texto, tools, finish, uso } y deltas por onTexto.
 * El backend de voz elige proveedor solo por entorno (ver llm.js): si hay
 * GEMINI_API_KEY, habla Gemini; si no, Grok. Nada más cambia.
 *
 * Dialecto Gemini (v1beta/models/<modelo>:generateContent):
 *   · system → systemInstruction; mensajes user/assistant → contents user/model.
 *   · tools OpenAI {type:'function'} → functionDeclarations (tipos en MAYÚSCULAS).
 *   · Resultados de tools → partes functionResponse en un turno 'user'.
 *   · json:true → generationConfig.responseMimeType='application/json'.
 *   · Streaming: :streamGenerateContent?alt=sse (eventos data: con candidates).
 *
 * Detalles que importan aquí:
 *   · Es un modelo pensante: con thinkingBudget alto se gasta los maxOutputTokens
 *     "pensando" y no dice nada. Por defecto budget 0 (latencia de voz); se sube
 *     con GEMINI_THINKING. En la familia Gemini 3 la perilla es OTRA:
 *     thinkingLevel (GEMINI_LEVEL=minimal|low|medium|high) — ver configPensamiento.
 *   · Las partes con thought:true NUNCA se emiten por onTexto: no se hablan.
 *   · El free tier devuelve 429/503 esporádicos ("high demand"): se reintenta
 *     una vez y, si el stream sigue cerrado, se degrada a no-stream (la
 *     respuesta llega completa en vez de por frases; degrada, no se rompe).
 *   · Gemini 3 firma los functionCall con thoughtSignature: hay que devolverla
 *     tal cual al mandar el functionResponse, o la API rechaza el turno.
 */

const BASE = 'https://generativelanguage.googleapis.com/v1beta';

/** Modelo por defecto (verificables con CHAT_MODEL / EXTRACT_MODEL en Vercel).
 *  gemini-2.5-flash y no *-latest (3.x): con system prompt, los 3.x IGNORAN el
 *  thinkingBudget:0 — "piensan" ~300 tokens, recortan la salida y duplican la
 *  latencia. El 2.5-flash sí lo respeta: 0 pensamientos, ~1.5 s, ideal para voz.
 *  OJO: Google retira la familia 2.5 el 2026-10-20. El salto a 3.x ya está
 *  soportado (configPensamiento manda thinkingLevel en vez de thinkingBudget):
 *  en Vercel, CHAT_MODEL=gemini-3.5-flash + GEMINI_LEVEL=low y listo. */
export const MODELO_CHAT = 'gemini-2.5-flash';
export const MODELO_EXTRACT = 'gemini-2.5-flash';
export const THINKING_DEFECTO = 0;

/** Niveles de razonamiento de la familia Gemini 3 (docs: minimal|low|medium|high). */
export const NIVELES = ['minimal', 'low', 'medium', 'high'];
export const NIVEL_DEFECTO = 'low';

/** La clave vive solo en el entorno del servidor. GEMINI_API_KEY es el nombre oficial. */
export function claveGemini(env) {
  return String((env && (env.GEMINI_API_KEY || env.GOOGLE_API_KEY)) || '');
}

/**
 * Control del "pensamiento" según la familia del modelo — cada una usa su perilla:
 *   · Gemini 2.5 → `thinkingBudget` (tokens). 0 = cero pensamientos: latencia de voz.
 *   · Gemini 3.x → `thinkingLevel` (minimal|low|medium|high). NO acepta
 *     thinkingBudget (la API lo rechaza), así que con gemini-3.5-flash /
 *     3.8-flash se manda el nivel: 'low' por defecto, subible con GEMINI_LEVEL.
 * Esto es lo que permite cambiar de modelo con una variable en Vercel
 * (CHAT_MODEL=gemini-3.5-flash) sin romper la llamada ni pagar latencia de más.
 */
export function configPensamiento(env, modelo) {
  if (/^gemini-3/i.test(String(modelo || ''))) {
    const nivel = String((env && env.GEMINI_LEVEL) || NIVEL_DEFECTO).toLowerCase();
    return { thinkingLevel: NIVELES.includes(nivel) ? nivel : NIVEL_DEFECTO };
  }
  const budget = Number((env && env.GEMINI_THINKING) ?? THINKING_DEFECTO);
  return Number.isFinite(budget) && budget >= 0 ? { thinkingBudget: budget } : null;
}

function safeJson(s) {
  try { const v = JSON.parse(s); return v && typeof v === 'object' ? v : {}; } catch (e) { return {}; }
}
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const reintentable = (s) => s === 429 || s === 500 || s === 503;
function reintentoMs(env) {
  const n = Number(env && env.GEMINI_RETRY_MS);
  return Number.isFinite(n) && n >= 0 ? n : 900;
}

/** content puede venir como string o como lista de partes: devuelve solo texto. */
function textoDe(c) {
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) return c.filter((p) => p && p.type === 'text').map((p) => p.text || '').join('');
  return '';
}

/** finishReason de Gemini → vocabulario interno ('tool_calls' | 'length' | 'stop'). */
export function mapearFinish(f, tools) {
  if (tools && tools.length) return 'tool_calls';   // Gemini reporta STOP aunque llame tools
  if (f === 'MAX_TOKENS') return 'length';
  return 'stop';
}

/** JSON Schema OpenAI (minúsculas) → esquema Gemini (MAYÚSCULAS, claves permitidas). */
export function aEsquema(es) {
  if (!es || typeof es !== 'object') return { type: 'OBJECT' };
  const out = {};
  if (es.type) out.type = String(es.type).toUpperCase();
  if (es.description) out.description = es.description;
  if (Array.isArray(es.enum)) out.enum = es.enum;
  if (es.properties) {
    out.properties = {};
    for (const [k, v] of Object.entries(es.properties)) out.properties[k] = aEsquema(v);
  }
  if (Array.isArray(es.required) && es.required.length) out.required = es.required;
  if (es.items) out.items = aEsquema(es.items);
  return out;
}

/** tools OpenAI [{type:'function',function:{…}}] → functionDeclarations de Gemini. */
export function aDeclaraciones(tools) {
  return (tools || [])
    .map((t) => {
      const fn = (t && (t.function || t)) || {};
      return { name: fn.name || '', description: fn.description || '', parameters: aEsquema(fn.parameters) };
    })
    .filter((d) => d.name);
}

/** El resultado de una tool viaja como objeto (functionResponse.response). */
function respuestaTool(c) {
  if (c && typeof c === 'object') return c;
  const j = safeJson(c);
  return Object.keys(j).length ? j : { resultado: String(c ?? '') };
}

/**
 * Mensajes OpenAI → contents de Gemini.
 * user→user, assistant→model (texto + functionCall con su thoughtSignature),
 * tool→functionResponse en turno user (Gemini no tiene rol 'tool'; el nombre se
 * recupera del tool_call_id porque chat.js no lo repite en el resultado).
 */
export function aContents(messages) {
  const out = [];
  const nombresPorId = new Map();
  let ultimoNombre = '';   // Gemini 2.5 no trae id en functionCall: se resuelve por orden
  for (const m of messages || []) {
    if (!m) continue;
    if (m.role === 'assistant') {
      const parts = [];
      const txt = textoDe(m.content);
      if (txt) parts.push({ text: txt });
      for (const tc of m.tool_calls || []) {
        const fn = tc.function || {};
        if (!fn.name) continue;
        const fc = { name: fn.name, args: safeJson(fn.arguments) };
        ultimoNombre = fn.name;
        if (tc.id) { fc.id = tc.id; nombresPorId.set(tc.id, fn.name); }
        const part = { functionCall: fc };
        if (tc.sig) part.thoughtSignature = tc.sig;   // Gemini 3 la exige de vuelta
        parts.push(part);
      }
      if (parts.length) out.push({ role: 'model', parts });
    } else if (m.role === 'tool') {
      const fr = {
        name: m.name || nombresPorId.get(m.tool_call_id) || ultimoNombre,
        response: respuestaTool(m.content),
      };
      if (m.tool_call_id) fr.id = m.tool_call_id;
      const last = out[out.length - 1];
      if (last && last.role === 'user' && last.parts.every((p) => p.functionResponse)) {
        last.parts.push({ functionResponse: fr });    // resultados paralelos: un solo turno
      } else {
        out.push({ role: 'user', parts: [{ functionResponse: fr }] });
      }
    } else if (m.role === 'user') {
      out.push({ role: 'user', parts: [{ text: textoDe(m.content) }] });
    }
    // role 'system' suelto en messages: se ignora (viaja en systemInstruction)
  }
  return out;
}

/** candidates[0] de una respuesta no-stream → turno interno. onTexto recibe el texto entero. */
export function extraerRespuesta(j, onTexto = null) {
  const cand = (j && j.candidates && j.candidates[0]) || {};
  const parts = (cand.content && cand.content.parts) || [];
  let texto = '';
  const tools = [];
  for (const p of parts) {
    if (typeof p.text === 'string' && p.text && !p.thought) {
      texto += p.text;
      if (onTexto) onTexto(p.text);
    }
    if (p.functionCall && p.functionCall.name) {
      tools.push({
        id: p.functionCall.id || '',
        name: p.functionCall.name,
        input: p.functionCall.args || {},
        sig: p.thoughtSignature || '',
      });
    }
  }
  const u = j && j.usageMetadata;
  return {
    texto,
    tools,
    finish: mapearFinish(cand.finishReason, tools),
    uso: u ? { prompt_tokens: u.promptTokenCount || 0, completion_tokens: u.candidatesTokenCount || 0, total_tokens: u.totalTokenCount || 0 } : null,
  };
}

/**
 * Parser SSE de streamGenerateContent: mismos cuidados que el de Grok (trozos
 * que parten UTF-8 y eventos a la mitad). Las partes thought:true se ignoran;
 * los functionCall se acumulan por id/nombre fusionando args y guardando la
 * thoughtSignature (puede llegar en un chunk propio).
 */
export async function parsearSSEGemini(cuerpo, onTexto) {
  const reader = cuerpo.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let texto = '';
  let finish = null;
  let uso = null;
  const llamadas = new Map();   // id|nombre → { id, name, input, sig }

  const procesarEvento = (evento) => {
    for (const linea of evento.split('\n')) {
      if (!linea.startsWith('data:')) continue;
      const crudo = linea.slice(5).trim();
      if (!crudo) continue;
      let d;
      try { d = JSON.parse(crudo); } catch (e) { continue; }

      if (d.usageMetadata) {
        const u = d.usageMetadata;
        uso = { prompt_tokens: u.promptTokenCount || 0, completion_tokens: u.candidatesTokenCount || 0, total_tokens: u.totalTokenCount || 0 };
      }
      const cand = (d.candidates && d.candidates[0]) || null;
      if (!cand) continue;
      if (cand.finishReason) finish = cand.finishReason;

      for (const p of (cand.content && cand.content.parts) || []) {
        if (typeof p.text === 'string' && p.text && !p.thought) {
          texto += p.text;
          if (onTexto) onTexto(p.text);
        }
        if (p.functionCall && (p.functionCall.name || p.functionCall.id)) {
          const k = String(p.functionCall.id || p.functionCall.name);
          let acc = llamadas.get(k);
          if (!acc) { acc = { id: p.functionCall.id || '', name: '', input: {}, sig: '' }; llamadas.set(k, acc); }
          if (p.functionCall.name) acc.name = p.functionCall.name;
          if (p.functionCall.args && typeof p.functionCall.args === 'object') Object.assign(acc.input, p.functionCall.args);
          if (p.thoughtSignature) acc.sig = p.thoughtSignature;
        }
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

  const tools = [...llamadas.values()].filter((a) => a.name);
  return { texto, tools, finish: mapearFinish(finish, tools), uso };
}

/**
 * Llama a Gemini. Devuelve SIEMPRE el turno ensamblado:
 *   { texto, tools: [{id,name,input,sig}], finish: 'stop'|'tool_calls'|'length', uso }
 * En streaming, además, va llamando a onTexto(delta) con cada trozo de texto.
 *
 * opts: idénticos a grok() — { model, max_tokens, system, tools, messages, stream, json, onTexto }
 */
export async function gemini(env, opts, fetchImpl) {
  const f = fetchImpl || ((...a) => globalThis.fetch(...a));
  const {
    model, max_tokens = 350, system, tools = null, messages,
    stream = false, json = false, onTexto = null,
  } = opts;

  const nombreModelo = model || MODELO_CHAT;
  const pensar = configPensamiento(env, nombreModelo);
  const cuerpo = {
    contents: aContents(messages),
    ...(system ? { systemInstruction: { parts: [{ text: String(system) }] } } : {}),
    ...(tools && tools.length
      ? { tools: [{ functionDeclarations: aDeclaraciones(tools) }], toolConfig: { functionCallingConfig: { mode: 'AUTO' } } }
      : {}),
    generationConfig: {
      maxOutputTokens: max_tokens,
      ...(json ? { responseMimeType: 'application/json' } : {}),
      ...(pensar ? { thinkingConfig: pensar } : {}),
    },
  };

  const base = String((env && env.GEMINI_BASE_URL) || BASE);
  const cab = { 'Content-Type': 'application/json', 'x-goog-api-key': claveGemini(env) };
  const mandar = (url) => f(url, { method: 'POST', headers: cab, body: JSON.stringify(cuerpo) });
  const urlGen = `${base}/models/${nombreModelo}:generateContent`;
  const urlSse = `${base}/models/${nombreModelo}:streamGenerateContent?alt=sse`;

  const fallar = async (r) => {
    let detalle = '';
    try { detalle = await r.text(); } catch (e) { /* nada */ }
    throw new Error(`gemini ${r.status} ${detalle.slice(0, 200)}`);
  };

  if (!stream) {
    let r = await mandar(urlGen);
    if (!r.ok && reintentable(r.status)) { await dormir(reintentoMs(env)); r = await mandar(urlGen); }
    if (!r.ok) return fallar(r);
    return extraerRespuesta(await r.json());
  }

  // Stream con red de seguridad: el free tier cierra con 429/503 esporádicos.
  // 1 reintento en stream y, si sigue cerrado, generateContent normal (la frase
  // llega completa por onTexto: se pierde el goteo, no la conversación).
  let r = await mandar(urlSse);
  if (!r.ok && reintentable(r.status)) { await dormir(reintentoMs(env)); r = await mandar(urlSse); }
  if (r.ok) return parsearSSEGemini(r.body, onTexto);
  if (reintentable(r.status)) {
    const r2 = await mandar(urlGen);
    if (r2.ok) return extraerRespuesta(await r2.json(), onTexto);
    return fallar(r2);
  }
  return fallar(r);
}
