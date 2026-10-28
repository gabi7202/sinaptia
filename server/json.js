/**
 * json.js — Tolerancia y números, compartido por el proxy y el resumen.
 *
 * Los modelos a veces envuelven el JSON en ```json, le ponen una frase delante
 * o cortan el cierre. En vez de tirar el turno (y perder una venta), se extrae
 * el primer objeto plausible y se valida después.
 */

export function extraerJSON(entrada) {
  if (entrada && typeof entrada === 'object') return entrada;
  if (typeof entrada !== 'string') return null;
  const s = entrada.replace(/```json/gi, '```').replace(/```/g, '').trim();

  try { return JSON.parse(s); } catch (e) { /* sigue */ }

  // primer { … } equilibrado, respetando strings y escapes
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

/** Números de un texto, sin símbolos: 'US$1,800' y '1.800 USD' → [1800]. */
export function numeros(texto) {
  return (String(texto || '').match(/\d[\d.,]*/g) || [])
    .map((n) => Number(n.replace(/[.,](?=\d{3}\b)/g, '').replace(/,/g, '')))
    .filter((n) => Number.isFinite(n));
}

/**
 * Revisa promesas prohibidas que el modelo podría inventar aunque el guion no
 * las traiga: plazos, garantías y precios no autorizados. Devuelve null si el
 * texto es seguro; si no, el motivo.
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
  // Cifras con moneda: cada una debe existir en el guion
  if (/(?:US\$|\$|USD|EUR)\s?\d/i.test(txt)) {
    const enGuion = new Set(numeros(permitido));
    for (const n of numeros(txt)) {
      if (n >= 100 && !enGuion.has(n)) return `cifra no autorizada: ${n}`;
    }
  }
  return null;
}
