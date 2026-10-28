/**
 * interprete.test.js — Pares de idioma, elección de voz y transcripción.
 *   node test/interprete.test.js
 */
import { par, elegirVoz, transcripcion, estadoTexto, PARES } from '../src/lib/interprete.js';

let ok = 0, fallos = [];
function t(n, c, d) { if (c) { ok++; console.log('  \x1b[32m✓\x1b[0m ' + n); } else { fallos.push(n + (d ? ' → ' + d : '')); console.log('  \x1b[31;1m✗\x1b[0m ' + n + (d ? '\n      ↳ ' + d : '')); } }

console.log('\n\x1b[1m  SINAPTIA · Intérprete por turnos\x1b[0m\n');

t('EN→ES y ES→EN tienen STT y TTS correctos',
  par('en-es').de === 'en' && par('en-es').a === 'es' && par('en-es').stt === 'en-US' && par('en-es').tts === 'es-ES' &&
  par('es-en').de === 'es' && par('es-en').a === 'en' && par('es-en').stt === 'es-ES' && par('es-en').tts === 'en-US');

t('dirección desconocida cae en EN→ES (no rompe la llamada)', par('xx').de === 'en' && par(null).a === 'es');

t('los pares incluyen portugués para el mercado BR', PARES['en-pt'].tts === 'pt-BR' && PARES['pt-en'].stt === 'pt-BR');

const voces = [
  { name: 'Microsoft David', lang: 'en-US' },
  { name: 'Google US English', lang: 'en-US' },
  { name: 'Microsoft Zira', lang: 'en-US' },
  { name: 'Mónica', lang: 'es-ES' },
];
t('elige voz femenina y neural para el idioma', elegirVoz(voces, 'en-US', 'femenina').name === 'Microsoft Zira');
t('con genero masculina elige la masculina', elegirVoz(voces, 'en-US', 'masculina').name === 'Microsoft David');
t('si no hay voz del idioma devuelve null (habla el sistema)',
  elegirVoz([{ name: 'X', lang: 'fr-FR' }], 'en-US') === null);

t('la transcripción conserva original y traducción por turno', (() => {
  const s = transcripcion([
    { dir: 'en-es', original: 'How much?', traducido: '¿Cuánto?' },
    { dir: 'es-en', original: 'Depende del proceso.', traducido: 'It depends on the process.' },
  ]);
  return /EN → ES/.test(s) && /How much\?/.test(s) && /¿Cuánto\?/.test(s) && /ES → EN/.test(s);
})());

t('los estados son honestos: escuchando, traduciendo, hablando',
  /Escuchando/.test(estadoTexto('escuchando', 'en-es')) && /Traduciendo/.test(estadoTexto('traduciendo')) && /Hablando/.test(estadoTexto('hablando', 'es-en')));
t('sin micrófono avisa en vez de fingir', /no reconoce voz/.test(estadoTexto('sin_mic')));

console.log('\n  \x1b[90m' + '─'.repeat(46) + '\x1b[0m');
const total = ok + fallos.length;
if (!fallos.length) console.log('  \x1b[32m' + ok + '/' + total + ' EN VERDE (100%)\x1b[0m · intérprete verificado');
else { console.log('  \x1b[31;1m' + ok + '/' + total + ' — ' + fallos.length + ' FALLO(S)\x1b[0m'); fallos.forEach((f) => console.log('   · ' + f)); }
console.log('');
process.exit(fallos.length ? 1 : 0);
