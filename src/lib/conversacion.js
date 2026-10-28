/**
 * conversacion.js — El puente entre el motor determinista y Groq.
 *
 * El motor produce el guion (corrección, propuesta, siguiente pregunta, lead).
 * Groq lo convierte en lenguaje natural y devuelve datos nuevos. Aquí se aplican
 * esos datos al lead sin pisar lo que el visitante ya dijo, y se decide si el
 * turno sale del modelo o del motor (degradación).
 *
 * Una sola implementación para el chat del sitio, la voz del dock y /voz: así el
 * comportamiento no deriva entre superficies.
 */

import { razonar } from './ia.js';

const CAMPOS = ['nombre', 'empresa', 'email', 'telefono', 'sector', 'dolor', 'volumen',
  'herramientas', 'urgencia', 'rol', 'pais', 'presupuesto'];

/**
 * Aplica datos nuevos al lead. Nunca pisa un dato ya dicho: si el modelo
 * "corrige" un email, se conserva el primero que dio el visitante.
 */
export function aplicarDatos(lead, datos) {
  if (!lead || !datos || typeof datos !== 'object') return lead;
  for (const k of CAMPOS) {
    let v = datos[k];
    if (v == null || v === '') continue;
    v = String(v).replace(/\s+/g, ' ').trim();
    if (!v) continue;
    if (k === 'email') {
      const m = v.match(/[\w.+-]+@[\w-]+\.[\w.]{2,}/);
      if (!m) continue;
      v = m[0].toLowerCase();
    }
    if (!lead[k]) lead[k] = v.slice(0, k === 'email' ? 120 : 240);
  }
  return lead;
}

/** Calificación 0–100 para que el dueño priorice (no se muestra al cliente). */
export function puntuarLead(lead = {}) {
  const pesos = {
    sector: 10, dolor: 20, volumen: 10, nombre: 10, email: 20, empresa: 10,
    urgencia: 10, herramientas: 5, rol: 5,
  };
  let puntos = 0;
  const faltan = [];
  for (const [k, p] of Object.entries(pesos)) {
    if (lead[k]) puntos += p;
    else faltan.push(k);
  }
  const nivel = puntos >= 70 ? 'caliente' : puntos >= 40 ? 'tibio' : 'frío';
  return { puntos: Math.min(100, puntos), nivel, faltan };
}

/** Siguiente dato que más acerca a una propuesta útil. */
export function siguienteCampo(lead = {}) {
  for (const k of ['sector', 'dolor', 'volumen', 'urgencia', 'nombre', 'email', 'empresa']) {
    if (!lead[k]) return k;
  }
  return null;
}

/**
 * Un turno completo.
 * @returns {Promise<object>} respuesta del motor enriquecida con el modelo
 *   { texto, guion, lead, etapa, listoParaPdf, modo: 'ia'|'motor', intencion, ... }
 */
export async function responderTurno({
  texto, canal = 'chat', idioma = 'es', historial = [], memoria = null,
  agente, endpoint = null, timeoutMs = 12000,
}) {
  if (!agente || typeof agente.responder !== 'function') throw new Error('agente inválido');
  const r = agente.responder(texto);          // avanza estado y produce el guion
  let mostrar = r.texto;
  let modo = 'motor';
  let intencion = r.guion.intencion;
  let confianza = null;
  let siguienteAccion = null;
  let objecion = null;
  let datosNuevos = null;

  if (endpoint) {
    const j = await razonar({
      mensaje: texto,
      historial,
      memoria,
      idioma,
      canal,
      lead: r.guion.lead,
      guion: r.guion,
      endpoint,
      timeoutMs,
    });
    if (j) {
      mostrar = j.respuesta;
      modo = 'ia';
      intencion = j.intencion;
      confianza = j.confianza;
      siguienteAccion = j.siguiente_accion;
      objecion = j.objecion;
      datosNuevos = j.datos;
      // la IA rellena huecos que el motor no capturó, nunca pisa lo ya dicho
      aplicarDatos(agente.lead, j.datos);
    }
  }

  r.texto = mostrar;
  r.modo = modo;
  r.intencion = intencion;
  r.confianza = confianza;
  r.siguienteAccion = siguienteAccion;
  r.objecion = objecion;
  r.datosNuevos = datosNuevos;
  return r;
}

const RETOMA = {
  es: (tema, cuando) => `Continuamos donde quedaste${cuando ? ` (${cuando})` : ''}: ${tema}. Si prefieres empezar de cero, escribe "empezar de cero".`,
  en: (tema, cuando) => `Picking up where you left off${cuando ? ` (${cuando})` : ''}: ${tema}. If you'd rather start over, type "start over".`,
  pt: (tema, cuando) => `Continuamos de onde você parou${cuando ? ` (${cuando})` : ''}: ${tema}. Se preferir começar de zero, escreva "começar de novo".`,
};

/** Mensaje corto para retomar sin volver a preguntar lo ya respondido. */
export function textoRetoma(idioma = 'es', memoria = null) {
  const lead = (memoria && memoria.lead) || {};
  const tema = lead.dolor || lead.sector || lead.empresa || (idioma === 'en' ? 'your project' : idioma === 'pt' ? 'seu projeto' : 'tu proyecto');
  let cuando = '';
  if (memoria && memoria.actualizado) {
    try {
      const d = new Date(memoria.actualizado);
      cuando = d.toLocaleDateString(idioma === 'en' ? 'en' : idioma === 'pt' ? 'pt' : 'es', { day: 'numeric', month: 'short' });
    } catch (e) { cuando = ''; }
  }
  return (RETOMA[idioma] || RETOMA.es)(tema, cuando);
}

export { CAMPOS };
