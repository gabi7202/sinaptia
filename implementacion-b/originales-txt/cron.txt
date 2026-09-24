import type { APIRoute } from 'astro';
import { db } from '../../../lib/server';
import { summarizeSession } from '../../../lib/summarize';

export const prerender = false;

// Red de seguridad: resume sesiones que nunca mandaron el "end" (batería, crash, cierre brusco)
export const GET: APIRoute = async ({ request }) => {
  if (request.headers.get('authorization') !== `Bearer ${import.meta.env.CRON_SECRET}`) return new Response('no', { status: 401 });
  const cutoff = new Date(Date.now() - 20 * 60e3).toISOString();
  const { data } = await db.from('sessions').select('id').eq('needs_summary', true).lt('last_msg_at', cutoff).limit(10);
  for (const s of data ?? []) await summarizeSession(s.id);
  return new Response(`ok ${data?.length ?? 0}`);
};
