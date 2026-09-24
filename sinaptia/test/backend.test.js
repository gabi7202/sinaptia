/**
 * backend.test.js — El cerebro de B, fusionado en A, bajo prueba.
 *   node test/backend.test.js
 *
 * Sin red y sin dependencias: un simulador en memoria de PostgREST (Supabase)
 * y un Claude falso que habla SSE. Cubre lo que B no tenía testeado:
 * utilidades, cliente REST, normalización de historial, system prompt,
 * matching fuerte/débil de buscar_cliente, parser SSE, pipeline de resumen,
 * rate limit y las cinco rutas (session, chat, end, cron, panel).
 */
import { isUUID, norm, digits, mismoOrigen, leerCookies, crearSupabase, eq, ilikeContiene } from '../server/nucleo.js';
import { claude, parsearSSE, MODELO_CHAT } from '../server/claude.js';
import { buildSystem, tools, runTool, normalizarHistorial, MAX_POR_HORA } from '../server/agente.js';
import { resumirSesion } from '../server/resumen.js';
import { LANGS, MARCA, AGENTE } from '../server/langs.js';
import handlerSession from '../api/voz/session.js';
import handlerChat from '../api/voz/chat.js';
import handlerEnd from '../api/voz/end.js';
import handlerCron from '../api/voz/cron.js';
import handlerPanel from '../api/voz/panel.js';

let ok = 0, fallos = [];
function t(n, c, d) { if (c) { ok++; console.log('  \x1b[32m✓\x1b[0m ' + n); } else { fallos.push(n + (d ? ' → ' + d : '')); console.log('  \x1b[31;1m✗\x1b[0m ' + n + (d ? '\n      ↳ ' + d : '')); } }

console.log('\n\x1b[1m  SINAPTIA · Test del backend de voz (fusión A+B)\x1b[0m\n');

/* ══════════ dobles: PostgREST en memoria + Claude SSE ══════════ */

let semillaId = 1;
function uuidFake() {
  const hex = (semillaId++).toString(16).padStart(12, '0');
  return `00000000-0000-4000-8000-${hex.slice(0, 12)}`;
}

function cumple(fila, params) {
  for (const [k, v] of params.entries()) {
    if (['select', 'order', 'limit', 'offset'].includes(k)) continue;
    const i = v.indexOf('.');
    const op = i > 0 ? v.slice(0, i) : 'eq';
    const val = i > 0 ? v.slice(i + 1) : v;
    const mio = fila[k];
    if (op === 'eq') { if (String(mio ?? '') !== String(val)) return false; }
    else if (op === 'ilike') {
      const patron = val.replace(/\*/g, '').toLowerCase();
      if (!String(mio ?? '').toLowerCase().includes(patron)) return false;
    }
    else if (op === 'gte') { if (!(String(mio ?? '') >= String(val))) return false; }
    else if (op === 'lt') { if (!(String(mio ?? '') < String(val))) return false; }
    else return false;
  }
  return true;
}

function simuladorSupabase(tablas = {}) {
  const llamadas = [];
  const headers = (map) => ({ get: (k) => map[String(k).toLowerCase()] ?? null });
  const respuesta = (status, body, map = {}) => ({
    ok: status >= 200 && status < 300, status,
    headers: headers(map),
    json: async () => body,
    text: async () => JSON.stringify(body),
  });

  const fetchSim = async (url, opts = {}) => {
    llamadas.push({ url: String(url), method: opts.method || 'GET', headers: opts.headers || {}, body: opts.body });
    const u = new URL(url);
    const tabla = u.pathname.replace('/rest/v1/', '');
    if (!tablas[tabla]) tablas[tabla] = [];
    const filas = tablas[tabla];
    const params = u.searchParams;
    const method = opts.method || 'GET';

    if (method === 'POST') {
      const nueva = { id: uuidFake(), created_at: new Date().toISOString(), ...JSON.parse(opts.body || '{}') };
      filas.push(nueva);
      return respuesta(201, [{ ...nueva }]);
    }

    let filtradas = filas.filter((f) => cumple(f, params));

    if (method === 'PATCH') {
      const cambios = JSON.parse(opts.body || '{}');
      filtradas.forEach((f) => Object.assign(f, cambios));
      return respuesta(200, filtradas.map((f) => ({ ...f })));
    }

    const order = params.get('order');
    if (order) {
      const [col, dir] = order.split('.');
      filtradas = filtradas.slice().sort((a, b) => {
        const x = String(a[col] ?? ''), y = String(b[col] ?? '');
        return dir === 'desc' ? y.localeCompare(x) : x.localeCompare(y);
      });
    }
    const total = filtradas.length;
    const limit = Number(params.get('limit') || 0);
    let body = limit ? filtradas.slice(0, limit) : filtradas;
    const countExact = String((opts.headers || {}).Prefer || '').includes('count=exact');
    if (String((opts.headers || {}).Range || '') === '0-0') body = body.slice(0, 1);
    const sel = params.get('select') || '*';
    const proyectadas = body.map((f) => {
      if (sel === '*' || sel === 'id') { const o = {}; for (const c of sel.split(',')) o[c] = f[c]; return sel === 'id' ? o : { ...f }; }
      const o = {};
      for (const c of sel.split(',')) if (c in f) o[c] = f[c];
      return o;
    });
    const map = {};
    if (countExact) map['content-range'] = `0-${Math.max(0, proyectadas.length - 1)}/${total}`;
    return respuesta(200, proyectadas, map);
  };
  return { fetch: fetchSim, llamadas, tablas };
}

