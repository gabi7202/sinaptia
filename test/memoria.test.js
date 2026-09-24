/**
 * memoria.test.js — Memoria de clientes: recall en un segundo, sin empezar de cero.
 *   node test/memoria.test.js
 */
import { Memoria, extraerIdentidad, textoRecuerdo } from '../src/lib/memoria.js';

let ok = 0, fallos = [];
function t(n, c, d) { if (c) { ok++; console.log('  \x1b[32m✓\x1b[0m ' + n); } else { fallos.push(n + (d ? ' → ' + d : '')); console.log('  \x1b[31;1m✗\x1b[0m ' + n + (d ? '\n      ↳ ' + d : '')); } }

const store = new Map();
const storage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

console.log('\n\x1b[1m  SINAPTIA · Memoria de clientes\x1b[0m\n');

t('extrae nombre, negocio y necesidad', (() => {
  const id = extraerIdentidad('soy José, te hablé la semana pasada de implementar IA en mi pastelería');
  return id.nombre === 'José' && id.negocio === 'pastelería' && id.necesidad === 'implementar IA' && id.vuelve === true;
})(), JSON.stringify(extraerIdentidad('soy José, te hablé la semana pasada de implementar IA en mi pastelería')));

t('detecta que vuelve aunque no diga "la semana pasada"', extraerIdentidad('soy José, ya te conté de mi panadería').vuelve === true);
t('no marca como recurrente a un cliente nuevo', extraerIdentidad('soy Laura y quiero automatizar cotizaciones').vuelve === false);

{
  const m = new Memoria(storage);
  m.guardar({ nombre: 'José Pérez', negocio: 'pastelería', necesidad: 'implementar IA', resumen: 'quiere automatizar pedidos' });
  t('guarda el perfil con fecha y contador', m.perfiles().length === 1 && m.perfiles()[0].veces === 1);

  const hit = m.recordar('soy José, te hablé la semana pasada de implementar IA en mi pastelería');
  t('encuentra al cliente recurrente en un segundo', !!hit && hit.perfil.nombre === 'José Pérez', JSON.stringify(hit && hit.perfil.nombre));
  t('el recuerdo nombra al cliente y su negocio en el idioma activo', (() => {
    const txt = textoRecuerdo(hit.perfil, 'es');
    return txt.includes('José') && txt.includes('pastelería') && /no empezamos de cero/i.test(txt);
  })(), textoRecuerdo(hit.perfil, 'es').slice(0, 80));
  t('y en inglés también', /I found your case/.test(textoRecuerdo(hit.perfil, 'en')));

  t('no confunde a un desconocido con el cliente guardado', m.recordar('soy Laura y quiero automatizar cotizaciones') === null);
  t('lo encuentra por negocio aunque no diga el nombre', !!m.recordar('hola, te escribo de la pastelería, ¿sigues disponible?'));

  m.guardar({ nombre: 'José Pérez', negocio: 'pastelería', necesidad: 'implementar IA', resumen: 'segunda conversación' });
  t('actualiza el mismo perfil en vez de duplicar', m.perfiles().length === 1 && m.perfiles()[0].veces === 2);
}

console.log('\n  \x1b[90m' + '─'.repeat(46) + '\x1b[0m');
const total = ok + fallos.length;
if (!fallos.length) console.log('  \x1b[32m' + ok + '/' + total + ' EN VERDE (100%)\x1b[0m · memoria verificada');
else { console.log('  \x1b[31;1m' + ok + '/' + total + ' — ' + fallos.length + ' FALLO(S)\x1b[0m'); fallos.forEach((f) => console.log('   · ' + f)); }
console.log('');
process.exit(fallos.length ? 1 : 0);
