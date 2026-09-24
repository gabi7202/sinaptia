import type { APIRoute } from 'astro';
import { db, isUUID, sameOrigin, json } from '../../../lib/server';
import { LANGS, type LangKey } from '../../../lib/langs';

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!sameOrigin(request)) return json({ error: 'origin' }, 403);
  const b: any = await request.json().catch(() => null);
  if (!b?.consent || !Object.hasOwn(LANGS, b.lang)) return json({ error: 'bad' }, 400);
  const lang = b.lang as LangKey;

  const vid = cookies.get('vid')?.value;
  let visitor: any = isUUID(vid) ? (await db.from('visitors').select('id,lead_id').eq('id', vid).single()).data : null;
  if (!visitor) visitor = (await db.from('visitors').insert({}).select('id,lead_id').single()).data;
  if (!visitor) return json({ error: 'db' }, 500);

  cookies.set('vid', visitor.id, {
    httpOnly: true, secure: import.meta.env.PROD, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 365,
  });
  const now = new Date().toISOString();
  await db.from('visitors').update({ last_seen: now }).eq('id', visitor.id);

  const lead = visitor.lead_id ? (await db.from('leads').select('nombre,negocio').eq('id', visitor.lead_id).single()).data : null;

  const { data: session } = await db.from('sessions').insert({
    visitor_id: visitor.id, lang, consent_at: now, consent_version: 'v1',
    user_agent: (request.headers.get('user-agent') ?? '').slice(0, 300),
  }).select('id').single();
  if (!session) return json({ error: 'db' }, 500);

  const L = LANGS[lang];
  const saludo = lead?.nombre ? L.back(lead.nombre, lead.negocio) : L.hello;
  await db.from('messages').insert({ session_id: session.id, visitor_id: visitor.id, role: 'assistant', content: saludo, lang });

  return json({ sessionId: session.id, saludo, conocido: !!lead?.nombre });
};