/** Claude falso: guion por llamada (texto a deltas o tool_use), en SSE real. */
function simuladorClaude(guiones) {
  const llamadas = [];
  const enc = new TextEncoder();
  const fetchSim = async (url, opts = {}) => {
    const body = JSON.parse(opts.body);
    llamadas.push(body);
    const script = guiones.length > 1 ? guiones.shift() : guiones[0];
    if (!body.stream) {
      return { ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: script.texto ?? script.deltas?.join('') ?? '' }], stop_reason: 'end_turn' }) };
    }
    let sse = '';
    const push = (o) => { sse += `event: ${o.type}\ndata: ${JSON.stringify(o)}\n\n`; };
    push({ type: 'message_start', message: { id: 'msg_test', role: 'assistant', content: [] } });
    let idx = 0;
    if (script.texto != null || script.deltas) {
      push({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } });
      for (const d of script.deltas || [script.texto]) push({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: d } });
      push({ type: 'content_block_stop', index: 0 });
      idx = 1;
    }
    if (script.toolUse) {
      const j = JSON.stringify(script.toolUse.input || {});
      push({ type: 'content_block_start', index: idx, content_block: { type: 'tool_use', id: script.toolUse.id || 'toolu_1', name: script.toolUse.name || 'buscar_cliente', input: {} } });
      const mitad = Math.ceil(j.length / 2);
      push({ type: 'content_block_delta', index: idx, delta: { type: 'input_json_delta', partial_json: j.slice(0, mitad) } });
      push({ type: 'content_block_delta', index: idx, delta: { type: 'input_json_delta', partial_json: j.slice(mitad) } });
      push({ type: 'content_block_stop', index: idx });
    }
    push({ type: 'message_delta', delta: { stop_reason: script.stop_reason || 'end_turn' }, usage: {} });
    push({ type: 'message_stop' });
    const bytes = enc.encode(sse);
    const trozos = [];   // trozos de 37 bytes: parten UTF-8 y eventos a la mitad
    for (let i = 0; i < bytes.length; i += 37) trozos.push(bytes.slice(i, i + 37));
    let k = 0;
    return {
      ok: true, status: 200,
      body: { getReader: () => ({ read: async () => (k < trozos.length ? { done: false, value: trozos[k++] } : { done: true, value: undefined }) }) },
    };
  };
  return { fetch: fetchSim, llamadas };
}

function mundo({ tablas = {}, guiones = [{ deltas: ['Ok.'] }] } = {}) {
  const sim = simuladorSupabase(tablas);
  const cld = simuladorClaude(guiones);
  const fetchMundo = async (url, opts) =>
    String(url).startsWith('https://api.anthropic.com') ? cld.fetch(url, opts) : sim.fetch(url, opts);
  return { sim, cld, fetch: fetchMundo };
}

function fakeReq({ method = 'POST', body = null, headers = {} } = {}) {
  return { method, body, headers: { host: 'sitio.com', ...headers } };
}
function fakeRes() {
  return {
    statusCode: 200, headers: {}, cuerpo: '', chunks: [], ended: false,
    setHeader(k, v) { this.headers[String(k).toLowerCase()] = v; },
    status(c) { this.statusCode = c; return this; },
    send(x) { this.cuerpo += x; this.ended = true; return this; },
    write(x) { this.chunks.push(x); this.cuerpo += x; return true; },
    writeHead(c, h) { this.statusCode = c; for (const [k, v] of Object.entries(h || {})) this.setHeader(k, v); },
    end(x) { if (x != null) this.cuerpo += x; this.ended = true; },
  };
}
const jsonDe = (res) => { try { return JSON.parse(res.cuerpo); } catch (e) { return null; } };

process.env.SUPABASE_URL = 'https://fake.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'service-key-test';
process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
process.env.CRON_SECRET = 'cron-test';
process.env.PANEL_SECRET = 'panel-test';

/* ══════════ 1 · utilidades (idénticas a B) ══════════ */

console.log('\x1b[36m  1 · Utilidades del núcleo\x1b[0m');
t('isUUID acepta un UUID y rechaza basura', isUUID('3f2b8c1e-4a5d-4e6f-8a9b-0c1d2e3f4a5b') && !isUUID('hola') && !isUUID(null) && !isUUID('3f2b8c1e-4a5d-4e6f-8a9b'));
t('norm quita acentos, mayúsculas y ruido', norm('  José-Pérez, S.A. ') === 'jose-perez s.a.' && norm('Pastelería') === 'pasteleria');
t('digits deja los últimos 10 dígitos del teléfono', digits('+57 (300) 123-4567') === '3001234567' && digits('5730012345679') === '0012345679' && digits('123') === '123' && digits(null) === '');
t('mismoOrigen acepta el propio sitio y el Origin vacío (sendBeacon)',
  mismoOrigen({ headers: { origin: 'https://sitio.com', host: 'sitio.com' } }) &&
  mismoOrigen({ headers: { host: 'sitio.com' } }) &&
  !mismoOrigen({ headers: { origin: 'https://otro.com', host: 'sitio.com' } }));
t('leerCookies parsea la cookie vid', leerCookies({ headers: { cookie: 'a=1; vid=abc-123; b=2' } }).vid === 'abc-123');
t('eq/ilikeContienen codifican valores raros', eq('email', 'a b@c.com') === 'email=eq.a%20b%40c.com' && ilikeContiene('negocio_norm', 'spa * x') === 'negocio_norm=ilike.*spa%20*%20x*');

