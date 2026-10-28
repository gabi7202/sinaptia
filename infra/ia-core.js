/**
 * ia-core.js — El cerebro, en un solo lugar.
 *
 * Lo importan tanto el Cloudflare Worker (infra/worker-ia.js) como la función
 * serverless de Vercel (api/ia.js), para que no exista deriva entre plataformas.
 *
 * Proveedor: Groq por defecto (GROQ_API_KEY), xAI/Grok después, OpenAI al final.
 * El prompt maestro vive en server/prompt-maestro.js y la llamada en server/llm.js.
 *
 * Contrato (cuerpo JSON entrante → { status, cuerpo }):
 *   { mensaje, historial, idioma, canal, lead, guion, memoria }  → respuesta del agente
 *   { respuesta_ya_dicha, interrupcion_cliente }                 → { respuesta_fusionada }
 *   { traducir: { texto, de, a } }                               → { traducido }
 *   { resumir: { conversacion, idioma } }                        → { resumen }
 *
 * Las claves viven como secretos del entorno (GROQ_API_KEY / XAI_API_KEY /
 * OPENAI_KEY), nunca en el cliente.
 */

import { completar, proveedor, modeloChat } from '../server/llm.js';
import { promptMaestro, promptFusion, promptTraduccion, promptResumen, PROMPT_VERSION } from '../server/prompt-maestro.js';
import { extraerJSON, riesgoComercial } from '../server/json.js';
import { normalizarMemoria } from '../server/memoria-sesion.js';

