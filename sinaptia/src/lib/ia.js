/**
 * ia.js — Cerebro LLM del agente, con contrato estricto y red de seguridad.
 *
 * El sitio es estático, así que las claves NUNCA viven aquí: el navegador llama
 * a un proxy tuyo (ver infra/worker-ia.js, un Cloudflare Worker de ~60 líneas)
 * que guarda la clave del proveedor y reenvía. Sin proxy configurado, el agente
 * sigue funcionando con el motor determinista: degrada, no se rompe.
 *
 * Contrato de salida del modelo (si no cumple, se descarta y manda el motor):
 *   {
 *     respuesta:  string            · lo que se dice/escribe, corto y propio
 *     intencion:  string            · patrón detectado en lenguaje claro
 *     confianza:  0..1
 *     datos:      {sector?, dolor?, volumen?, nombre?, email?, empresa?}
 *     paso:       'seguir' | 'cerrar'
 *   }
 *
 * Regla de oro del prompt: el modelo NO lee el sitio. Recibe el guion estructurado
 * que produjo el motor (intención, etapa, corrección, propuesta, siguiente pregunta)
 * y lo convierte en lenguaje natural propio. Las correcciones y los rangos de
 * inversión los pone el guion, no la imaginación del modelo.
 */

const SISTEMA = (idioma, canal, guion) => `Eres Nexa, el agente de diagnóstico de IA de SINAPTIA.
Hablas en ${idioma}. Canal: ${canal === 'voz' ? 'llamada de voz' : 'chat'}.

TRABAJO DE ESTE TURNO (guion estructurado, producido por el motor; es tu única fuente de verdad):
${JSON.stringify(guion, null, 1)}

REGLAS INVIOABLES:
- ${canal === 'voz' ? 'Máximo 2 frases. Frases cortas, habladas, sin listas ni markdown.' : 'Máximo 4 frases. Sin markdown salvo que el guion traiga una propuesta.'}
- NO leas ni describas el sitio, sus secciones, sus botones ni su diseño. No digas "en esta página".
- NO inventes precios, plazos ni cifras. Si el guion trae un rango, úsalo tal cual; si no, no des números.
- Si el guion trae una correccion, dila primero con respeto y sin regañar, y termina con la pregunta del guion.
- Si el guion trae una pregunta siguiente, termina con ella, reformulada con tus palabras.
- Si no sabes algo: dilo y ofrece verificarlo con un humano. Nunca rellenes huecos.
- Detecta el patrón del mensaje del cliente y ponlo en intencion, en lenguaje claro.
- Extrae a datos cualquier campo que el cliente haya dicho en este mensaje (sector, dolor,
  volumen, nombre, email, empresa). Solo lo dicho, nunca lo supuesto.

Responde ÚNICAMENTE con un objeto JSON válido con esta forma:
{"respuesta":string,"intencion":string,"confianza":number,"datos":object,"paso":"seguir"|"cerrar"}`;

/**
 * Razona un turno con el LLM del proxy.
 * @returns {object|null} el contrato validado, o null si no hay proxy o falló.
 */
export async function razonar({ mensaje, historial = [], idioma = 'es', canal = 'chat', lead = null, guion = {}, endpoint = null, timeoutMs = 12000 }) {
  if (!endpoint) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let r;
  try {
    r = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: ctrl.signal,
      body: JSON.stringify({ mensaje, historial: historial.slice(-8), idioma, canal, lead, guion }),
    });
  } catch (e) {
    clearTimeout(timer);
    return null;
  }
  clearTimeout(timer);
  if (!r.ok) return null;

  let j;
  try { j = await r.json(); } catch (e) { return null; }
  return validar(j);
}

/** Descarta respuestas que no cumplen el contrato: mejor mudo que alucinado. */
export function validar(j) {
  if (!j || typeof j !== 'object') return null;
  if (typeof j.respuesta !== 'string' || !j.respuesta.trim()) return null;
  const conf = Number(j.confianza);
  return {
    respuesta: j.respuesta.trim(),
    intencion: typeof j.intencion === 'string' ? j.intencion : 'sin patrón claro',
    confianza: Number.isFinite(conf) ? Math.max(0, Math.min(1, conf)) : 0.5,
    datos: (j.datos && typeof j.datos === 'object') ? j.datos : {},
    paso: j.paso === 'cerrar' ? 'cerrar' : 'seguir',
  };
}