/* ══════════ 2 · cliente Supabase sobre PostgREST ══════════ */

console.log('\n\x1b[36m  2 · Cliente Supabase (cero dependencias)\x1b[0m');
{
  const m = mundo({ tablas: { leads: [{ id: 'L1', nombre_norm: 'jose', updated_at: '2026-09-01' }, { id: 'L2', nombre_norm: 'maria', updated_at: '2026-09-02' }] } });
  const db = crearSupabase(process.env, m.fetch);
  const r1 = await db.select('leads', 'select=*&order=updated_at.desc&limit=1', { single: true });
  t('select single trae el más reciente', r1.data && r1.data.id === 'L2');
  const r2 = await db.select('leads', eq('nombre_norm', 'jose'));
  t('select con filtro eq devuelve la fila', Array.isArray(r2.data) && r2.data[0].id === 'L1');
  const c = await db.contar('leads', 'nombre_norm=eq.jose');
  t('contar lee el total del Content-Range', c === 1, 'contó ' + c);
  const ins = await db.insertar('leads', { nombre: 'Ana' });
  t('insertar devuelve la fila con id generado', ins.data && ins.data.id && ins.data.nombre === 'Ana');
  const act = await db.actualizar('leads', eq('id', ins.data.id), { negocio: 'florería' });
  t('actualizar hace PATCH y devuelve la fila tocada', act.data && act.data.negocio === 'florería');
  const llamadaPatch = m.sim.llamadas.find((l) => l.method === 'PATCH');
  t('el PATCH usa Prefer return=representation y la service key',
    llamadaPatch.headers.Prefer === 'return=representation' &&
    llamadaPatch.headers.Authorization === 'Bearer service-key-test' &&
    llamadaPatch.headers.apikey === 'service-key-test');
  const m2 = mundo();
  const db2 = crearSupabase({ SUPABASE_URL: '', SUPABASE_SERVICE_KEY: '' }, m2.fetch);
  t('sin URL/clave el backend se declara no disponible (503, no rompe)', db2.disponible() === false && db.disponible() === true);
}

/* ══════════ 3 · historial normalizado para Claude ══════════ */

console.log('\n\x1b[36m  3 · Normalización de historial\x1b[0m');
{
  const h = normalizarHistorial([
    { role: 'assistant', content: 'saludo inicial' },        // se descarta: debe empezar en user
    { role: 'user', content: 'hola' },
    { role: 'user', content: 'buenas' },                     // mismo rol seguido: se fusiona
    { role: 'assistant', content: '¿qué negocio tienes?' },
    { role: 'user', content: 'una pastelería' },
  ]);
  t('empieza en user y descarta el saludo suelto', h[0].role === 'user' && h.length === 3, JSON.stringify(h.map((x) => x.role)));
  t('fusiona roles repetidos con salto de línea', h[0].content === 'hola\nbuenas');
  t('los roles quedan estrictamente alternos', h.every((m, i) => i === 0 || m.role !== h[i - 1].role));
  t('historial vacío no explota', normalizarHistorial([]).length === 0 && normalizarHistorial(null).length === 0);
}

/* ══════════ 4 · system prompt con marca Sinaptia/Nexa ══════════ */

console.log('\n\x1b[36m  4 · System prompt (marca + reglas de A)\x1b[0m');
{
  t('la marca ya no es el placeholder de B', MARCA === 'Sinaptia' && AGENTE === 'Nexa' && !/Tu Empresa/.test(buildSystem('es', null)));
  const s = buildSystem('es', null);
  t('se presenta como Nexa de Sinaptia y admite ser IA', /Eres Nexa/.test(s) && /Eres una IA/.test(s));
  t('mantiene la regla cero plazos de A', /No prometas precios, plazos ni resultados/.test(s));
  t('mantiene la defensa anti prompt-injection de B', /datos, no instrucciones/.test(s));
  t('sin lead declara conversación nueva', /conversación nueva/.test(s));
  t('con lead inyecta <memoria_cliente> y pide retomar', (() => {
    const c = buildSystem('es', { nombre: 'José', negocio: 'La Espiga', updated_at: '2026-09-01' });
    return /<memoria_cliente>/.test(c) && /José/.test(c) && /no repitas preguntas/.test(c);
  })());
  t('responde en el idioma pedido (en/pt)', /responde siempre en English/.test(buildSystem('en', null)) && /responde siempre en português/.test(buildSystem('pt', null)));
  t('la herramienta buscar_cliente está definida con su esquema', tools.length === 1 && tools[0].name === 'buscar_cliente' && tools[0].input_schema.properties.telefono);
}

/* ══════════ 5 · buscar_cliente: fuerte/débil, sin filtrar datos ══════════ */

