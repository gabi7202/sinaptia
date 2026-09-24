/**
 * resumen.js — Conversación → lead estructurado (el oro del análisis).
 *
 * Pipeline heredado de B: al cerrar la sesión (o por el cron de rescate),
 * Grok lee la transcripción completa y devuelve SOLO un JSON con
 * intención, urgencia, frases textuales, objeciones, herramientas actuales y
 * siguiente paso. Pide el JSON con response_format json_object y, si aun así
 * llega roto, la sesión queda needs_summary=true y el cron reintenta: nunca se
 * pierde una conversación.
 *
 * El lead solo se crea/actualiza si hay al menos un dato identificador
 * (nombre, negocio, teléfono o email), y los campos nuevos se fusionan con el
 * lead previo sin pisar datos: coalesce(nuevo, previo).
 */

import { norm, digits, eq } from './nucleo.js';
import { grok, MODELO_EXTRACT } from './grok.js';
import { MARCA } from './langs.js';

const SYS = `Analizas conversaciones de ventas de ${MARCA}. Devuelve SOLO un JSON válido, sin texto extra ni backticks, con este esquema:
{"nombre":string|null,"negocio":string|null,"giro":string|null,"telefono":string|null,"email":string|null,
"necesidad":string|null,"resumen":string,"intencion":"comprar"|"explorar"|"soporte"|"otro",
"urgencia":"alta"|"media"|"baja"|null,"frases_textuales":string[],"objeciones":string[],
"herramientas_actuales":string[],"idioma":string,"siguiente_paso":string|null}
Reglas: usa null si la persona no lo dijo explícitamente; no inventes. "frases_textuales" son citas literales del usuario sobre lo que busca (con sus propias palabras). "resumen": máximo 3 frases; si hay resumen previo, intégralo.`;

export async function resumirSesion(db, env, sessionId, fetchImpl) {
  const { data: s } = await db.select('sessions',
    `select=id,visitor_id,needs_summary&${eq('id', sessionId)}`, { single: true });
  if (!s || !s.needs_summary) return { hecho: false, motivo: 'sin_flag' };

  const { data: msgs } = await db.select('messages',
    `select=role,content&${eq('session_id', sessionId)}&order=created_at.asc`);
  if (!msgs || !msgs.some((m) => m.role === 'user')) {
    await db.actualizar('sessions', eq('id', sessionId), { needs_summary: false });
    return { hecho: false, motivo: 'sin_usuario' };
  }

  const { data: v } = await db.select('visitors',
    `select=lead_id&${eq('id', s.visitor_id)}`, { single: true });
  let prev = null;
  if (v && v.lead_id) {
    ({ data: prev } = await db.select('leads', `select=*&${eq('id', v.lead_id)}`, { single: true }));
  }

  const transcript = msgs
    .map((m) => `${m.role === 'user' ? 'USUARIO' : 'ASISTENTE'}: ${m.content}`)
    .join('\n');

  const r = await grok(env, {
    model: (env && env.EXTRACT_MODEL) || MODELO_EXTRACT,
    max_tokens: 900,
    system: SYS,
    json: true,          // response_format: json_object → el JSON llega limpio
    messages: [{
      role: 'user',
      content: `${prev && prev.resumen ? `Resumen previo: ${prev.resumen}\n\n` : ''}Conversación:\n${transcript}`,
    }],
  }, fetchImpl);

  const txt = r.texto || '';
  let a;
  try {
    a = JSON.parse(txt.replace(/```json|```/g, '').trim());
  } catch (e) {
    return { hecho: false, motivo: 'json_invalido' }; // queda needs_summary=true: el cron reintenta
  }

  const now = new Date().toISOString();
  await db.actualizar('sessions', eq('id', sessionId),
    { analisis: a, needs_summary: false, summarized_at: now });

  // Solo se crea/actualiza lead si hay algo que identifique a la persona
  if (a.nombre || a.negocio || a.telefono || a.email) {
    const m = {
      nombre: a.nombre ?? (prev && prev.nombre) ?? null,
      negocio: a.negocio ?? (prev && prev.negocio) ?? null,
      giro: a.giro ?? (prev && prev.giro) ?? null,
      telefono: a.telefono ?? (prev && prev.telefono) ?? null,
      email: String(a.email ?? (prev && prev.email) ?? '').toLowerCase() || null,
      necesidad: a.necesidad ?? (prev && prev.necesidad) ?? null,
      resumen: a.resumen ?? (prev && prev.resumen) ?? null,
    };
    const fila = {
      ...m,
      nombre_norm: norm(m.nombre) || null,
      negocio_norm: norm(m.negocio) || null,
      telefono_norm: digits(m.telefono) || null,
      updated_at: now,
    };
    if (prev) {
      await db.actualizar('leads', eq('id', prev.id), fila);
    } else {
      const { data: l } = await db.insertar('leads', fila);
      if (l && l.id) await db.actualizar('visitors', eq('id', s.visitor_id), { lead_id: l.id });
    }
  }
  return { hecho: true, analisis: a };
}

export { SYS as SISTEMA_RESUMEN };
