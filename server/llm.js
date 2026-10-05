/**
 * llm.js — Un solo cerebro, UN proveedor: Groq (groq.com).
 *
 * Decisión de producto (2026-10): Gemini y Grok/xAI quedaron ELIMINADOS del
 * proyecto. La API OpenAI-compatible de Groq es gratis, rapidísima (LPU) y ya
 * está verificada contra el catálogo real de la cuenta. No hay enrutado por
 * claves ni prioridades: GROQ_API_KEY manda y punto.
 *   · CHAT_MODEL    → conversación (default openai/gpt-oss-120b)
 *   · EXTRACT_MODEL → resumen a lead (default openai/gpt-oss-20b)
 *
 * chat.js y resumen.js importan SOLO de aquí. El viejo parsearSSE vive ahora
 * en groq.js (único dueño del dialecto OpenAI-compatible).
 */
import { groq, modeloChat as GROQ_CHAT_FN, modeloExtract as GROQ_EXTRACT_FN, claveGroq, parsearSSE } from './groq.js';

/** Único proveedor posible. Se mantiene la firma para tests y compatibilidad. */
export function proveedor() { return 'groq'; }

// Groq lee CHAT_MODEL/EXTRACT_MODEL en tiempo de llamada (catálogo verificado
// en vivo: modelos que no existen en la cuenta devuelven 400 y rompen el chat).
export function modeloChat(env) { return GROQ_CHAT_FN(env); }
export function modeloExtract(env) { return GROQ_EXTRACT_FN(env); }

/** Contrato único: { texto, tools, finish, uso }. */
export function llm(env, opts, fetchImpl) {
  return groq(env, opts, fetchImpl);
}

export { claveGroq, parsearSSE };