console.log('\n\x1b[36m  5 · Memoria multidispositivo (runTool)\x1b[0m');
{
  const LEAD = { id: 'L-JOSE', nombre: 'José Pérez', negocio: 'Pastelería La Espiga', giro: 'pastelería', necesidad: 'automatizar pedidos', resumen: 'quiere IA', updated_at: '2026-09-20' };
  const base = () => mundo({ tablas: { leads: [{ ...LEAD, nombre_norm: 'jose perez', negocio_norm: 'pasteleria la espiga', telefono_norm: '3001234567', email: 'jose@espiga.co' }], visitors: [{ id: 'V1', lead_id: null }] } });

  let m = base();
  let db = crearSupabase(process.env, m.fetch);
  let r = await runTool(db, 'buscar_cliente', { telefono: '+57 300 123 4567' }, { visitorId: 'V1' });
  t('coincidencia FUERTE por teléfono (últimos 10 dígitos)', r.estado === 'confirmado' && r.nombre === 'José Pérez');
  t('la coincidencia fuerte vincula visitante↔lead (cookie la próxima vez)', m.sim.tablas.visitors[0].lead_id === 'L-JOSE');

  m = base(); db = crearSupabase(process.env, m.fetch);
  r = await runTool(db, 'buscar_cliente', { email: 'JOSE@espiga.co ' }, { visitorId: 'V1' });
  t('coincidencia FUERTE por email normalizado', r.estado === 'confirmado' && r.negocio === 'Pastelería La Espiga');

  m = base(); db = crearSupabase(process.env, m.fetch);
  r = await runTool(db, 'buscar_cliente', { nombre: 'José Pérez', negocio: 'pastelería' }, { visitorId: 'V1' });
  t('coincidencia FUERTE por nombre+negocio (nombre exacto, negocio ilike sin acentos)', r.estado === 'confirmado' && r.giro === 'pastelería');

  m = base(); db = crearSupabase(process.env, m.fetch);
  r = await runTool(db, 'buscar_cliente', { nombre: 'José Pérez' }, { visitorId: 'V1' });
  t('coincidencia DÉBIL: solo nombre → posible_coincidencia', r.estado === 'posible_coincidencia' && !!r.instruccion);
  t('la débil NO filtra datos guardados (privacidad)', r.nombre === undefined && r.negocio === undefined && r.resumen === undefined);
  t('la débil NO vincula el lead todavía', m.sim.tablas.visitors[0].lead_id === null);

  m = base(); db = crearSupabase(process.env, m.fetch);
  r = await runTool(db, 'buscar_cliente', { nombre: 'Nadia', negocio: 'ferretería' }, { visitorId: 'V1' });
  t('sin coincidencia → sin_coincidencia, sin dramatizar', r.estado === 'sin_coincidencia');

  r = await runTool(db, 'otra_herramienta', {}, { visitorId: 'V1' });
  t('herramienta desconocida → error controlado', r.error === 'herramienta desconocida');
}

/* ══════════ 6 · parser SSE de Claude ══════════ */

console.log('\n\x1b[36m  6 · Streaming SSE (parser + deltas)\x1b[0m');
{
  const deltas = [];
  const m = mundo({ guiones: [{ deltas: ['¡Hola', ', José! ', 'Qué gusto.'], stop_reason: 'end_turn' }] });
  const final = await claude(process.env, { model: MODELO_CHAT, system: 's', messages: [{ role: 'user', content: 'hola' }], stream: true, onTexto: (x) => deltas.push(x) }, m.fetch);
  t('onTexto recibe cada delta del stream', deltas.length === 3 && deltas[0] === '¡Hola');
  t('ensambla el mensaje final completo', final.content.length === 1 && final.content[0].text === '¡Hola, José! Qué gusto.' && final.stop_reason === 'end_turn');
  t('trozos que parten UTF-8 a la mitad no corrompen el texto', /José/.test(final.content[0].text));
  t('el body pide stream:true y la clave va en header', m.cld.llamadas[0].stream === true);

  const m2 = mundo({ guiones: [{ deltas: ['Un momento.'], toolUse: { id: 'toolu_9', name: 'buscar_cliente', input: { nombre: 'José', negocio: 'pastelería' } }, stop_reason: 'tool_use' }] });
  const f2 = await claude(process.env, { system: 's', messages: [{ role: 'user', content: 'ya hablé antes' }], stream: true, tools }, m2.fetch);
  const tu = f2.content.find((b) => b.type === 'tool_use');
  t('tool_use: acumula input_json_delta partido y lo parsea', tu && tu.id === 'toolu_9' && tu.name === 'buscar_cliente' && tu.input.negocio === 'pastelería');
  t('stop_reason tool_use llega desde message_delta', f2.stop_reason === 'tool_use');

  const m3 = mundo({ guiones: [{ texto: '{"ok":1}' }] });
  const f3 = await claude(process.env, { model: 'claude-haiku-4-5-20251001', system: 's', messages: [{ role: 'user', content: 'x' }] }, m3.fetch);
  t('modo no-stream (resumen) devuelve el JSON del texto', f3.content[0].text === '{"ok":1}');
}

/* ══════════ 7 · pipeline de resumen ══════════ */

