/**
 * ia.js — Cerebro LLM del agente, con contrato estricto y red de seguridad.
 *
 * El sitio es estático, así que las claves NUNCA viven aquí: el navegador llama
 * a un proxy tuyo (ver infra/worker-ia.js o api/ia.js) que guarda la clave de
 * Groq y reenvía. Sin proxy configurado, el agente sigue funcionando con el
 * motor determinista: degrada, no se rompe.
 *
 * Contrato de salida del modelo (si no cumple, se descarta y manda el motor):
 *   {
 *     respuesta:  string            · lo que se dice/escribe, corto y propio
 *     intencion:  string            · patrón detectado en lenguaje claro
 *     confianza:  0..1
 *     datos:      {sector?, dolor?, ...}
 *     paso:       'seguir' | 'cerrar'
 *     siguiente_accion?: string
 *     objecion?:  string|null
 *     idioma_detectado?: 'en'|'es'|'pt'
 *   }
 *
 * Regla de oro del prompt: el modelo NO lee el sitio. Recibe el guion estructurado
 * que produjo el motor (intención, etapa, corrección, propuesta, siguiente pregunta,
 * memoria temporal) y lo convierte en lenguaje natural propio. Las correcciones y
 * los rangos de inversión los pone el guion, no la imaginación del modelo.
 */

export const CONTRATO_VERSION = '2.0.0';

/** Campos que el modelo puede rellenar. Todo lo demás se descarta. */
export const CAMPOS_DATOS = [
  'nombre', 'empresa', 'email', 'telefono', 'sector', 'dolor', 'volumen',
  'herramientas', 'urgencia', 'rol', 'pais', 'presupuesto',
];

const MAX_DATO = { email: 120, nombre: 60, empresa: 90, telefono: 40, defecto: 240 };

