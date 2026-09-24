import { db, norm, digits } from './server';
import { anthropic, EXTRACT_MODEL } from './agent';
import { BRAND } from './langs';

const SYS = `Analizas conversaciones de ventas de ${BRAND}. Devuelve SOLO un JSON válido, sin texto extra ni backticks, con este esquema:
{"nombre":string|null,"negocio":string|null,"giro":string|null,"telefono":string|null,"email":string|null,
"necesidad":string|null,"resumen":string,"intencion":"comprar"|"explorar"|"soporte"|"otro",
"urgencia":"alta"|"media"|"baja"|null,"frases_textuales":string[],"objeciones":string[],
"herramientas_actuales":string[],"idioma":string,"siguiente_paso":string|null}
Reglas: usa null si la persona no lo dijo explícitamente; no inventes. "frases_textuales" son citas literales del usuario sobre lo que busca (con sus propias palabras). "resumen": máximo 3 frases; si hay resumen previo, intégralo.`;

export async function summarizeSession(sessionId: string) {
  const { data: s } = await db.from('sessions').select('id,visitor_id,needs_summary').eq('id', sessionId).single();
  if (!s?.needs_summary) return;

  const { data: msgs } = await db.from('messages').select('role,content').eq('session_id', sessionId).order('created_at');
  if (!msgs?.some((m) => m.role === 'user')) {
    await db.from('sessions').update({ needs_summary: false }).eq('id', sessionId);
    return;
  }

  const { data: v } = await db.from('visitors').select('lead_id').eq('id', s.visitor_id).single();
  const prev = v?.lead_id ? (await db.from('leads').select('*').eq('id', v.lead_id).single()).data : null;

  const transcript = msgs.map((m) => `${m.role === 'user' ? 'USUARIO' : 'ASISTENTE'}: ${m.content}`).join('\n');
  const res = await anthropic.messages.create({
    model: EXTRACT_MODEL, max_tokens: 900, system: SYS,
    messages: [{ role: 'user', content: `${prev ? `Resumen previo: ${prev.resumen}\n\n` : ''}Conversación:\n${transcript}` }],
  });

  const txt = res.content.map((b: any) => (b.type === 'text' ? b.text : '')).join('');
  let a: any;
  try { a = JSON.parse(txt.replace(/```json|```/g, '').trim()); } catch { return; } // queda needs_summary=true, el cron reintenta

  const now = new Date().toISOString();
  await db.from('sessions').update({ analisis: a, needs_summary: false, summarized_at: now }).eq('id', sessionId);

  // Solo se crea/actualiza lead si hay algo que identifique a la persona
  if (a.nombre || a.negocio || a.telefono || a.email) {
    const m = {
      nombre: a.nombre ?? prev?.nombre ?? null, negocio: a.negocio ?? prev?.negocio ?? null,
      giro: a.giro ?? prev?.giro ?? null, telefono: a.telefono ?? prev?.telefono ?? null,
      email: (a.email ?? prev?.email ?? null)?.toLowerCase() ?? null,
      necesidad: a.necesidad ?? prev?.necesidad ?? null, resumen: a.resumen ?? prev?.resumen ?? null,
    };
    const row = {
      ...m, nombre_norm: norm(m.nombre) || null, negocio_norm: norm(m.negocio) || null,
      telefono_norm: digits(m.telefono) || null, updated_at: now,
    };
    if (prev) {
      await db.from('leads').update(row).eq('id', prev.id);
    } else {
      const { data: l } = await db.from('leads').insert(row).select('id').single();
      if (l) await db.from('visitors').update({ lead_id: l.id }).eq('id', s.visitor_id);
    }
  }
}