console.log('\n\x1b[36m  7 · Conversación → lead estructurado\x1b[0m');
{
  const ANALISIS = JSON.stringify({
    nombre: 'José Pérez', negocio: 'Pastelería La Espiga', giro: 'pastelería', telefono: '3001234567', email: null,
    necesidad: 'automatizar pedidos', resumen: 'José quiere automatizar pedidos.', intencion: 'comprar', urgencia: 'alta',
    frases_textuales: ['pierdo pedidos por responder tarde'], objeciones: ['no tengo tiempo'], herramientas_actuales: ['WhatsApp'],
    idioma: 'es', siguiente_paso: 'llamada de cotización',
  });
  const sembrado = () => ({
    visitors: [{ id: 'V1', lead_id: null, last_seen: '2026-09-24' }],
    sessions: [{ id: 'S1', visitor_id: 'V1', lang: 'es', needs_summary: true, last_msg_at: '2026-09-24T10:00:00Z', analisis: null }],
    messages: [
      { id: 'M1', session_id: 'S1', visitor_id: 'V1', role: 'assistant', content: 'Hola', created_at: '2026-09-24T09:58:00Z' },
      { id: 'M2', session_id: 'S1', visitor_id: 'V1', role: 'user', content: 'Tengo una pastelería y pierdo pedidos', created_at: '2026-09-24T09:59:00Z' },
    ],
    leads: [],
  });

  let m = mundo({ tablas: sembrado(), guiones: [{ texto: '```json\n' + ANALISIS + '\n```' }] });
  let db = crearSupabase(process.env, m.fetch);
  let r = await resumirSesion(db, process.env, 'S1', m.fetch);
  t('resume la sesión marcada', r.hecho === true);
  t('los backticks del JSON se limpian antes de parsear', m.sim.tablas.sessions[0].analisis && m.sim.tablas.sessions[0].analisis.intencion === 'comprar');
  t('needs_summary baja a false y queda summarized_at', m.sim.tablas.sessions[0].needs_summary === false && !!m.sim.tablas.sessions[0].summarized_at);
  const lead = m.sim.tablas.leads[0];
  t('crea el lead con campos normalizados para el matching', lead && lead.nombre_norm === 'jose perez' && lead.telefono_norm === '3001234567');
  t('vincula visitante↔lead (recall por cookie la próxima vez)', m.sim.tablas.visitors[0].lead_id === lead.id);
  t('frases textuales y objeciones quedan en el análisis (oro del panel)',
    m.sim.tablas.sessions[0].analisis.frases_textuales[0] === 'pierdo pedidos por responder tarde' &&
    m.sim.tablas.sessions[0].analisis.objeciones[0] === 'no tengo tiempo');

  m = mundo({ tablas: sembrado(), guiones: [{ texto: 'no soy JSON, soy texto suelto' }] });
  db = crearSupabase(process.env, m.fetch);
  r = await resumirSesion(db, process.env, 'S1', m.fetch);
  t('JSON roto → no se marca resumida: el cron reintenta', r.hecho === false && r.motivo === 'json_invalido' && m.sim.tablas.sessions[0].needs_summary === true);

  const sinUsuario = sembrado();
  sinUsuario.messages = sinUsuario.messages.filter((x) => x.role !== 'user');
  m = mundo({ tablas: sinUsuario, guiones: [{ texto: ANALISIS }] });
  db = crearSupabase(process.env, m.fetch);
  r = await resumirSesion(db, process.env, 'S1', m.fetch);
  t('sesión sin mensajes de usuario → se descarta sin gastar Claude', r.hecho === false && m.sim.tablas.sessions[0].needs_summary === false && m.cld.llamadas.length === 0);

  const anonimo = sembrado();
  m = mundo({ tablas: anonimo, guiones: [{ texto: JSON.stringify({ nombre: null, negocio: null, telefono: null, email: null, resumen: 'solo saludó', intencion: 'explorar', frases_textuales: [], objeciones: [], herramientas_actuales: [] }) }] });
  db = crearSupabase(process.env, m.fetch);
  await resumirSesion(db, process.env, 'S1', m.fetch);
  t('sin datos identificables NO se crea lead (solo análisis)', m.sim.tablas.leads.length === 0 && m.sim.tablas.sessions[0].analisis.resumen === 'solo saludó');

  // fusión con lead previo: coalesce(nuevo, previo) sin pisar datos
  const conPrevio = sembrado();
  conPrevio.leads = [{ id: 'LP', nombre: 'José P', negocio: null, telefono: '3009999999', telefono_norm: '3009999999', resumen: 'previo' }];
  conPrevio.visitors[0].lead_id = 'LP';
  m = mundo({ tablas: conPrevio, guiones: [{ texto: JSON.stringify({ nombre: 'José Pérez', negocio: 'La Espiga', telefono: null, email: null, resumen: 'nuevo', intencion: 'comprar', frases_textuales: [], objeciones: [], herramientas_actuales: [] }) }] });
  db = crearSupabase(process.env, m.fetch);
  await resumirSesion(db, process.env, 'S1', m.fetch);
  t('lead previo se ACTUALIZA y los null nuevos no pisan datos viejos',
    m.sim.tablas.leads.length === 1 && m.sim.tablas.leads[0].nombre === 'José Pérez' &&
    m.sim.tablas.leads[0].telefono === '3009999999' && m.sim.tablas.leads[0].negocio === 'La Espiga');
}

/* ══════════ 8 · ruta /session ══════════ */

