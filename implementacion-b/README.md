# Implementación B — backend de agente de voz con LLM real (Claude + Supabase)

> **⚡ Actualización (24-sep-2026): esta implementación ya fue FUSIONADA en
> `/home/user/sinaptia`** — backend portado a `api/voz/*` + `server/` (sin los SDK, con
> fetch plano a PostgREST y SSE de Anthropic), incluida la ruta `/end` que faltaba, el
> `schema.sql`, streaming en el cliente de voz, `/panel` con analítica real y 128 tests
> nuevos (349 en verde). Esta carpeta queda como **respaldo arqueológico** de los
> originales subidos; no hace falta tocarla. Detalles: posdata de `/home/user/COMPARACION.md`
> y `sinaptia/DEPLOY.md §6`.

Carpeta aparte para **no mezclar** con la implementación A (`/home/user/sinaptia`).
Contiene los 9 archivos subidos por el usuario el 24-sep, reconstruidos a su
estructura original (deducida de los propios imports: `../../../lib/...`).

## Qué es

Solo el **cerebro backend** de un asistente de voz/chat: rutas API de Astro 5
sobre Vercel (serverless), con Claude (Anthropic SDK) conversando en streaming,
memoria de clientes en Supabase y resumen automático de cada conversación.
**No trae frontend**: no hay sitio, ni página de voz, ni UI (solo sus textos).

## Mapa de archivos

| Archivo subido   | Ruta real reconstruida          | Función |
|------------------|---------------------------------|---------|
| `session.txt`    | `src/pages/api/voz/session.ts`  | Abre sesión: cookie `vid` (httpOnly, UUID, 1 año), consentimiento, idioma, saludo; si el visitante ya es un lead conocido, saluda por su nombre ("¡Hola de nuevo, José!") |
| `chat.txt`       | `src/pages/api/voz/chat.ts`     | Turno de conversación: valida origen/cookie/sesión, límite 60 msgs/hora/visitante, guarda mensajes, **streaming** de Claude con bucle de herramientas (≤4 rondas), normaliza historial (empieza en `user`, roles alternos) |
| `cron.txt`       | `src/pages/api/voz/cron.ts`     | Red de seguridad (Vercel cron 09:00 UTC, secreto `CRON_SECRET`): resume sesiones abandonadas (crash/batería) con >20 min sin actividad |
| `agent.txt`      | `src/lib/agent.ts`              | System prompt por idioma con memoria del cliente inyectada; herramienta `buscar_cliente`: coincidencia **fuerte** (teléfono / email / nombre+negocio → confirma y vincula lead) y **débil** (solo nombre → `posible_coincidencia` sin revelar datos); defensa anti prompt-injection |
| `summarize.txt`  | `src/lib/summarize.ts`          | Al cerrar sesión: Claude Haiku extrae JSON estructurado (nombre, negocio, giro, teléfono, email, necesidad, resumen, intención, urgencia, **frases textuales**, objeciones, herramientas actuales, siguiente paso) y crea/actualiza el lead con campos normalizados |
| `server.txt`     | `src/lib/server.ts`             | Cliente Supabase (SERVICE_KEY, solo servidor), `isUUID`, `sameOrigin`, normalizadores `norm`/`digits`, helper `json` |
| `langs.txt`      | `src/lib/langs.ts`              | i18n ES/EN/PT: saludos, recall, textos de UI de voz (idle/listening/thinking/speaking, manos libres, errores, aviso in-app, sin micro) y locales de voz (`es-MX`, `en-US`, `pt-BR`) |
| `astro.config.mjs` | `astro.config.mjs`            | Astro 5 + adapter Vercel (páginas estáticas; solo `prerender = false` va al servidor) |
| `vercel.json`    | `vercel.json`                   | Cron diario `0 9 * * *` → `/api/voz/cron` |

Los `.txt` originales quedan intactos en `originales-txt/` como respaldo.

## Lo que le falta a B (no vino en la subida o no existe)

- **Frontend completo**: página de voz (orbe, micrófono, TTS, barge-in), sitio, panel.
- **Ruta `/api/voz/end`**: el comentario del cron la da por hecha ("sesiones que nunca
  mandaron el end") pero el archivo no está.
- **`schema.sql` / migraciones de Supabase** (tablas deducidas más abajo).
- `package.json`, variables de entorno documentadas, tests, README propio.
- `BRAND = 'Tu Empresa'` es un placeholder sin configurar.

### Esquema Supabase deducido del código

- `visitors`: `id uuid pk`, `lead_id → leads`, `last_seen timestamptz`
- `sessions`: `id uuid pk`, `visitor_id`, `lang`, `consent_at`, `consent_version`,
  `user_agent(≤300)`, `needs_summary bool`, `last_msg_at`, `analisis jsonb`, `summarized_at`
- `messages`: `id pk`, `session_id`, `visitor_id`, `role ('user'|'assistant')`, `content`, `lang`, `created_at`
- `leads`: `id pk`, `nombre`, `negocio`, `giro`, `telefono`, `email`, `necesidad`,
  `resumen`, `nombre_norm`, `negocio_norm`, `telefono_norm` (últimos 10 dígitos), `updated_at`

### Para correr necesita

`astro@5` + `@astrojs/vercel`, `@supabase/supabase-js`, `@anthropic-ai/sdk`, y env:
`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `ANTHROPIC_API_KEY`, `CRON_SECRET`,
opcionales `CHAT_MODEL` (default `claude-sonnet-5`), `EXTRACT_MODEL` (default `claude-haiku-4-5-20251001`).

---
Comparación completa contra la implementación A: ver `/home/user/COMPARACION.md`.
