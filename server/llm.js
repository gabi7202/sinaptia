/**
 * llm.js — Un solo cerebro, dos proveedores.
 *
 * Regla simple: si el entorno trae GEMINI_API_KEY (o GOOGLE_API_KEY), se habla
 * con Gemini (Google AI Studio, free tier); si no, con Grok (xAI). Se puede
 * forzar con LLM_PROVIDER=gemini|grok. Los modelos por defecto cambian con el
 * proveedor; CHAT_MODEL / EXTRACT_MODEL en Vercel mandan sobre ambos.
 *
 * chat.js y resumen.js importan SOLO de aquí: nunca saben qué marca contesta.
 */
import { grok, MODELO_CHAT as GROK_CHAT, MODELO_EXTRACT as GROK_EXTRACT, claveGrok } from './grok.js';
import { gemini, MODELO_CHAT as GEMINI_CHAT, MODELO_EXTRACT as GEMINI_EXTRACT, claveGemini } from './gemini.js';

export function proveedor(env) {
  const e = env || {};
  const p = String(e.LLM_PROVIDER || '').toLowerCase();
  if (p === 'grok' || p === 'xai') return 'grok';
  if (p === 'gemini' || p === 'google') return 'gemini';
  return claveGemini(e) ? 'gemini' : 'grok';
}

export function modeloChat(env) {
  return proveedor(env) === 'gemini' ? GEMINI_CHAT : GROK_CHAT;
}
export function modeloExtract(env) {
  return proveedor(env) === 'gemini' ? GEMINI_EXTRACT : GROK_EXTRACT;
}

/** Mismo contrato que grok()/gemini(): { texto, tools, finish, uso }. */
export function llm(env, opts, fetchImpl) {
  return proveedor(env) === 'gemini'
    ? gemini(env, opts, fetchImpl)
    : grok(env, opts, fetchImpl);
}

export { claveGrok, claveGemini };