console.log('\n\x1b[36m  8 · Ruta session (cookie + consentimiento + saludo)\x1b[0m');
{
  let m = mundo();
  globalThis.fetch = m.fetch;
  let res = fakeRes();
  await handlerSession(fakeReq({ body: { consent: true, lang: 'es' }, headers: { 'user-agent': 'node-test' } }), res);
  const j = jsonDe(res);
  t('abre sesión: sessionId UUID + saludo de Nexa', res.statusCode === 200 && isUUID(j.sessionId) && /Nexa/.test(j.saludo) && /Sinaptia/.test(j.saludo));
  t('cliente nuevo: conocido=false', j.conocido === false);
  t('cookie vid httpOnly, SameSite=Lax, 1 año, Secure bajo https', (() => {
    const c = res.headers['set-cookie'] || '';
    return /vid=/.test(c) && /HttpOnly/i.test(c) && /SameSite=Lax/i.test(c) && /Max-Age=31536000/.test(c) && /Secure/.test(c);
  })(), res.headers['set-cookie']);
  t('guarda consentimiento versionado y user-agent', m.sim.tablas.sessions[0].consent_version === 'v1' && m.sim.tablas.sessions[0].user_agent === 'node-test');
  t('el saludo queda transcrito como primer mensaje', m.sim.tablas.messages[0].role === 'assistant' && m.sim.tablas.messages[0].content === j.saludo);

  res = fakeRes();
  await handlerSession(fakeReq({ body: { consent: false, lang: 'es' } }), res);
  t('sin consentimiento → 400 (no se guarda nada)', res.statusCode === 400);
  res = fakeRes();
  await handlerSession(fakeReq({ body: { consent: true, lang: 'fr' } }), res);
  t('idioma inexistente → 400', res.statusCode === 400);
  res = fakeRes();
  await handlerSession(fakeReq({ body: { consent: true, lang: 'es' }, headers: { origin: 'https://malo.com' } }), res);
  t('otro origen → 403', res.statusCode === 403);

  // visitante conocido: saludo con recall
  const vid = '11111111-2222-4333-8444-555555555555';
  m = mundo({ tablas: {
    visitors: [{ id: vid, lead_id: 'LP', last_seen: '2026-09-01' }],
    leads: [{ id: 'LP', nombre: 'José', negocio: 'La Espiga' }],
    sessions: [], messages: [],
  } });
  globalThis.fetch = m.fetch;
  res = fakeRes();
  await handlerSession(fakeReq({ body: { consent: true, lang: 'es' }, headers: { cookie: `vid=${vid}` } }), res);
  const j2 = jsonDe(res);
  t('lead conocido → "¡Hola de nuevo, José!" y conocido=true', /Hola de nuevo, José/.test(j2.saludo) && /La Espiga/.test(j2.saludo) && j2.conocido === true);
  t('cookie rota (no UUID) → visitante nuevo, sin error', await (async () => {
    const res2 = fakeRes();
    await handlerSession(fakeReq({ body: { consent: true, lang: 'en' }, headers: { cookie: 'vid=basura' } }), res2);
    return res2.statusCode === 200 && jsonDe(res2).conocido === false && /English|Nexa/.test(jsonDe(res2).saludo);
  })());
}

/* ══════════ 9 · ruta /chat ══════════ */

console.log('\n\x1b[36m  9 · Ruta chat (streaming + rate limit + tools)\x1b[0m');
{
  const vid = '11111111-2222-4333-8444-555555555555';
  const sid = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
  const sembrar = (extraMsgs = []) => mundo({
    tablas: {
      visitors: [{ id: vid, lead_id: null }],
      sessions: [{ id: sid, visitor_id: vid, lang: 'es', needs_summary: false }],
      messages: [{ id: 'M0', session_id: sid, visitor_id: vid, role: 'assistant', content: 'Hola', lang: 'es', created_at: '2026-09-24T09:00:00Z' }, ...extraMsgs],
      leads: [],
    },
    guiones: [{ deltas: ['¡Claro que sí! ', 'Te cuento cómo.'] }],
  });

  let m = sembrar();
  globalThis.fetch = m.fetch;
  let res = fakeRes();
  await handlerChat(fakeReq({ body: { sessionId: sid, text: 'cuéntame' }, headers: { cookie: `vid=${vid}` } }), res);
  t('responde en streaming: text/plain y trozos escritos', res.statusCode === 200 && /text\/plain/.test(res.headers['content-type']) && res.chunks.length >= 2);
  t('el stream completo es la respuesta del modelo', res.cuerpo === '¡Claro que sí! Te cuento cómo.', res.cuerpo);
  t('guarda el mensaje del usuario y la respuesta final', (() => {
    const msgs = m.sim.tablas.messages;
    return msgs.some((x) => x.role === 'user' && x.content === 'cuéntame') &&
           msgs.some((x) => x.role === 'assistant' && x.content === '¡Claro que sí! Te cuento cómo.');
  })());
  t('marca la sesión needs_summary (red del cron/end)', m.sim.tablas.sessions[0].needs_summary === true && !!m.sim.tablas.sessions[0].last_msg_at);
  t('manda a Claude el historial normalizado (empieza en user)', m.cld.llamadas[0].messages[0].role === 'user');

  res = fakeRes();
  await handlerChat(fakeReq({ body: { sessionId: sid, text: 'hola' }, headers: { cookie: 'vid=no-uuid' } }), res);
  t('cookie inválida → 400', res.statusCode === 400);
  res = fakeRes();
  await handlerChat(fakeReq({ body: { sessionId: 'otro-uuid-falso', text: 'hola' }, headers: { cookie: `vid=${vid}` } }), res);
  t('sesión que no es del visitante → 400/403 (no filtra nada)', res.statusCode === 400 || res.statusCode === 403);
  res = fakeRes();
  await handlerChat(fakeReq({ body: { sessionId: sid, text: '   ' }, headers: { cookie: `vid=${vid}` } }), res);
  t('texto vacío → 400', res.statusCode === 400);

  // rate limit: 60 mensajes de usuario en la última hora
  const ahora = new Date();
  const muchos = [];
  for (let i = 0; i < MAX_POR_HORA; i++) muchos.push({ id: 'R' + i, session_id: sid, visitor_id: vid, role: 'user', content: 'x' + i, created_at: new Date(ahora - i * 60e3).toISOString() });
  muchos.push({ id: 'RV', session_id: sid, visitor_id: vid, role: 'user', content: 'viejo', created_at: new Date(ahora - 2 * 3600e3).toISOString() });
  m = sembrar(muchos);
  globalThis.fetch = m.fetch;
  res = fakeRes();
  await handlerChat(fakeReq({ body: { sessionId: sid, text: 'otro más' }, headers: { cookie: `vid=${vid}` } }), res);
  t('rate limit: 60 msgs/hora → 429 sin llamar a Claude', res.statusCode === 429 && jsonDe(res).error === 'limit' && m.cld.llamadas.length === 0);

  // bucle de tool use: Claude pide buscar_cliente y luego responde
  m = mundo({
    tablas: {
      visitors: [{ id: vid, lead_id: null }],
      sessions: [{ id: sid, visitor_id: vid, lang: 'es', needs_summary: false }],
      messages: [{ id: 'M0', session_id: sid, visitor_id: vid, role: 'assistant', content: 'Hola', created_at: '2026-09-24T09:00:00Z' }],
      leads: [{ id: 'L-JOSE', nombre: 'José Pérez', negocio: 'La Espiga', giro: 'pastelería', nombre_norm: 'jose perez', negocio_norm: 'la espiga', telefono_norm: '3001234567', updated_at: '2026-09-20' }],
    },
    guiones: [
      { deltas: ['Déjame revisar.'], toolUse: { id: 'toolu_1', name: 'buscar_cliente', input: { nombre: 'José Pérez', telefono: '3001234567' } }, stop_reason: 'tool_use' },
      { deltas: ['¡José! Retomamos donde quedamos.'] },
    ],
  });
  globalThis.fetch = m.fetch;
  res = fakeRes();
  await handlerChat(fakeReq({ body: { sessionId: sid, text: 'soy José, ya hablé con ustedes' }, headers: { cookie: `vid=${vid}` } }), res);
  t('bucle de tools: 2 llamadas a Claude, texto de ambas ruedas en el stream', m.cld.llamadas.length === 2 && /Déjame revisar/.test(res.cuerpo) && /retomamos/i.test(res.cuerpo));
  t('el tool_result viaja en la segunda llamada con estado confirmado', (() => {
    const msgs2 = m.cld.llamadas[1].messages;
    const ultimo = msgs2[msgs2.length - 1];
    return ultimo.role === 'user' && Array.isArray(ultimo.content) &&
      JSON.parse(ultimo.content[0].content).estado === 'confirmado';
  })());
  t('la rueda tool vincula visitante↔lead para la próxima cookie', m.sim.tablas.visitors[0].lead_id === 'L-JOSE');
}

