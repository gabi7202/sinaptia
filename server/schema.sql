-- ═══════════════════════════════════════════════════════════════════
--  SINAPTIA · Backend de voz (fusión A+B) — Schema de Supabase
--
--  Cómo aplicarlo:
--    1. Crea un proyecto en https://supabase.com (plan Free alcanza)
--    2. SQL Editor → New query → pega este archivo → Run
--    3. Copia a Vercel (Settings → Environment Variables):
--         SUPABASE_URL          = Settings → API → Project URL
--         SUPABASE_SERVICE_KEY  = Settings → API → service_role key (SECRETO:
--                                 solo servidor; jamás en el cliente ni en git)
--
--  Deducción: este schema reproduce exactamente las tablas/columnas que usaba
--  la implementación B (visitors, sessions, messages, leads + *_norm), que
--  venía sin migraciones. RLS activado SIN políticas: las tablas quedan
--  privadas para anon/authenticated; solo la service_role (servidor) las toca.
-- ═══════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

-- ── leads: la memoria de clientes (el oro) ─────────────────────────
create table if not exists leads (
  id            uuid primary key default gen_random_uuid(),
  nombre        text,
  negocio       text,
  giro          text,
  telefono      text,
  email         text,
  necesidad     text,
  resumen       text,
  -- normalizados para matching fuerte/débil de buscar_cliente:
  nombre_norm   text,          -- sin acentos ni mayúsculas
  negocio_norm  text,
  telefono_norm text,          -- últimos 10 dígitos
  updated_at    timestamptz not null default now()
);
create index if not exists leads_telefono_norm_idx on leads (telefono_norm);
create index if not exists leads_nombre_norm_idx  on leads (nombre_norm);
create index if not exists leads_email_idx        on leads (lower(email));
create index if not exists leads_negocio_norm_idx on leads (negocio_norm);
create index if not exists leads_updated_idx      on leads (updated_at desc);

-- ── visitors: navegador ↔ lead (cookie httpOnly `vid`) ─────────────
create table if not exists visitors (
  id        uuid primary key default gen_random_uuid(),
  lead_id   uuid references leads (id) on delete set null,
  last_seen timestamptz not null default now()
);
create index if not exists visitors_lead_idx on visitors (lead_id);

-- ── sessions: cada conversación, con consentimiento versionado ─────
create table if not exists sessions (
  id              uuid primary key default gen_random_uuid(),
  visitor_id      uuid not null references visitors (id) on delete cascade,
  lang            text not null default 'es',
  consent_at      timestamptz,
  consent_version text,
  user_agent      text,
  needs_summary   boolean not null default false,   -- true en cuanto habla el usuario
  last_msg_at     timestamptz,                      -- lo usa el cron de rescate (>20 min)
  analisis        jsonb,                            -- JSON estructurado de Haiku al cerrar
  summarized_at   timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists sessions_visitor_idx  on sessions (visitor_id);
create index if not exists sessions_rescate_idx  on sessions (needs_summary, last_msg_at);
create index if not exists sessions_created_idx  on sessions (created_at desc);

-- ── messages: transcripción completa (historial + resumen) ─────────
create table if not exists messages (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions (id) on delete cascade,
  visitor_id uuid not null references visitors (id) on delete cascade,
  role       text not null check (role in ('user', 'assistant')),
  content    text not null,
  lang       text,
  created_at timestamptz not null default now()
);
create index if not exists messages_session_idx on messages (session_id, created_at);
create index if not exists messages_visitor_idx on messages (visitor_id, created_at desc);

-- ── privacidad por diseño ──────────────────────────────────────────
-- RLS activado y SIN políticas: cualquier clave anon/authenticated queda
-- rechazada. El backend usa la service_role key, que vive solo en Vercel.
alter table leads    enable row level security;
alter table visitors enable row level security;
alter table sessions enable row level security;
alter table messages enable row level security;

-- Retención sugerida (opcional, ajústala a tu aviso de privacidad):
-- Borra transcripciones ya resumidas con más de 90 días; el lead (perfil) se conserva.
-- La service_role salta RLS, así que basta programar (pg_cron / edge function):
--   delete from messages where created_at < now() - interval '90 days';
