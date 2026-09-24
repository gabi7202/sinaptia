/**
 * funnel.test.js — Analítica de embudo sin cookies: eventos, dedupe y tasas.
 *   node test/funnel.test.js
 */
import { BD } from '../src/lib/bd.js';
import { Funnel, PASOS } from '../src/lib/funnel.js';

let ok = 0, fallos = [];
function t(n, c, d) { if (c) { ok++; console.log('  \x1b[32m✓\x1b[0m ' + n); } else { fallos.push(n + (d ? ' → ' + d : '')); console.log('  \x1b[31;1m✗\x1b[0m ' + n + (d ? '\n      ↳ ' + d : '')); } }

// almacenamiento falso
const mem = new Map(), ses = new Map();
global.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};
global.sessionStorage = {
  getItem: (k) => (ses.has(k) ? ses.get(k) : null),
  setItem: (k, v) => ses.set(k, String(v)),
  removeItem: (k) => ses.delete(k),
};

console.log('\n\x1b[1m  SINAPTIA · Embudo sin cookies\x1b[0m\n');

{
  const bd = new BD({});
  const f = new Funnel(bd);
  const v1 = f.marcar('visita', { origen: 'directo' });
  const v2 = f.marcar('visita', { origen: 'directo' });
  t('la visita cuenta una sola vez por sesión', v1 !== null && v2 === null);
  f.marcar('calculadora');
  f.marcar('calculadora_cta', { anual: 83115 });
  f.marcar('lead');
  f.marcar('llamada', { origen: 'fab' });
  f.marcar('invitacion', { tipo: 'propuesta' });

  const c = f.recuento();
  t('recuenta los cinco pasos', PASOS.every((p) => c[p] === 1), JSON.stringify(c));
  t('la invitación se cuenta aparte', c.invitacion === 1);

  const tasas = f.tasas();
  t('las tasas entre pasos consecutivos son 100%', tasas.every((x) => x.tasa === 1), JSON.stringify(tasas));
  t('el resumen da tasa global y pendientes', f.resumen().tasaGlobal === 1 && f.resumen().pendientes === 6);

  t('los eventos viven en la BD con prefijo funnel:', bd.porEvento('funnel:lead').length === 1);
  t('y llevan el paso dentro del payload', bd.porEvento('funnel:calculadora_cta')[0].paso === 'calculadora_cta');
}
{
  // sesión nueva: la visita vuelve a contar
  ses.clear();
  const bd = new BD({});
  const f = new Funnel(bd);
  t('en una sesión nueva la visita vuelve a contar', f.marcar('visita') !== null);
}

console.log('\n  \x1b[90m' + '─'.repeat(46) + '\x1b[0m');
const total = ok + fallos.length;
if (!fallos.length) console.log('  \x1b[32m' + ok + '/' + total + ' EN VERDE (100%)\x1b[0m · embudo verificado');
else { console.log('  \x1b[31;1m' + ok + '/' + total + ' — ' + fallos.length + ' FALLO(S)\x1b[0m'); fallos.forEach((x) => console.log('   · ' + x)); }
console.log('');
process.exit(fallos.length ? 1 : 0);