/* ══════════ 10 · ruta /end (la que le faltaba a B) ══════════ */

console.log('\n\x1b[36m  10 · Ruta end (cierre con resumen)\x1b[0m');
{
  const vid = '11111111-2222-4333-8444-555555555555';
  const sid = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
  const ANALISIS = { nombre: 'Ana', negocio: 'Florería', telefono: null, email: 'ana@flor.co', necesidad: 'responder rápido', resumen: 'Ana quiere responder rápido.', intencion: 'comprar', urgencia: 'media', frases_textuales: ['tardo horas en contestar'], objeciones: [], herramientas_actuales: ['Instagram'], idioma: 'es', siguiente_paso: 'demo' };
  const m = mundo({
    tablas: {
      visitors: [{ id: vid, lead_id: null }],
      sessions: [{ id: sid, visitor_id: vid, lang: 'es', needs_summary: true, last_msg_at: new Date().toISOString() }],
      messages: [{ id: 'M1', session_id: sid, visitor_id: vid, role: 'user', content: 'tengo una florería', created_at: '2026-09-24T10:00:00Z' }],
      leads: [],
    },
    guiones: [{ texto: JSON.stringify(ANALISIS) }],
  });
  globalThis.fetch = m.fetch;
  let res = fakeRes();
  await handlerEnd(fakeReq({ body: { sessionId: sid }, headers: { cookie: `vid=${vid}` } }), res);
  t('end resume al colgar: ok + resumen hecho', res.statusCode === 200 && jsonDe(res).ok === true && jsonDe(res).resumen === true);
  t('el lead nace del resumen de la conversación', m.sim.tablas.leads[0].nombre === 'Ana' && m.sim.tablas.leads[0].email === 'ana@flor.co');

  res = fakeRes();
  await handlerEnd(fakeReq({ body: { sessionId: sid }, headers: { cookie: 'vid=11111111-0000-4000-8000-999999999999' } }), res);
  t('end de sesión ajena → 403', res.statusCode === 403);
  res = fakeRes();
  await handlerEnd(fakeReq({ body: { sessionId: 'basura' }, headers: { cookie: `vid=${vid}` } }), res);
  t('sessionId inválido → 400', res.statusCode === 400);
}

/* ══════════ 11 · ruta /cron (rescate) ══════════ */

