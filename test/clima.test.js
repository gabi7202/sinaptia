/**
 * clima.test.js — Pruebas del módulo de clima (weather.js). Puras: sin red, sin DOM.
 *   node test/clima.test.js
 *
 * Verifica el vocabulario visual tipo sitio oficial del tiempo: cada código WMO
 * cae en un fenómeno válido, los tips casan con las claves de los packs, y las
 * traducciones de la descripción existen en los tres idiomas.
 */
import { CLIMA, CLIMA_EN, CLIMA_PT, cieloDe, tip, descripcion, refrescar, horaDe, saludoPor } from '../src/lib/weather.js';
import { SKILL } from '../src/lib/skill.js';
import { PACKS } from '../src/lib/i18n.js';

let ok = 0, fallos = [];
function t(nombre, fn) {
  try { fn(); ok++; console.log('  \x1b[32m✓\x1b[0m ' + nombre); }
  catch (e) { fallos.push(nombre + ' → ' + e.message); console.log('  \x1b[31;1m✗\x1b[0m ' + nombre + '\n      ↳ ' + e.message); }
}
function eq(a, b, m) { if (a !== b) throw new Error((m || '') + ' esperaba «' + b + '», dio «' + a + '»'); }

const CIELOS = ['despejado', 'parcial', 'nublado', 'niebla', 'llovizna', 'lluvia', 'tormenta', 'nieve'];

console.log('\n\x1b[1m  SINAPTIA · Clima en tiempo real (mapeos WMO)\x1b[0m\n');

t('cada código WMO conocido cae en un fenómeno visual válido', () => {
  for (const code of Object.keys(CLIMA).map(Number)) {
    if (!CIELOS.includes(cieloDe(code))) throw new Error('código ' + code + ' → ' + cieloDe(code));
  }
  if (!CIELOS.includes(cieloDe(999))) throw new Error('código desconocido fuera del vocabulario');
});

t('los símbolos casan con el vocabulario oficial', () => {
  eq(cieloDe(0), 'despejado'); eq(cieloDe(1), 'parcial'); eq(cieloDe(2), 'parcial');
  eq(cieloDe(3), 'nublado');
  eq(cieloDe(45), 'niebla'); eq(cieloDe(48), 'niebla');
  eq(cieloDe(51), 'llovizna'); eq(cieloDe(55), 'llovizna'); eq(cieloDe(57), 'llovizna');
  eq(cieloDe(61), 'lluvia'); eq(cieloDe(65), 'lluvia'); eq(cieloDe(80), 'lluvia'); eq(cieloDe(82), 'lluvia');
  eq(cieloDe(71), 'nieve'); eq(cieloDe(77), 'nieve'); eq(cieloDe(85), 'nieve'); eq(cieloDe(86), 'nieve');
  eq(cieloDe(95), 'tormenta'); eq(cieloDe(96), 'tormenta'); eq(cieloDe(99), 'tormenta');
});

t('el tip siempre existe en los tres idiomas', () => {
  const casos = [[22, 0, false], [33, 1, false], [4, 3, false], [18, 45, false], [18, 53, false],
    [18, 63, false], [18, 75, false], [18, 95, false], [22, 2, true], [33, 2, false], [4, 2, false], [22, 3, false]];
  for (const [temp, code, noche] of casos) {
    const k = tip(temp, code, noche);
    for (const p of [PACKS.es, PACKS.en, PACKS.pt]) {
      if (!p.saludo.tips[k]) throw new Error(p.codigo + ' no tiene tip «' + k + '» (temp=' + temp + ' code=' + code + ' noche=' + noche + ')');
    }
  }
});

t('el fenómeno manda sobre la hora: lluvia de noche sigue siendo lluvia', () => {
  eq(tip(20, 63, true), 'lluvia');
  eq(tip(20, 95, true), 'tormenta');
  eq(tip(20, 2, true), 'noche');
});

t('la descripción se traduce a los tres idiomas y degrada sin romperse', () => {
  eq(descripcion(63), 'lluvia');
  eq(descripcion(63, 'en'), 'rain');
  eq(descripcion(63, 'pt'), 'chuva');
  if (typeof descripcion(9999, 'es') !== 'string') throw new Error('código desconocido sin descripción');
  if (typeof descripcion(9999, 'en') !== 'string') throw new Error('código desconocido sin descripción EN');
});

t('los diccionarios cubren los mismos códigos', () => {
  for (const code of Object.keys(CLIMA)) {
    if (!CLIMA_EN[code]) throw new Error('falta EN del código ' + code);
    if (!CLIMA_PT[code]) throw new Error('falta PT del código ' + code);
  }
});

const sinR1 = await refrescar(null);
const sinR2 = await refrescar({ ciudad: 'X' });
t('refrescar degrada: sin coordenadas no inventa nada', () => {
  eq(sinR1, null); eq(sinR2, null);
});

t('hora local y saludo por franja siguen vivos', () => {
  if (!/^\d{2}:\d{2}$/.test(horaDe('America/Mexico_City'))) throw new Error('horaDe tz inválida: ' + horaDe('America/Mexico_City'));
  eq(saludoPor('07:10'), 'Buenos días'); eq(saludoPor('14:32'), 'Buenas tardes'); eq(saludoPor('22:00'), 'Buenas noches');
});

t('el saludo del motor lleva ciudad, hora, temperatura y clima (formato ficha)', () => {
  // la plantilla ES expone todos los datos como ficha de sitio del tiempo
  for (const ph of ['{saludo}', '{ciudad}', '{hora}', '{temp}', '{clima}', '{tip}']) {
    if (!SKILL.saludo.plantilla.includes(ph)) throw new Error('la plantilla perdió ' + ph);
  }
  const primera = SKILL.saludo.plantilla.split('\n\n')[0];
  if (primera.length > 130) throw new Error('primera línea del saludo demasiado larga: ' + primera.length);
});

console.log('\n  \x1b[90m' + '─'.repeat(46) + '\x1b[0m');
const total = ok + fallos.length;
if (!fallos.length) console.log('  \x1b[32m' + ok + '/' + total + ' EN VERDE (100%)\x1b[0m · clima en tiempo real verificado');
else { console.log('  \x1b[31;1m' + ok + '/' + total + ' — ' + fallos.length + ' FALLO(S)\x1b[0m'); fallos.forEach((f) => console.log('   · ' + f)); }
console.log('');
process.exit(fallos.length ? 1 : 0);
