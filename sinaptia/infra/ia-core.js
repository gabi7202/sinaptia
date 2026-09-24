/**
 * ia-core.js — El cerebro, en un solo lugar.
 *
 * Lo importan tanto el Cloudflare Worker (infra/worker-ia.js) como la función
 * serverless de Vercel (api/ia.js), para que no exista deriva entre plataformas.
 *
 * Contrato (cuerpo JSON entrante → { status, cuerpo }):
 *   { mensaje, historial, idioma, canal, lead, guion }   → respuesta del agente
 *   { respuesta_ya_dicha, interrupcion_cliente }         → { respuesta_fusionada }
 *   { traducir: { texto, de, a } }                       → { traducido }
 *   { resumir: { conversacion, idioma } }                → { resumen }
 *
 * Las claves viven como secretos del entorno (OPENAI_KEY / ANTHROPIC_KEY),
 * nunca en el cliente.
 */

export function cors(origen) {
  return {
    'Access-Control-Allow-Origin': origen || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

async function conOpenAI(env, sistema, mensajes, json = true) {
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.OPENAI_KEY}` },
    body: JSON.stringify({
      model: env.OPENAI_MODEL || 'gpt-4o-mini',
      temperature: 0.4,
      max_tokens: 400,
      ...(json ? { response_format: { type: 'json_object' } } : {}),
      messages: [{ role: 'system', content: sistema }, ...mensajes],
    }),
  });
  if (!r.ok) throw new Error(`openai ${r.status}`);
  const j = await r.json();
  return j.choices && j.choices[0] ? j.choices[0].message.content : null;
}

async function conAnthropic(env, sistema, mensajes) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': env.ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: env.ANTHROPIC_MODEL || 'claude-sonnet-4-5',
      max_tokens: 400,
      temperature: 0.4,
      system: sistema,
      messages: mensajes.map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })),
    }),
  });
  if (!r.ok) throw new Error(`anthropic ${r.status}`);
  const j = await r.json();
  return (j.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('');
}

async function llamar(env, sistema, mensajes, json = true) {
  if (env.OPENAI_KEY) return conOpenAI(env, sistema, mensajes, json);
  if (env.ANTHROPIC_KEY) return conAnthropic(env, sistema, mensajes);
  return null;
}

function salida(cuerpo, status = 200) {
  return { status, cuerpo: JSON.stringify(cuerpo) };
}

export async function manejarCuerpo(body, env) {
  if (!body || typeof body !== 'object') return salida({ error: 'cuerpo inválido' }, 400);
  const { mensaje, historial = [], idioma = 'es', canal = 'chat', lead = null, guion = {} } = body;

  // ── Corte de voz: UNA respuesta fusionada, no dos textos pegados ──
  if (body.respuesta_ya_dicha != null && body.interrupcion_cliente != null) {
    const sistema = `Eres Nexa, el agente de voz de SINAPTIA. Hablas en ${idioma}.
Ibas diciendo: "${body.respuesta_ya_dicha || ''}".
El cliente te interrumpió con: "${body.interrupcion_cliente}".
Genera UNA única respuesta hablada que continúe naturalmente incorporando lo que pidió,
sin repetir literalmente lo ya dicho y sin frases como "como mencionaba antes".
Máximo 2 frases, lenguaje hablado, sin markdown.
Responde ÚNICAMENTE con JSON: {"respuesta_fusionada":string}`;
    try {
      const t = await llamar(env, sistema, [{ role: 'user', content: body.interrupcion_cliente }]);
      let j = null;
      try { j = JSON.parse(t); } catch (e) { j = null; }
      if (!j || typeof j.respuesta_fusionada !== 'string') return salida({ error: 'fusión inválida' }, 502);
      return salida(j);
    } catch (e) {
      return salida({ error: 'proveedor falló en fusión' }, 502);
    }
  }

  // ── Traducción (puente de idioma del dueño) ──
  if (body.traducir && typeof body.traducir.texto === 'string') {
    const { texto, de = 'es', a = 'en' } = body.traducir;
    const sistema = `Traduce de ${de} a ${a}. Conserva el tono comercial cercano y directo, sin añadir ni quitar ideas. Devuelve ÚNICAMENTE el texto traducido, sin comillas ni comentarios.`;
    try {
      const t = await llamar(env, sistema, [{ role: 'user', content: texto }], false);
      if (typeof t !== 'string' || !t.trim()) return salida({ error: 'traducción inválida' }, 502);
      return salida({ traducido: t.trim() });
    } catch (e) {
      return salida({ error: 'proveedor falló al traducir' }, 502);
    }
  }

  // ── Resumen en español de una conversación guardada ──
  if (body.resumir && typeof body.resumir.conversacion === 'string') {
    const sistema = `Eres el asesor interno del dueño de SINAPTIA, que habla solo español. Resume la conversación siguiente en ${body.resumir.idioma || 'es'}: qué pidió el prospecto, qué datos dio (nombre, email, empresa, necesidad), qué se le prometió o acordó, y cuál es el siguiente paso recomendado. Usa viñetas cortas. Devuelve ÚNICAMENTE el resumen.`;
    try {
      const t = await llamar(env, sistema, [{ role: 'user', content: body.resumir.conversacion }], false);
      if (typeof t !== 'string' || !t.trim()) return salida({ error: 'resumen inválido' }, 502);
      return salida({ resumen: t.trim() });
    } catch (e) {
      return salida({ error: 'proveedor falló al resumir' }, 502);
    }
  }

  // ── Turno normal del agente ──
  if (typeof mensaje !== 'string' || !mensaje.trim()) return salida({ error: 'mensaje vacío' }, 400);

  const sistema = `Eres Nexa, el agente de diagnóstico de IA de SINAPTIA.
Hablas en ${idioma}. Canal: ${canal === 'voz' ? 'llamada de voz' : 'chat'}.

TRABAJO DE ESTE TURNO (guion estructurado del motor; única fuente de verdad):
${JSON.stringify(guion, null, 1)}

REGLAS INVIOABLES:
- ${canal === 'voz' ? 'Máximo 2 frases, cortas y habladas. Sin listas ni markdown.' : 'Máximo 4 frases.'}
- NO leas ni describas el sitio ni sus secciones. No digas "en esta página".
- NO inventes precios, plazos ni cifras. Usa solo los rangos del guion.
- Si el guion trae una correccion, dila primero con respeto y termina con la pregunta del guion.
- Si no sabes algo: dilo y ofrece verificarlo con un humano.
- Responde ÚNICAMENTE con JSON: {"respuesta":string,"intencion":string,"confianza":number,"datos":object,"paso":"seguir"|"cerrar"}`;

  try {
    const t = await llamar(env, sistema, [
      ...historial.slice(-8).map((m) => ({ role: m.role === 'bot' ? 'assistant' : 'user', content: String(m.content).slice(0, 1200) })),
      { role: 'user', content: mensaje.slice(0, 2000) },
    ]);
    let j = null;
    try { j = JSON.parse(t); } catch (e) { j = null; }
    if (!j || typeof j.respuesta !== 'string') return salida({ error: 'respuesta inválida' }, 502);
    return salida(j);
  } catch (e) {
    return salida({ error: 'proveedor falló', detalle: String(e).slice(0, 200) }, 502);
  }
}
