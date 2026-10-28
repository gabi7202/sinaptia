/**
 * llm.test.js — Groq como proveedor por defecto, sin red.
 *   node test/llm.test.js
 */
import { completar, proveedor, modeloChat, modeloExtraccion, GROQ_CHAT } from '../server/llm.js';

let ok = 0, fallos = [];
function t(n, c, d) { if (c) { ok++; console.log('  \x1b[32m✓\x1b[0m ' + n); } else { fallos.push(n + (d ? ' → ' + d : '')); console.log('  \x1b[31;1m✗\x1b[0m ' + n + (d ? '\n      ↳ ' + d : '')); } }

function resp({ ok = true, status = 200, json = null, text = '', chunks = null }) {
  return {
    ok, status,
    json: async () => json,
    text: async () => text,
    body: chunks ? {
      getReader() {
        let i = 0;
        const enc = new TextEncoder();
        return { read: async () => (i < chunks.length ? { done: false, value: enc.encode(chunks[i++]) } : { done: true }) };
      },
    } : null,
  };
}

console.log('\n\x1b[1m  SINAPTIA · Cliente LLM (Groq / xAI / OpenAI)\x1b[0m\n');

t('Groq tiene prioridad si existe GROQ_API_KEY',
  proveedor({ GROQ_API_KEY: 'g', XAI_API_KEY: 'x', OPENAI_KEY: 'o' }) === 'groq' &&
  proveedor({ XAI_API_KEY: 'x' }) === 'xai' && proveedor({ OPENAI_KEY: 'o' }) === 'openai' && proveedor({}) === null);

t('modelo por defecto de Groq y override por entorno',
  modeloChat({ GROQ_API_KEY: 'g' }) === GROQ_CHAT &&
  modeloChat({ GROQ_API_KEY: 'g', GROQ_MODEL: 'llama-test' }) === 'llama-test' &&
  modeloExtraccion({ GROQ_API_KEY: 'g', GROQ_EXTRACT_MODEL: 'fast' }) === 'fast');

t('una CHAT_MODEL vieja de xAI no pisa el modelo de Groq',
  modeloChat({ GROQ_API_KEY: 'g', CHAT_MODEL: 'grok-4.7' }) === GROQ_CHAT &&
  modeloExtraccion({ GROQ_API_KEY: 'g', EXTRACT_MODEL: 'grok-4.7' }) === GROQ_CHAT);

await (async () => {
  const llamadas = [];
  const f = async (url, opts) => {
    llamadas.push({ url, opts, body: JSON.parse(opts.body) });
    return resp({ json: { choices: [{ message: { content: 'Hola, soy Nexa.' }, finish_reason: 'stop' }], usage: { total_tokens: 12 } } });
  };
  const r = await completar({ GROQ_API_KEY: 'gsk-test' }, {
    system: 'eres nexa', messages: [{ role: 'user', content: 'hola' }], json: true, max_tokens: 200,
  }, f);

  t('Groq apunta a api.groq.com/openai/v1/chat/completions',
    llamadas[0].url === 'https://api.groq.com/openai/v1/chat/completions');
  t('la clave viaja en Authorization Bearer y no en el cuerpo',
    llamadas[0].opts.headers.Authorization === 'Bearer gsk-test' && !JSON.stringify(llamadas[0].body).includes('gsk-test'));
  t('manda system primero y el modelo configurado',
    llamadas[0].body.messages[0].role === 'system' && llamadas[0].body.messages[1].content === 'hola' &&
    llamadas[0].body.model === GROQ_CHAT);
  t('modo JSON pide response_format json_object',
    llamadas[0].body.response_format && llamadas[0].body.response_format.type === 'json_object');
  t('no manda reasoning_effort a Groq (no aplica a Llama)',
    llamadas[0].body.reasoning_effort === undefined);
  t('devuelve texto, proveedor y modelo',
    r.texto === 'Hola, soy Nexa.' && r.proveedor === 'groq' && r.modelo === GROQ_CHAT && r.finish === 'stop');
})();

await (async () => {
  const deltas = [];
  const f = async () => resp({
    chunks: [
      'data: {"choices":[{"delta":{"content":"Hola "}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"mundo"}}]}\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"total_tokens":9}}\n\n',
      'data: [DONE]\n\n',
    ],
  });
  const r = await completar({ GROQ_API_KEY: 'gsk-test' }, {
    messages: [{ role: 'user', content: 'x' }], stream: true, onTexto: (t) => deltas.push(t),
  }, f);
  t('streaming: emite cada delta y ensambla el texto', deltas.join('') === 'Hola mundo' && r.texto === 'Hola mundo');
  t('streaming: reporta finish y usage', r.finish === 'stop' && r.uso.total_tokens === 9);
})();

await (async () => {
  let intentos = 0;
  const f = async (url, opts) => {
    intentos++;
    const body = JSON.parse(opts.body);
    if (intentos === 1) return resp({ ok: false, status: 400, text: 'response_format is not supported' });
    if ('response_format' in body) throw new Error('no debió reintentar con response_format');
    return resp({ json: { choices: [{ message: { content: '{"respuesta":"ok"}', tool_calls: [] }, finish_reason: 'stop' }] } });
  };
  const r = await completar({ GROQ_API_KEY: 'g' }, {
    messages: [{ role: 'user', content: 'x' }], json: true,
  }, f);
  t('si Groq rechaza response_format, reintenta sin él (sin romper el turno)',
    intentos === 2 && r.texto === '{"respuesta":"ok"}');
})();

await (async () => {
  const f = async () => resp({ ok: false, status: 401, text: 'invalid api key' });
  let err = null;
  try { await completar({ GROQ_API_KEY: 'mala' }, { messages: [{ role: 'user', content: 'x' }] }, f); }
  catch (e) { err = e; }
  t('clave mala → error claro "groq 401"', !!err && /groq 401/.test(err.message));
})();

await (async () => {
  const f = async () => resp({ json: { choices: [{ message: { content: 'hola' }, finish_reason: 'stop' }] } });
  const r = await completar({ XAI_API_KEY: 'xai-test' }, { messages: [{ role: 'user', content: 'x' }] }, f);
  t('xAI se sigue usando si no hay GROQ_API_KEY', r.proveedor === 'xai' && r.texto === 'hola');
})();

await (async () => {
  const f = async () => resp({ json: { choices: [{ message: { content: 'hola' }, finish_reason: 'stop' }] } });
  const r = await completar({ OPENAI_KEY: 'sk-test' }, { messages: [{ role: 'user', content: 'x' }] }, f);
  t('OpenAI es la tercera opción', r.proveedor === 'openai' && r.texto === 'hola');
})();

await (async () => {
  let err = null;
  try { await completar({}, { messages: [] }, async () => resp({})); } catch (e) { err = e; }
  t('sin ninguna clave no llama a nadie', !!err && /sin proveedor/.test(err.message));
})();

console.log('\n  \x1b[90m' + '─'.repeat(46) + '\x1b[0m');
const total = ok + fallos.length;
if (!fallos.length) console.log('  \x1b[32m' + ok + '/' + total + ' EN VERDE (100%)\x1b[0m · proveedor LLM verificado');
else { console.log('  \x1b[31;1m' + ok + '/' + total + ' — ' + fallos.length + ' FALLO(S)\x1b[0m'); fallos.forEach((f) => console.log('   · ' + f)); }
console.log('');
process.exit(fallos.length ? 1 : 0);
