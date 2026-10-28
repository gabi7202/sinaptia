/**
 * memoria-sesion.js — Normaliza la memoria temporal que manda el navegador.
 *
 * El cliente guarda la conversación en localStorage con TTL (memoriaSesion.js) y
 * la envía en cada turno. El servidor NO confía en ese JSON: lo recorta, lo
 * etiqueta y lo convierte en datos. Así Groq no pierde el hilo aunque no haya
 * Supabase configurado, sin abrir la puerta a prompts gigantes ni inyecciones.
 */

const CAMPOS_LEAD = [
  'nombre', 'empresa', 'email', 'telefono', 'sector', 'dolor', 'volumen',
  'herramientas', 'urgencia', 'rol', 'pais', 'presupuesto',
];

const MAX_TURNOS = 16;
const MAX_TEXTO = 800;

function texto(v, max = MAX_TEXTO) {
  return String(v == null ? '' : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ' ').trim().slice(0, max);
}

/** Devuelve una memoria segura o null. Nunca lanza. */
export function normalizarMemoria(m, { maxTurnos = MAX_TURNOS } = {}) {
  if (!m || typeof m !== 'object' || Array.isArray(m)) return null;
  const turnos = (Array.isArray(m.turnos) ? m.turnos : [])
    .slice(-maxTurnos)
    .map((t) => {
      if (!t || typeof t !== 'object') return null;
      const rol = t.rol === 'bot' || t.role === 'assistant' ? 'bot' : 'user';
      const txt = texto(t.texto ?? t.content ?? '');
      return txt ? { rol, texto: txt } : null;
    })
    .filter(Boolean);
  if (!turnos.length && !m.lead) return null;

  const lead = {};
  const origen = m.lead && typeof m.lead === 'object' ? m.lead : {};
  for (const k of CAMPOS_LEAD) {
    const v = texto(origen[k], k === 'email' ? 120 : 220);
    if (v) lead[k] = k === 'email' ? v.toLowerCase() : v;
  }

  return {
    resumen: texto(m.resumen || '', 600),
    idioma: texto(m.idioma || '', 8),
    actualizado: texto(m.actualizado || '', 40),
    lead: Object.keys(lead).length ? lead : null,
    turnos,
  };
}

/** Convierte la memoria en texto compacto para el prompt (por si se necesita). */
export function memoriaComoTexto(m) {
  const n = normalizarMemoria(m);
  if (!n) return 'sin memoria';
  const lineas = n.turnos.map((t) => `${t.rol === 'bot' ? 'NEXA' : 'VISITANTE'}: ${t.texto}`);
  return [
    n.resumen ? `RESUMEN: ${n.resumen}` : '',
    n.lead ? `LEAD: ${JSON.stringify(n.lead)}` : '',
    ...lineas,
  ].filter(Boolean).join('\n').slice(0, 6000);
}

export { CAMPOS_LEAD };
