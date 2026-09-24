import { createClient } from '@supabase/supabase-js';

export const db = createClient(import.meta.env.SUPABASE_URL, import.meta.env.SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
});

export const isUUID = (s: unknown): s is string =>
  typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

// sendBeacon a veces no manda Origin, por eso se permite vacío (aún se exige cookie + UUID válidos)
export const sameOrigin = (req: Request) => {
  const o = req.headers.get('origin');
  return !o || o === new URL(req.url).origin;
};

export const norm = (s?: string | null) =>
  (s ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[%_,]/g, '').trim();
export const digits = (s?: string | null) => (s ?? '').replace(/\D/g, '').slice(-10);

export const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
