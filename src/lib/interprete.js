/**
 * interprete.js — Utilidades del puente de voz para videollamadas.
 *
 * No es traducción simultánea: es interpretación por turnos, que es lo que de
 * verdad funciona en una llamada con una IA. El dueño habla español, el cliente
 * inglés, y cada lado lee/escucha al otro en su idioma.
 *
 * La UI vive en /interprete. Aquí solo lo testeable: pares de idioma, elección
 * de voz y transcripción bilingüe.
 */

export const PARES = {
  'en-es': { de: 'en', a: 'es', stt: 'en-US', tts: 'es-ES', etiqueta: 'EN → ES' },
  'es-en': { de: 'es', a: 'en', stt: 'es-ES', tts: 'en-US', etiqueta: 'ES → EN' },
  'en-pt': { de: 'en', a: 'pt', stt: 'en-US', tts: 'pt-BR', etiqueta: 'EN → PT' },
  'pt-en': { de: 'pt', a: 'en', stt: 'pt-BR', tts: 'en-US', etiqueta: 'PT → EN' },
};

export function par(dir) {
  return PARES[dir] || PARES['en-es'];
}

/** Elige la mejor voz para un idioma; prioriza voces neurales/naturales. */
export function elegirVoz(voices, lang, genero = 'femenina') {
  const lista = (voices || []).filter((v) => v && v.lang && v.lang.toLowerCase().startsWith(String(lang).split('-')[0]));
  if (!lista.length) return null;
  const FEM = /female|mujer|femenin|woman|helena|laura|monica|mónica|paulina|samantha|victoria|zira|aria|jenny|maria|maría|francisca|camila/i;
  const MAS = /\bmale\b|\bman\b|hombre|var[oó]n|jorge|carlos|diego|david|george|daniel/i;
  const generoOk = genero === 'masculina' ? lista.filter((v) => MAS.test(v.name))
    : genero === 'auto' ? lista : lista.filter((v) => FEM.test(v.name));
  const base = generoOk.length ? generoOk : lista;
  return base.find((v) => /natural|neural|google|microsoft|enhanced|premium/i.test(v.name)) ||
    base.find((v) => v.lang.toLowerCase() === String(lang).toLowerCase()) || base[0];
}

/** Transcripción legible de una sesión de intérprete. */
export function transcripcion(turnos = []) {
  return (turnos || []).map((t) => {
    const p = par(t.dir);
    return `[${p.etiqueta}] ${t.original || ''}\n→ ${t.traducido || ''}`;
  }).join('\n\n');
}

/** Mensaje de estado honesto: qué está pasando y qué no promete. */
export function estadoTexto(estado, dir = 'en-es') {
  const p = par(dir);
  const map = {
    inactivo: 'Listo. Elige un botón para empezar.',
    escuchando: `Escuchando en ${p.de.toUpperCase()}… habla en frases cortas.`,
    traduciendo: 'Traduciendo…',
    hablando: `Hablando en ${p.a.toUpperCase()}…`,
    error: 'No pude traducir. Revisa la conexión o usa el enlace a Google Translate.',
    sin_mic: 'Este navegador no reconoce voz. Usa Chrome, Edge o Safari; el texto de arriba sigue funcionando.',
  };
  return map[estado] || map.inactivo;
}