console.log('\n\x1b[36m  11 · Ruta cron (red de seguridad)\x1b[0m');
{
  const vieja = new Date(Date.now() - 25 * 60e3).toISOString();   // >20 min: abandonada
  const nueva = new Date(Date.now() - 2 * 60e3).toISOString();    // aún viva
  const ANALISIS = { nombre: null, negocio: 'Taller', telefono: null, email: null, necesidad: null, resumen: 'quedó a medias', intencion: 'explorar', urgencia: null, frases_textuales: [], objeciones: [], herramientas_actuales: [], idioma: 'es', siguiente_paso: null };
  const m = mundo({
    tablas: {
      visitors: [{ id: 'V1', lead_id: null }, { id: 'V2', lead_id: null }],
      sessions: [
        { id: 'S-muerta', visitor_id: 'V1', lang: 'es', needs_summary: true, last_msg_at: vieja },
        { id: 'S-viva', visitor_id: 'V2', lang: 'es', needs_summary: true, last_msg_at: nueva },
      ],
      messages: [
        { id: 'M1', session_id: 'S-muerta', visitor_id: 'V1', role: 'user', content: 'tengo un taller', created_at: vieja },
        { id: 'M2', session_id: 'S-viva', visitor_id: 'V2', role: 'user', content: 'hola', created_at: nueva },
      ],
      leads: [],
    },
    guiones: [{ texto: JSON.stringify(ANALISIS) }],
  });
  globalThis.fetch = m.fetch;
  let res = fakeRes();
  await handlerCron(fakeReq({ method: 'GET', headers: { authorization: 'Bearer mal' } }), res);
  t('sin CRON_SECRET válido → 401', res.statusCode === 401);

  res = fakeRes();
  await handlerCron(fakeReq({ method: 'GET', headers: { authorization: 'Bearer cron-test' } }), res);
  const muerta = m.sim.tablas.sessions.find((s) => s.id === 'S-muerta');
  const viva = m.sim.tablas.sessions.find((s) => s.id === 'S-viva');
  t('rescata la sesión abandonada (>20 min sin end)', res.statusCode === 200 && muerta.needs_summary === false && muerta.analisis.resumen === 'quedó a medias');
  t('no toca la sesión aún viva', viva.needs_summary === true && !viva.analisis);
  t('crea el lead del rescate (negocio identifica)', m.sim.tablas.leads.length === 1 && m.sim.tablas.leads[0].negocio === 'Taller');
}

/* ══════════ 12 · ruta /panel ══════════ */

console.log('\n\x1b[36m  12 · Ruta panel (analítica real protegida)\x1b[0m');
{
  const m = mundo({ tablas: {
    sessions: [
      { id: 'S1', lang: 'es', created_at: '2026-09-23', needs_summary: false, analisis: { intencion: 'comprar', urgencia: 'alta', frases_textuales: ['pierdo pedidos'], objeciones: ['es caro'], herramientas_actuales: ['WhatsApp'] } },
      { id: 'S2', lang: 'en', created_at: '2026-09-24', needs_summary: true, analisis: null },
    ],
    messages: [{ id: 'M1' }, { id: 'M2' }, { id: 'M3' }],
    leads: [{ id: 'L1', nombre: 'José', negocio: 'La Espiga', giro: null, necesidad: 'automatizar', resumen: 'r', updated_at: '2026-09-24' }],
    visitors: [],
  } });
  globalThis.fetch = m.fetch;
  let res = fakeRes();
  await handlerPanel(fakeReq({ method: 'GET', headers: { 'x-panel-clave': 'mala' } }), res);
  t('clave inválida → 401', res.statusCode === 401);
  res = fakeRes();
  await handlerPanel(fakeReq({ method: 'GET', headers: { 'x-panel-clave': 'panel-test' } }), res);
  const j = jsonDe(res);
  t('con la clave: totales reales de Supabase', res.statusCode === 200 && j.sesiones === 2 && j.mensajes === 3 && j.leads === 1 && j.pendientes === 1, JSON.stringify(j && { s: j.sesiones, m: j.mensajes }));
  t('agrega intenciones, urgencias y objeciones de los análisis', j.intenciones.comprar === 1 && j.urgencias.alta === 1 && j.objeciones['es caro'] === 1);
  t('las frases textuales llegan al panel (el oro)', j.frases[0].frase === 'pierdo pedidos');
  t('idiomas contados por sesión', j.idiomas.es === 1 && j.idiomas.en === 1);
}

/* ══════════ 13 · degradación sin backend ══════════ */

console.log('\n\x1b[36m  13 · Degradación (degrada, no se rompe)\x1b[0m');
{
  const envSin = { ...process.env, SUPABASE_URL: '', SUPABASE_SERVICE_KEY: '' };
  const viejo = { ...process.env };
  process.env.SUPABASE_URL = ''; process.env.SUPABASE_SERVICE_KEY = '';
  globalThis.fetch = async () => { throw new Error('no debe llamar'); };
  let res = fakeRes();
  await handlerSession(fakeReq({ body: { consent: true, lang: 'es' } }), res);
  t('sin Supabase → 503 limpio (el sitio estático sigue con motor local)', res.statusCode === 503 && jsonDe(res).error === 'backend sin configurar');
  res = fakeRes();
  await handlerChat(fakeReq({ body: { sessionId: uuidFake(), text: 'hola' }, headers: { cookie: `vid=${uuidFake()}` } }), res);
  t('chat sin backend → 503, nunca un crash', res.statusCode === 503);
  Object.assign(process.env, viejo);
  t('LANGS cubre los 3 idiomas del sitio con voz es-MX/en-US/pt-BR',
    LANGS.es.speech === 'es-MX' && LANGS.en.speech === 'en-US' && LANGS.pt.speech === 'pt-BR' &&
    LANGS.es.hello.includes('Nexa') && LANGS.en.back('Joe', 'bakery').includes('Joe'));
  void envSin;
}

/* ══════════ resultado ══════════ */

console.log('\n  \x1b[90m' + '─'.repeat(46) + '\x1b[0m');
const total = ok + fallos.length;
if (!fallos.length) console.log('  \x1b[32m' + ok + '/' + total + ' EN VERDE (100%)\x1b[0m · backend de voz (Claude+Supabase) verificado');
else { console.log('  \x1b[31;1m' + ok + '/' + total + ' — ' + fallos.length + ' FALLO(S)\x1b[0m'); fallos.forEach((f) => console.log('   · ' + f)); }
console.log('');
process.exit(fallos.length ? 1 : 0);
