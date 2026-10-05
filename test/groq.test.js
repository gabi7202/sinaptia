/**
 * groq.test.js — Contrato del proveedor Groq (groq.com) dentro de llm.js.
 *   node test/groq.test.js
 *
 * Mismas garantías que las pruebas de Grok: enrutado por clave/forzado,
 * cuerpo de petición OpenAI-compatible, streaming SSE con onTexto,
 * tool_calls ensamblados y errores claros. Sin red real: fetch inyectado.
 */
import { groq, claveGroq, modeloChat as MODELO_CHAT_FN, campoLimite } from '../server/groq.js';
import { llm, proveedor, modeloChat, modeloExtract } from '../server/llm.js';

let ok = 0; const fallos = [];
function t(n, c, d) { if (c) { ok++; console.log('  \x1b[32m✓\x1b[0m ' + n); } else { fallos.push(n + (d ? ' → ' + d : '')); console.log('  \x1b[31;1m✗\x1b[0m ' + n + (d ? '\n      ↳ ' + d : '')); } }

// ── utilidades de fetch falso ────────────────────────────────────────────────
const bodyJson = (obj) => ({ ok: true, status: 200, json: async () => obj, text: async () => JSON.stringify(obj) });
const sseBody = (chunks) => {
  const enc = new TextEncoder(); let i = 0;
  return { getReader: () => ({ read: async () => (i >= chunks.length ? { done: true }
    : { done: false, value: enc.encode(`data: ${JSON.stringify(chunks[i++])}\n\n`) }) }) };
};

console.log('\n\x1b[36m  Groq: proveedor, cuerpo, streaming y tools\x1b[0m');

t('proveedor: GROQ_API_KEY elige groq (antes que grok); GEMINI gana por defecto; LLM_PROVIDER fuerza',
  proveedor({ GROQ_API_KEY: 'g' }) === 'groq' &&
  proveedor({ XAI_API_KEY: 'x', GROQ_API_KEY: 'g' }) === 'groq' &&
  proveedor({ GEMINI_API_KEY: 'm', GROQ_API_KEY: 'g' }) === 'gemini' &&
  proveedor({ XAI_API_KEY: 'x', LLM_PROVIDER: 'groq' }) === 'groq' &&
  proveedor({}) === 'grok');

t('modelos por defecto cambian con el proveedor',
  modeloChat({ GROQ_API_KEY: 'g' }) === MODELO_CHAT_FN({}) &&
  typeof modeloExtract({ GROQ_API_KEY: 'g' }) === 'string' &&
  modeloExtract({ GROQ_API_KEY: 'g' }).length > 0);

t('claveGroq solo lee GROQ_API_KEY',
  claveGroq({ GROQ_API_KEY: 'sk-g' }) === 'sk-g' && claveGroq({}) === '');

{
  let visto = null;
  const f = async (url, init) => {
    visto = { url, init };
    return bodyJson({ choices: [{ message: { content: 'Hola, soy Nexa.' }, finish_reason: 'stop' }], usage: { total_tokens: 10 } });
  };
  const r = await groq({ GROQ_API_KEY: 'k' }, { system: 'S', messages: [{ role: 'user', content: 'hola' }] }, f);
  const cuerpo = JSON.parse(visto.init.body);
  t('no-stream: endpoint, Authorization Bearer y turno ensamblado',
    r.texto === 'Hola, soy Nexa.' && r.finish === 'stop' && r.tools.length === 0 &&
    visto.url === 'https://api.groq.com/openai/v1/chat/completions' &&
    visto.init.headers.Authorization === 'Bearer k' &&
    cuerpo.model === MODELO_CHAT_FN({}) && campoLimite(cuerpo.model) in cuerpo && cuerpo.messages[0].role === 'system' && !cuerpo.stream);
}

{
  const deltas = [];
  const chunks = [
    { choices: [{ delta: { reasoning_content: 'pensamiento privado' } }] },
    { choices: [{ delta: { content: 'Primera ' } }] },
    { choices: [{ delta: { content: 'frase.' }, finish_reason: 'stop' }] },
  ];
  const f = async () => ({ ok: true, status: 200, body: sseBody(chunks) });
  const r = await groq({ GROQ_API_KEY: 'k' }, { messages: [], stream: true, onTexto: (x) => deltas.push(x) }, f);
  t('stream: onTexto recibe cada delta y el razonamiento NUNCA se habla',
    r.texto === 'Primera frase.' && deltas.join('') === 'Primera frase.' && r.finish === 'stop');
}

{
  const chunks = [
    { choices: [{ delta: { tool_calls: [{ index: 0, id: 'c1', function: { name: 'buscar_cliente', arguments: '{"tel' } }] } }] },
    { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '": "123"}' } }] } }] },
    { choices: [{ delta: {}, finish_reason: 'tool_calls' }] },
  ];
  const f = async () => ({ ok: true, status: 200, body: sseBody(chunks) });
  const r = await groq({ GROQ_API_KEY: 'k' }, { messages: [], stream: true }, f);
  t('stream: tool_calls fragmentados se ensamblan por índice',
    r.finish === 'tool_calls' && r.tools.length === 1 &&
    r.tools[0].name === 'buscar_cliente' && r.tools[0].input.tel === '123' && r.tools[0].id === 'c1');
}

{
  let err = null;
  try { await groq({ GROQ_API_KEY: 'mala' }, { messages: [] }, async () => ({ ok: false, status: 401, text: async () => 'invalid api key' })); }
  catch (e) { err = e; }
  t('error HTTP lanza con estado y detalle (degrada a local en el cliente)',
    !!err && /groq 401 invalid api key/.test(String(err.message)));
}

{
  let llamado = '';
  const f = async (url) => { llamado = url; return bodyJson({ choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }] }); };
  const r = await llm({ GROQ_API_KEY: 'k' }, { messages: [] }, f);
  t('llm() enruta a groq cuando hay GROQ_API_KEY (chat/end no saben qué marca contesta)',
    /api\.groq\.com/.test(llamado) && r.texto === 'ok');
}

console.log(`\n  ${ok} ✓ / ${fallos.length} ✗`);
if (fallos.length) { for (const f of fallos) console.log('  ✗ ' + f); process.exit(1); }
