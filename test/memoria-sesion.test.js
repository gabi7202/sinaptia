/**
 * memoria-sesion.test.js — La memoria temporal del navegador no puede perder el
 * hilo, no puede crecer sin límite y no puede sobrevivir a su TTL.
 *   node test/memoria-sesion.test.js
 */
import { MemoriaSesion, PREFIJO } from '../src/lib/memoriaSesion.js';
import { normalizarMemoria, memoriaComoTexto } from '../server/memoria-sesion.js';

let ok = 0, fallos = [];
function t(n, c, d) { if (c) { ok++; console.log('  \x1b[32m✓\x1b[0m ' + n); } else { fallos.push(n + (d ? ' → ' + d : '')); console.log('  \x1b[31;1m✗\x1b[0m ' + n + (d ? '\n      ↳ ' + d : '')); } }
function storage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    _map: m,
  };
}

console.log('\n\x1b[1m  SINAPTIA · Memoria temporal de sesión\x1b[0m\n');

{
  let ahora = 1_700_000_000_000;
  const s = storage();
  const m = new MemoriaSesion({ idioma: 'en', storage: s, horas: 12, maxTurnos: 6, ahora: () => ahora });
  m.agregar('user', 'We sell auto parts');
  m.agregar('bot', 'Got it. What process hurts most?');
  m.guardarLead({ empresa: 'Andes Parts', sector: 'auto parts', dolor: 'quotes by hand', email: 'JOSE@X.COM' });

  t('guarda en localStorage con clave por idioma', !!s.getItem(`${PREFIJO}:en:v1`) && m.tamano === 2);
  t('el historial sale en formato assistant/user', (() => {
    const h = m.historial(10);
    return h[0].role === 'user' && h[1].role === 'assistant';
  })());
  t('contexto incluye lead, idioma y turnos', (() => {
    const c = m.contexto();
    return c.idioma === 'en' && c.lead.email === 'jose@x.com' && c.turnos.length === 2;
  })());
  t('el TTL se renueva con cada turno', m.restanteMs() > 11 * 3600e3 && m.restanteMs() <= 12 * 3600e3);

  ahora += 13 * 3600e3;
  const m2 = new MemoriaSesion({ idioma: 'en', storage: s, horas: 12, ahora: () => ahora });
  t('pasado el TTL se borra sola (no revive conversaciones viejas)', m2.vacia && m2.tamano === 0 && !s.getItem(`${PREFIJO}:en:v1`));
}

{
  const s = storage();
  const m = new MemoriaSesion({ idioma: 'es', storage: s, maxTurnos: 5 });
  for (let i = 0; i < 12; i++) m.agregar(i % 2 ? 'bot' : 'user', 'turno ' + i);
  t('respeta el tope de turnos y conserva los últimos', m.tamano === 5 && m.turnos()[4].texto === 'turno 11');
  m.agregar('user', 'x'.repeat(2000));
  t('recorta turnos largos (cuota de móvil)', m.turnos().at(-1).texto.length <= 601);
}

{
  const s = storage();
  const m = new MemoriaSesion({ idioma: 'pt', storage: s });
  m.agregar('user', 'oi');
  m.borrar();
  t('borrar deja el almacenamiento limpio', m.vacia && !s.getItem(`${PREFIJO}:pt:v1`));
}

{
  const m = new MemoriaSesion({ idioma: 'en', storage: { getItem: () => '{roto', setItem() {}, removeItem() {} } });
  t('JSON corrupto no rompe la conversación (empieza vacío)', m.vacia);
}

{
  const s = storage();
  const m = new MemoriaSesion({ idioma: 'en', storage: s });
  m.agregar('user', 'somos una clínica');
  m.agregar('user', 'perdemos consultas');
  const vistos = [];
  const agente = { responder: (t) => { vistos.push(t); return { guion: { siguiente: '¿cuántas al mes?' } }; } };
  const ultimo = m.reproducir(agente);
  t('reproduce los turnos del usuario para recuperar el estado del motor',
    vistos.length === 2 && vistos[0] === 'somos una clínica' && ultimo.guion.siguiente.includes('mes'));
}

/* ── normalización del servidor ── */
{
  const n = normalizarMemoria({
    resumen: 'quiere cotizar',
    lead: { email: 'A@B.COM', nombre: '  Laura  ', basura: 'x' },
    turnos: [
      { rol: 'user', texto: 'hola' },
      { role: 'assistant', content: '¿qué negocio?' },
      { rol: 'user', texto: 'x'.repeat(2000) },
    ],
  });
  t('normaliza roles y recorta texto', n.turnos[0].rol === 'user' && n.turnos[1].rol === 'bot' && n.turnos[2].texto.length <= 801);
  t('normaliza email y descarta campos no permitidos', n.lead.email === 'a@b.com' && n.lead.nombre === 'Laura' && n.lead.basura === undefined);
  t('produce texto compacto para el prompt', /VISITANTE: hola/.test(memoriaComoTexto(n)) && /NEXA:/.test(memoriaComoTexto(n)));
  t('memoria vacía o inválida se rechaza', normalizarMemoria(null) === null && normalizarMemoria({ turnos: [] }) === null);
}

console.log('\n  \x1b[90m' + '─'.repeat(46) + '\x1b[0m');
const total = ok + fallos.length;
if (!fallos.length) console.log('  \x1b[32m' + ok + '/' + total + ' EN VERDE (100%)\x1b[0m · memoria temporal verificada');
else { console.log('  \x1b[31;1m' + ok + '/' + total + ' — ' + fallos.length + ' FALLO(S)\x1b[0m'); fallos.forEach((f) => console.log('   · ' + f)); }
console.log('');
process.exit(fallos.length ? 1 : 0);
