/**
 * claude.js — Anthropic por REST con fetch plano (sustituye al SDK que usaba B).
 *
 * Dos modos:
 *   · stream: false → JSON completo (lo usa el resumen de sesión con Haiku)
 *   · stream: true  → SSE: cada delta de texto se emite por onTexto mientras
 *     se ensambla el mensaje final (bloques text/tool_use + stop_reason), que
 *     es lo que necesita el bucle de herramientas del chat.
 *
 * Modelos por defecto: los de B (verificables con CHAT_MODEL / EXTRACT_MODEL).
 */

const API = 'https://api.anthropic.com/v1/messages';
const VERSION = '2023-06-01';

export const MODELO_CHAT = 'claude-sonnet-5';
export const MODELO_EXTRACT = 'claude-haiku-4-5-20251001';

function safeJson(s) { try { return JSON.parse(s); } catch (e) { return {}; } }

/**
 * Llama a Claude. Devuelve SIEMPRE el mensaje final ensamblado:
 *   { content: [{type:'text',text}|{type:'tool_use',id,name,input}], stop_reason }
 * En streaming, además, va llamando a onTexto(delta) con cada trozo de texto.
 */
export async function claude(env, opts, fetchImpl) {
  const f = fetchImpl || ((...a) => globalThis.fetch(...a));
  const {
    model, max_tokens = 350, system, tools = null, messages,
    stream = false, onTexto = null,
  } = opts;

  const r = await f(API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': String((env && env.ANTHROPIC_API_KEY) || ''),
      'anthropic-version': VERSION,
    },
    body: JSON.stringify({
      model: model || MODELO_CHAT,
      max_tokens,
      system,
      ...(tools && tools.length ? { tools } : {}),
      messages,
      ...(stream ? { stream: true } : {}),
    }),
  });
  if (!r.ok) {
    let detalle = '';
    try { detalle = await r.text(); } catch (e) { /* nada */ }
    throw new Error(`anthropic ${r.status} ${detalle.slice(0, 200)}`);
  }
  if (!stream) {
    const j = await r.json();
    return { content: j.content || [], stop_reason: j.stop_reason || null };
  }
  return parsearSSE(r.body, onTexto);
}

/**
 * Parser SSE mínimo: lee el cuerpo por chunks, procesa eventos completos y
 * ensambla los bloques. Los input_json_delta de tool_use se acumulan como
 * texto y se parsean al cerrar el bloque.
 */
export async function parsearSSE(cuerpo, onTexto) {
  const reader = cuerpo.getReader();
  const dec = new TextDecoder();
  let buf = '';
  const bloques = [];
  let stop_reason = null;

  const procesarEvento = (evento) => {
    for (const linea of evento.split('\n')) {
      if (!linea.startsWith('data:')) continue;
      let d;
      try { d = JSON.parse(linea.slice(5).trim()); } catch (e) { continue; }
      if (d.type === 'content_block_start') {
        const cb = d.content_block || {};
        bloques[d.index] = cb.type === 'tool_use'
          ? { type: 'tool_use', id: cb.id, name: cb.name, inputJson: '' }
          : { type: 'text', text: '' };
      } else if (d.type === 'content_block_delta') {
        const b = bloques[d.index];
        if (!b) continue;
        if (d.delta && d.delta.type === 'text_delta') {
          b.text += d.delta.text;
          if (onTexto) onTexto(d.delta.text);
        } else if (d.delta && d.delta.type === 'input_json_delta') {
          b.inputJson += d.delta.partial_json || '';
        }
      } else if (d.type === 'message_delta' && d.delta && d.delta.stop_reason) {
        stop_reason = d.delta.stop_reason;
      }
    }
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf('\n\n')) >= 0) {
      procesarEvento(buf.slice(0, idx));
      buf = buf.slice(idx + 2);
    }
  }
  buf += dec.decode();
  if (buf.trim()) procesarEvento(buf);

  const content = bloques.filter(Boolean).map((b) => (b.type === 'tool_use'
    ? { type: 'tool_use', id: b.id, name: b.name, input: safeJson(b.inputJson) }
    : { type: 'text', text: b.text }));
  return { content, stop_reason };
}
