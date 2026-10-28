/**
 * conversacion.test.js — Motor + Groq: el turno se enriquece sin romper el guion.
 *   node test/conversacion.test.js
 */
import { responderTurno, aplicarDatos, puntuarLead, siguienteCampo, textoRetoma } from '../src/lib/conversacion.js';

let ok = 0, fallos = [];
function t(n, c, d) { if (c) { ok++; console.log('  \x1b[32m✓\x1b[0m ' + n); } else { fallos.push(n + (d ? ' → ' + d : '')); console.log('  \x1b[31;1m✗\x1b[0m ' + n + (d ? '\n      ↳ ' + d : '')); } }

function agenteFake() {
  const lead = { sector: null, dolor: null, volumen: null, nombre: null, email: null, empresa: null };
  return {
    lead,
    responder(texto) {
      if (!lead.sector) lead.sector = texto;
      return {
        texto: 'Anotado: ' + texto + '. ¿Qué proceso te duele?',
        guion: { etapa: 'sector', intencion: 'avance', lead: { ...lead }, siguiente: '¿Qué proceso te duele?' },
        listoParaPdf: false,
      };
    },
  };
}

console.log('\n\x1b[1m  SINAPTIA · Conversación (motor + IA)\x1b[0m\n');

t('aplicarDatos rellena huecos y nunca pisa lo ya dicho', (() => {
  const lead = { nombre: 'Laura', email: '' };
  aplicarDatos(lead, { nombre: 'Otra', email: 'LAURA@X.COM', dolor: 'cotizar', basura: 'x' });
  return lead.nombre === 'Laura' && lead.email === 'laura@x.com' && lead.dolor === 'cotizar' && lead.basura === undefined;
})());

t('puntuarLead clasifica y dice qué falta', (() => {
  const frio = puntuarLead({});
  const caliente = puntuarLead({ sector: 'clínica', dolor: 'consultas', volumen: '300', nombre: 'Ana', email: 'a@b.com', empresa: 'Clínica', urgencia: 'alta', herramientas: 'Excel', rol: 'dueña' });
  return frio.nivel === 'frío' && caliente.nivel === 'caliente' && caliente.puntos >= 70 && frio.faltan.includes('email');
})());

t('siguienteCampo prioriza el dolor después del sector', siguienteCampo({ sector: 'clínica' }) === 'dolor');
t('textoRetoma retoma en el idioma correcto', (() => {
  const m = { lead: { dolor: 'cotizaciones' }, actualizado: new Date().toISOString() };
  return /Continuamos donde quedaste/.test(textoRetoma('es', m)) &&
    /Picking up where you left off/.test(textoRetoma('en', m)) &&
    /Continuamos de onde você parou/.test(textoRetoma('pt', m));
})());

await (async () => {
  const agente = agenteFake();
  global.fetch = async () => ({
    ok: true,
    json: async () => ({
      respuesta: 'Entiendo: clínica. ¿Qué proceso te quita más tiempo?',
      intencion: 'necesidad: consultas',
      confianza: 0.8,
      datos: { dolor: 'responder consultas', urgencia: 'alta', basura: 'x' },
      paso: 'seguir',
      siguiente_accion: 'preguntar volumen',
      objecion: null,
      idioma_detectado: 'es',
    }),
  });
  const r = await responderTurno({
    texto: 'Somos una clínica', agente, endpoint: 'https://proxy/ia',
    memoria: { turnos: [{ rol: 'user', texto: 'Somos una clínica' }], lead: {} },
  });
  t('con IA usa la respuesta del modelo y el modo "ia"', r.modo === 'ia' && /Entiendo/.test(r.texto) && r.confianza === 0.8);
  t('la IA rellena el lead sin pisar el sector del motor', agente.lead.sector === 'Somos una clínica' && agente.lead.dolor === 'responder consultas');
  t('el guion del motor sigue viajando (auditoría)', !!r.guion && r.guion.siguiente.includes('duele'));
  t('conserva siguiente acción y objeción', r.siguienteAccion === 'preguntar volumen' && r.objecion === null);
})();

await (async () => {
  const agente = agenteFake();
  global.fetch = async () => { throw new Error('sin red'); };
  const r = await responderTurno({ texto: 'Vendemos repuestos', agente, endpoint: 'https://proxy/ia' });
  t('si la IA falla, el motor responde igual (degrada)', r.modo === 'motor' && /Anotado/.test(r.texto));
})();

await (async () => {
  const agente = agenteFake();
  global.fetch = async () => ({
    ok: true,
    json: async () => ({ respuesta: 'Te lo entrego en 2 semanas.', datos: {}, paso: 'seguir' }),
  });
  const r = await responderTurno({ texto: 'hola', agente, endpoint: 'https://proxy/ia', guion: { propuesta: {} } });
  t('una promesa de plazo inventada se descarta y responde el motor', r.modo === 'motor' && !/2 semanas/.test(r.texto));
})();

console.log('\n  \x1b[90m' + '─'.repeat(46) + '\x1b[0m');
const total = ok + fallos.length;
if (!fallos.length) console.log('  \x1b[32m' + ok + '/' + total + ' EN VERDE (100%)\x1b[0m · conversación verificada');
else { console.log('  \x1b[31;1m' + ok + '/' + total + ' — ' + fallos.length + ' FALLO(S)\x1b[0m'); fallos.forEach((f) => console.log('   · ' + f)); }
console.log('');
process.exit(fallos.length ? 1 : 0);
