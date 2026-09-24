/**
 * bd.test.js — Base de datos JSON: registro, persistencia, sync y borrado.
 *   node test/bd.test.js
 */
import { BD } from '../src/lib/bd.js';

let ok = 0, fallos = [];
function t(n, c, d) { if (c) { ok++; console.log('  \x1b[32m✓\x1b[0m ' + n); } else { fallos.push(n + (d ? ' → ' + d : '')); console.log('  \x1b[31;1m✗\x1b[0m ' + n + (d ? '\n      ↳ ' + d : '')); } }

// localStorage falso
const store = new Map();
global.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

console.log('\n\x1b[1m  SINAPTIA · Test de la base de datos JSON\x1b[0m\n');

{
  const bd = new BD({});
  const r = bd.registrar('turno', { canal: 'voz', usuario: 'hola', intencion: 'saludo' });
  t('registra con id, ts y evento', !!r.id && !!r.ts && r.evento === 'turno' && r.canal === 'voz');
  bd.registrar('turno', { canal: 'chat', usuario: 'precio' });
  bd.registrar('lead', { lead: { nombre: 'Laura', email: 'l@x.com' } });
  t('todos() devuelve los tres', bd.todos().length === 3);
  t('porEvento filtra', bd.porEvento('turno').length === 2 && bd.porEvento('lead').length === 1);
  t('lead() devuelve el último snapshot', bd.lead().nombre === 'Laura');
  t('persiste en localStorage como JSON', !!store.get('sinaptia:bd') && JSON.parse(store.get('sinaptia:bd')).registros.length === 3);
}
{
  const bd2 = new BD({});   // nueva instancia lee lo persistido
  t('sobrevive a una recarga', bd2.todos().length === 3 && bd2.lead().email === 'l@x.com');
  bd2.borrar();
  t('borrar() vacía memoria y almacenamiento', bd2.todos().length === 0 && !store.get('sinaptia:bd'));
}
{
  // tope de registros
  const bd3 = new BD({});
  for (let i = 0; i < 520; i++) bd3.registrar('turno', { i });
  t('respeta el tope de 500 registros', bd3.todos().length === 500, 'tiene ' + bd3.todos().length);
  bd3.borrar();   // cada bloque empieza con el almacén limpio
}
await (async () => {
  // sync genérico por POST
  let recibido = null;
  global.fetch = async (url, opts) => { recibido = { url, body: JSON.parse(opts.body) }; return { ok: true }; };
  const bd4 = new BD({ remoto: 'https://ejemplo.com/hook' });
  bd4.registrar('turno', { canal: 'voz', usuario: 'uno' });
  bd4.registrar('turno', { canal: 'voz', usuario: 'dos' });
  const n = await bd4.sincronizar();
  t('sincroniza la cola en un lote', n === 2 && recibido.body.lote.length === 2 && recibido.url === 'https://ejemplo.com/hook');
  t('vacía la cola tras sincronizar', bd4.pendiente === 0);
  global.fetch = async () => ({ ok: false });
  bd4.registrar('turno', { usuario: 'tres' });
  const n2 = await bd4.sincronizar();
  t('si el remoto falla, no pierde nada', n2 === 0 && bd4.pendiente === 1);
})();
await (async () => {
  // sync a Supabase con cabeceras de apikey
  let cab = null;
  global.fetch = async (url, opts) => { cab = { url, headers: opts.headers, body: JSON.parse(opts.body) }; return { ok: true }; };
  store.delete('sinaptia:bd');
  const bd5 = new BD({ supabase: { url: 'https://x.supabase.co', key: 'CLAVE', tabla: 'eventos' } });
  bd5.registrar('lead', { lead: { nombre: 'Ana' } });
  await bd5.sincronizar();
  t('Supabase: POST al REST con apikey y tabla', cab.url.endsWith('/rest/v1/eventos') && cab.headers.apikey === 'CLAVE' && cab.body[0].payload.evento === 'lead');
})();

console.log('\n  \x1b[90m' + '─'.repeat(46) + '\x1b[0m');
const total = ok + fallos.length;
if (!fallos.length) console.log('  \x1b[32m' + ok + '/' + total + ' EN VERDE (100%)\x1b[0m · base de datos verificada');
else { console.log('  \x1b[31;1m' + ok + '/' + total + ' — ' + fallos.length + ' FALLO(S)\x1b[0m'); fallos.forEach((f) => console.log('   · ' + f)); }
console.log('');
process.exit(fallos.length ? 1 : 0);