/** Extrae el primer objeto JSON plausible de un texto (fences, prosa, cortes). */
export function extraerJSON(entrada) {
  if (entrada && typeof entrada === 'object') return entrada;
  if (typeof entrada !== 'string') return null;
  const s = entrada.replace(/```json/gi, '```').replace(/```/g, '').trim();
  try { return JSON.parse(s); } catch (e) { /* sigue */ }

  const inicio = s.indexOf('{');
  if (inicio < 0) return null;
  let nivel = 0, enTexto = false, escape = false;
  for (let i = inicio; i < s.length; i++) {
    const c = s[i];
    if (enTexto) {
      if (escape) escape = false;
      else if (c === '\\') escape = true;
      else if (c === '"') enTexto = false;
      continue;
    }
    if (c === '"') { enTexto = true; continue; }
    if (c === '{') nivel++;
    if (c === '}') {
      nivel--;
      if (nivel === 0) {
        try { return JSON.parse(s.slice(inicio, i + 1)); } catch (e) { return null; }
      }
    }
  }
  return null;
}

function limpiarDato(k, v) {
  if (v == null) return null;
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  if (typeof v !== 'string') return null;
  const max = MAX_DATO[k] || MAX_DATO.defecto;
  const s = v.replace(/[\u0000-\u001F]/g, ' ').replace(/\s{2,}/g, ' ').trim().slice(0, max);
  if (!s) return null;
  if (k === 'email') {
    const m = s.match(/[\w.+-]+@[\w-]+\.[\w.]{2,}/);
    return m ? m[0].toLowerCase() : null;
  }
  return s;
}

/** Solo datos explícitos y con forma válida. Nada de objetos anidados. */
export function normalizarDatos(datos) {
  const out = {};
  if (!datos || typeof datos !== 'object') return out;
  for (const k of CAMPOS_DATOS) {
    const v = limpiarDato(k, datos[k]);
    if (v) out[k] = v;
  }
  return out;
}

/** Números de un texto, sin símbolos: 'US$1,800' y '1.800 USD' → [1800]. */
export function numeros(texto) {
  return (String(texto || '').match(/\d[\d.,]*/g) || [])
    .map((n) => Number(n.replace(/[.,](?=\d{3}\b)/g, '').replace(/,/g, '')))
    .filter((n) => Number.isFinite(n));
}

/**
 * Revisa promesas que el modelo pudo inventar aunque el guion no las traiga.
 * Devuelve null si es seguro o el motivo si hay que descartarlo.
 */
export function riesgoComercial(respuesta, guion = {}) {
  const txt = String(respuesta || '');
  const permitido = JSON.stringify(guion || {});
  const plazos = txt.match(/\b(?:en|dentro de|within|in)\s+(?:\d+|un|una|uno|dos|tres|cuatro|cinco|seis|seven|two|three|four|five|six)\s*(?:d[ií]as?|semanas?|meses?|days?|weeks?|months?)\b/gi) || [];
  for (const p of plazos) {
    if (!permitido.toLowerCase().includes(p.toLowerCase())) return `plazo no autorizado: ${p}`;
  }
  if (/\b(garantiz\w*|guarantee\w*|100\s?%\s*(?:seguro|garantizado|exacto|accurate|guaranteed))\b/i.test(txt) &&
      !/garantiz|guarantee/i.test(permitido)) {
    return 'garantía no autorizada';
  }
  if (/(?:US\$|\$|USD|EUR)\s?\d/i.test(txt)) {
    const enGuion = new Set(numeros(permitido));
    for (const n of numeros(txt)) {
      if (n >= 100 && !enGuion.has(n)) return `cifra no autorizada: ${n}`;
    }
  }
  return null;
}

/**
 * Razona un turno con el LLM del proxy.
 * @returns {object|null} el contrato validado, o null si no hay proxy o falló.
 */
export async function razonar({
  mensaje, historial = [], memoria = null, idioma = 'es', canal = 'chat',
  lead = null, guion = {}, endpoint = null, timeoutMs = 12000,
}) {
  if (!endpoint) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  // La memoria ya puede incluir el mensaje actual (el cliente lo añade antes de
  // llamar). Se quita del contexto para no mandarlo dos veces al modelo.
  const turnosMemoria = memoria && Array.isArray(memoria.turnos) ? memoria.turnos.slice(-14).map((t) => ({
    rol: t.rol === 'bot' || t.role === 'assistant' ? 'bot' : 'user',
    texto: String(t.texto ?? t.content ?? ''),
  })) : [];
  if (turnosMemoria.length) {
    const ultimo = turnosMemoria[turnosMemoria.length - 1];
    if (ultimo.rol === 'user' && ultimo.texto.trim() === String(mensaje).trim()) turnosMemoria.pop();
  }
  let r;
  try {
    r = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: ctrl.signal,
      body: JSON.stringify({
        mensaje,
        historial: historial.slice(-10),
        memoria: memoria ? {
          resumen: memoria.resumen || '',
          lead: memoria.lead || null,
          turnos: turnosMemoria,
          idioma: memoria.idioma || idioma,
          actualizado: memoria.actualizado || '',
        } : null,
        idioma, canal, lead, guion,
        contrato: CONTRATO_VERSION,
      }),
    });
  } catch (e) {
    clearTimeout(timer);
    return null;
  }
  clearTimeout(timer);
  if (!r.ok) return null;

  let j;
  try { j = await r.json(); } catch (e) { return null; }
  return validar(j, { guion });
}

/** Descarta respuestas que no cumplen el contrato: mejor mudo que alucinado. */
export function validar(j, { guion = null } = {}) {
  if (typeof j === 'string') j = extraerJSON(j);
  if (!j || typeof j !== 'object') return null;
  if (typeof j.respuesta !== 'string' || !j.respuesta.trim()) return null;

  const respuesta = j.respuesta.trim().slice(0, 2200);
  if (guion) {
    const riesgo = riesgoComercial(respuesta, guion);
    if (riesgo) return null;
  }

  const conf = Number(j.confianza);
  const paso = j.paso === 'cerrar' || j.paso === 'cerrado' ? 'cerrar' : 'seguir';
  return {
    respuesta,
    intencion: typeof j.intencion === 'string' && j.intencion.trim()
      ? j.intencion.trim().slice(0, 160) : 'sin patrón claro',
    confianza: Number.isFinite(conf) ? Math.max(0, Math.min(1, conf)) : 0.5,
    datos: normalizarDatos(j.datos),
    paso,
    siguiente_accion: typeof j.siguiente_accion === 'string'
      ? j.siguiente_accion.trim().slice(0, 200) : null,
    objecion: typeof j.objecion === 'string' && j.objecion.trim()
      ? j.objecion.trim().slice(0, 200) : null,
    idioma_detectado: ['en', 'es', 'pt'].includes(j.idioma_detectado) ? j.idioma_detectado : null,
  };
}
