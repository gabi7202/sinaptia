/**
 * llm.js — Un solo cerebro, tres proveedores.
 *
 * Regla simple: LLM_PROVIDER=gemini|grok|groq fuerza uno; sin forzar, se elige
 * por la clave presente: GEMINI_API_KEY → gemini, GROQ_API_KEY → groq,
 * si no XAI_API_KEY → grok. Los modelos por defecto cambian con el proveedor;
 * CHAT_MODEL / EXTRACT_MODEL en Vercel mandan sobre los tres.
 *
 * chat.js y resumen.js importan SOLO de aquí: nunca saben qué marca contesta.
 */
import { grok, MODELO_CHAT as GROK_CHAT, MODELO_EXTRACT as GROK_EXTRACT, claveGrok } from './grok.js';
import { gemini, MODELO_CHAT as GEMINI_CHAT, MODELO_EXTRACT as GEMINI_EXTRACT, claveGemini } from './gemini.js';
import { groq, MODELO_CHAT as GROQ_CHAT, MODELO_EXTRACT as GROQ_EXTRACT, claveGroq } from './groq.js';

export function proveedor(env) {
  const e = env || {};
  const p = String(e.LLM_PROVIDER || '').toLowerCase();
  if (p === 'grok' || p === 'xai') return 'grok';
  if (p === 'gemini' || p === 'google') return 'gemini';
  if (p === 'groq') return 'groq';
  if (claveGemini(e)) return 'gemini';
  if (claveGroq(e)) return 'groq';
  return 'grok';
}

export function modeloChat(env) {
  const p = proveedor(env);
  return p === 'gemini' ? GEMINI_CHAT : p === 'groq' ? GROQ_CHAT : GROK_CHAT;
}
export function modeloExtract(env) {
  const p = proveedor(env);
  return p === 'gemini' ? GEMINI_EXTRACT : p === 'groq' ? GROQ_EXTRACT : GROK_EXTRACT;
}

/** Mismo contrato que grok()/gemini(): { texto, tools, finish, uso }. */
export function llm(env, opts, fetchImpl) {
  const p = proveedor(env);
  if (p === 'gemini') return gemini(env, opts, fetchImpl);
  if (p === 'groq') return groq(env, opts, fetchImpl);
  return grok(env, opts, fetchImpl);
}

export { claveGrok, claveGemini, claveGroq };