export function cors(origen) {
  return {
    'Access-Control-Allow-Origin': origen || '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

/** Origen permitido por host exacto (no por prefijo: evil-tu-dominio.com no pasa). */
export function origenValido(permitido, from) {
  if (!permitido) return true;
  try { return new URL(String(permitido)).host === new URL(String(from)).host; }
  catch (e) { return String(from || '').startsWith(String(permitido)); }
}

const NOMBRE_IDIOMA = { en: 'English', es: 'español', pt: 'português' };

/**
 * Variables que ya no hacen falta si usas Groq. Se listan solo por nombre (nunca
 * por valor) en /api/ia para que puedas borrarlas de Vercel sin adivinar.
 */
export const VAR_OBSOLETAS = [
  'XAI_API_KEY', 'GROK_API_KEY', 'GROK_MODEL', 'XAI_MODEL', 'XAI_BASE_URL',
  'GROK_EFFORT', 'CHAT_MODEL', 'EXTRACT_MODEL', 'OPENAI_KEY', 'OPENAI_MODEL',
  'OPENAI_EXTRACT_MODEL', 'GROK_EXTRACT_MODEL', 'XAI_EXTRACT_MODEL',
];

export const VAR_RECOMENDADAS = [
  'GROQ_API_KEY', 'GROQ_MODEL', 'LEAD_EMAIL', 'GOOGLE_SCRIPT_URL',
  'GOOGLE_SCRIPT_TOKEN', 'CRON_SECRET', 'PANEL_SECRET',
];

/** Diagnóstico de configuración para /api/ia (GET). Nunca devuelve valores. */
export function diagnosticoEnv(env = {}) {
  const obsoletas = VAR_OBSOLETAS.filter((k) => !!env[k]);
  return {
    configurado: {
      groq: !!env.GROQ_API_KEY,
      google_script: !!env.GOOGLE_SCRIPT_URL,
      email_privado: !!env.LEAD_EMAIL,
      resend: !!(env.RESEND_API_KEY && env.RESEND_FROM),
      supabase: !!(env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY),
      panel: !!env.PANEL_SECRET,
      cron: !!env.CRON_SECRET,
    },
    obsoletas,
    recomendadas: VAR_RECOMENDADAS,
    nota: obsoletas.length
      ? 'Borra estas variables en Vercel si solo usas Groq: ' + obsoletas.join(', ')
      : 'No hay variables obsoletas de xAI/OpenAI configuradas.',
  };
}

function salida(cuerpo, status = 200, extra = {}) {
  return { status, cuerpo: JSON.stringify(cuerpo), headers: extra };
}

function persona(env) {
  return String((env && env.FUNDADOR) || '').slice(0, 60);
}

/** Salud del cerebro sin revelar claves. Útil para verificar el deploy. */
export function salud(env = {}) {
  const p = proveedor(env);
  return {
    ok: !!p,
    proveedor: p,
    modelo: p ? modeloChat(env) : null,
    promptVersion: PROMPT_VERSION,
    memoria: 'navegador (TTL) + servidor (opcional)',
    ...diagnosticoEnv(env),
  };
}

export async function manejarCuerpo(body, env = {}, fetchImpl) {
  if (!body || typeof body !== 'object') return salida({ error: 'cuerpo inválido' }, 400);
  const { mensaje, historial = [], idioma = 'es', canal = 'chat', lead = null, guion = {} } = body;

  if (!proveedor(env)) return salida({ error: 'sin proveedor de IA configurado', promptVersion: PROMPT_VERSION }, 503);

  // ── Corte de voz: UNA respuesta fusionada, no dos textos pegados ──
  if (body.respuesta_ya_dicha != null && body.interrupcion_cliente != null) {
    const sistema = promptFusion({ idioma: NOMBRE_IDIOMA[idioma] || idioma });
    try {
      const t = await completar(env, {
        model: modeloChat(env),
        max_tokens: 180,
        temperature: 0.4,
        system: sistema,
        json: true,
        messages: [{ role: 'user', content: String(body.interrupcion_cliente).slice(0, 800) }],
      }, fetchImpl);
      const j = extraerJSON(t.texto);
      if (!j || typeof j.respuesta_fusionada !== 'string' || !j.respuesta_fusionada.trim()) {
        return salida({ error: 'fusión inválida' }, 502);
      }
      return salida({ respuesta_fusionada: j.respuesta_fusionada.trim(), proveedor: t.proveedor });
    } catch (e) {
      return salida({ error: 'proveedor falló en fusión' }, 502);
    }
  }

  // ── Traducción (puente de idioma del dueño) ──
  if (body.traducir && typeof body.traducir.texto === 'string') {
    const { texto, de = 'es', a = 'en' } = body.traducir;
    try {
      const t = await completar(env, {
        model: modeloChat(env),
        max_tokens: 700,
        temperature: 0.2,
        system: promptTraduccion({ de, a }),
        messages: [{ role: 'user', content: String(texto).slice(0, 4000) }],
      }, fetchImpl);
      if (typeof t.texto !== 'string' || !t.texto.trim()) return salida({ error: 'traducción inválida' }, 502);
      return salida({ traducido: t.texto.trim(), proveedor: t.proveedor });
    } catch (e) {
      return salida({ error: 'proveedor falló al traducir' }, 502);
    }
  }

  // ── Resumen en español de una conversación guardada ──
  if (body.resumir && typeof body.resumir.conversacion === 'string') {
    try {
      const t = await completar(env, {
        model: modeloChat(env),
        max_tokens: 700,
        temperature: 0.3,
        system: promptResumen({ idioma: body.resumir.idioma || 'es' }),
        messages: [{ role: 'user', content: String(body.resumir.conversacion).slice(0, 12000) }],
      }, fetchImpl);
      if (typeof t.texto !== 'string' || !t.texto.trim()) return salida({ error: 'resumen inválido' }, 502);
      return salida({ resumen: t.texto.trim(), proveedor: t.proveedor });
    } catch (e) {
      return salida({ error: 'proveedor falló al resumir' }, 502);
    }
  }

  // ── Turno normal del agente ──
  if (typeof mensaje !== 'string' || !mensaje.trim()) return salida({ error: 'mensaje vacío' }, 400);

  const memoria = normalizarMemoria(body.memoria);
  const sistema = promptMaestro({
    idioma: NOMBRE_IDIOMA[idioma] || NOMBRE_IDIOMA.es,
    codigo: idioma,
    canal,
    guion,
    memoria,
    lead,
    persona: persona(env),
  });

  const messages = [
    ...historial.slice(-10).map((m) => ({
      role: m.role === 'bot' || m.role === 'assistant' ? 'assistant' : 'user',
      content: String(m.content || m.texto || '').slice(0, 1200),
    })).filter((m) => m.content),
    { role: 'user', content: mensaje.slice(0, 2400) },
  ];

  try {
    const t = await completar(env, {
      model: modeloChat(env),
      max_tokens: canal === 'voz' ? 220 : 420,
      temperature: 0.45,
      system: sistema,
      json: true,
      messages,
    }, fetchImpl);

    const j = extraerJSON(t.texto);
    if (!j || typeof j.respuesta !== 'string' || !j.respuesta.trim()) {
      return salida({ error: 'respuesta inválida', promptVersion: PROMPT_VERSION }, 502);
    }
    const riesgo = riesgoComercial(j.respuesta, guion);
    if (riesgo) {
      // Preferimos el guion seguro del motor a una promesa inventada por el modelo.
      return salida({ error: 'respuesta insegura', motivo: riesgo, promptVersion: PROMPT_VERSION }, 422);
    }
    return salida({
      ...j,
      respuesta: j.respuesta.trim(),
      proveedor: t.proveedor,
      modelo: t.modelo,
      promptVersion: PROMPT_VERSION,
    });
  } catch (e) {
    return salida({
      error: 'proveedor falló',
      detalle: String(e && e.message ? e.message : e).slice(0, 200),
      promptVersion: PROMPT_VERSION,
    }, 502);
  }
}
