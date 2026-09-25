# Despliegue — GitHub → Vercel o Firebase, y dominio propio
**Con recomendación incluida, y el porqué**

---

## 0 · Mi recomendación, directa

**Vercel para el sitio. Y el cerebro (`/api/ia`) viviendo en el mismo Vercel.**

Por qué Vercel y no Firebase para este proyecto:

| Criterio | Vercel | Firebase |
|---|---|---|
| Soporte de Astro | Oficial y sin configuración | Manual (compilar y subir `dist/`) |
| Funciones serverless gratis | Sí (`/api/ia` en el plan gratuito) | **No**: las Functions exigen plan Blaze (tarjeta y pago por uso) |
| Endpoint del cerebro | Mismo origen (`/api/ia`): sin CORS, secretos en el propio deploy | Tendría que vivir fuera (Cloudflare Worker) con CORS |
| Previews por rama | Sí: cada rama tiene su URL para probar cambios | Requiere canales de hosting |
| Dominio propio + SSL | Automático y gratis | Automático y gratis |
| Precio con tu tráfico esperado | $0 | $0 en hosting, pero Blaze activo para funciones |

**Cuándo elegiría Firebase en su lugar:** si ya vives en Google (Analytics, Auth, Firestore para la BD de leads) y quieres todo en un solo vendor con su SDK. En ese caso el sitio va a Firebase Hosting y el cerebro se queda en el Cloudflare Worker (`infra/worker-ia.js`), que ya está construido y es gratuito.

**Regla que no cambia:** las claves de LLM nunca tocan el cliente. En Vercel viven en *Settings → Environment Variables*; en Cloudflare, como *Workers Secrets*.

---

## 1 · Subir el repo a GitHub (desde tu máquina)

Yo no puedo pushear por ti (no tengo ni debo tener tus credenciales), pero el repo ya está
inicializado y con commit en este workspace. En tu máquina:

```bash
# 1. Crea el repo VACÍO en github.com (sin README, sin .gitignore: ya existen aquí)
#    nombre sugerido: sinaptia

# 2. En tu máquina, copia esta carpeta y:
cd sinaptia
git remote add origin https://github.com/TU_USUARIO/sinaptia.git
git push -u origin main
```

Si prefieres empezar de cero en tu máquina:

```bash
git init && git add -A && git commit -m "Sinaptia: sitio + agente de IA"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/sinaptia.git
git push -u origin main
```

El `.gitignore` ya excluye `node_modules/`, `dist/`, `.astro/` y logs. **Nunca subas claves**:
no hay ningún archivo con claves en el repo; viven como secretos del entorno.

---

## 2 · Vercel (recomendado)

1. En vercel.com → *Add New… → Project* → importa el repo `sinaptia`.
2. Vercel detecta Astro solo. Verifica: Build `npm run build`, Output `dist`.
   (`vercel.json` ya lo fija, incluido el header de seguridad y la función `api/ia.js`.)
3. *Settings → Environment Variables*: añade `GEMINI_API_KEY` (Gemini), `XAI_API_KEY` (Grok) u `OPENAI_KEY` y, si quieres
   restringir el origen, `ORIGEN_PERMITIDO=https://tu-dominio.com`.
4. *Deploy*. Tu URL temporal: `https://sinaptia.vercel.app`.
5. En `src/config.js` pon `ia.endpoint = '/api/ia'` (mismo origen, sin CORS) y haz commit.
6. Prueba el cerebro:
   ```bash
   curl -X POST https://sinaptia.vercel.app/api/ia \
     -H 'Content-Type: application/json' \
     -d '{"traducir":{"texto":"Hola, gracias por tu interés.","de":"es","a":"en"}}'
   ```

---

## 3 · Firebase (alternativa)

```bash
npm i -g firebase-tools && firebase login
firebase init hosting        # public dir: dist · single-page app: NO
npm run build
firebase deploy
```

El cerebro, en este camino, vive en el Cloudflare Worker:

```bash
npm i -g wrangler && wrangler login
wrangler secret put OPENAI_KEY --name sinaptia-ia
wrangler deploy infra/worker-ia.js --name sinaptia-ia
```

Y en `src/config.js`: `ia.endpoint = 'https://sinaptia-ia.TU_SUBDOMINIO.workers.dev'`.

---

## 4 · Dominio propio (cuando lo tengas definido)

1. Cómpralo donde quieras (Namecheap, Cloudflare Registrar, Porkbun). Un `.com` son ~USD 10–15/año.
2. En Vercel: *Project → Settings → Domains → Add* → escribe el dominio → Vercel te da los
   registros exactos (un `A` y un `CNAME`, o un `CNAME` plano si usas Nameservers de Vercel).
   El SSL se emite solo en minutos.
3. En Firebase: *Hosting → Add custom domain* y sigue la verificación por TXT.
4. **Después** de que el dominio responda, actualiza `src/config.js`:
   ```js
   urlPublica: 'https://tu-dominio.com/',
   marca: { agenda: 'https://cal.com/tu-usuario/descubrimiento', email: 'hola@tu-dominio.com', web: 'tu-dominio.com' },
   ```
   y haz commit: el canonical, el `og:url`, el `og:image` y el QR se regeneran apuntando a tu
   dominio en el siguiente deploy. Hasta que no lo configures, canonical y og:url se omiten a
   propósito (no pueden ser absolutos) y el QR usa un dominio de ejemplo.
5. Verifica tras el deploy:
   - `https://tu-dominio.com/` → saludo con ciudad y clima reales
   - `https://tu-dominio.com/?voz=1&lang=en` → llamada en inglés para tu prospecto de EE. UU.
   - `https://tu-dominio.com/interprete` → tu puente de idioma (excluido de robots)
   - `curl -I https://tu-dominio.com/` → deben verse `X-Content-Type-Options` y `Permissions-Policy`

---

## 5 · Checklist de publicación

- [ ] Repo en GitHub con el commit inicial
- [ ] Proyecto en Vercel (o Firebase) con deploy verde
- [ ] `GEMINI_API_KEY` (Gemini), `XAI_API_KEY` (Grok) u `OPENAI_KEY` como secreto del entorno
- [ ] `ia.endpoint` apuntando a `/api/ia` (Vercel) o al Worker (Firebase)
- [ ] Dominio propio conectado y SSL activo
- [ ] `urlPublica`, `marca.email`, `marca.agenda` configurados y commiteados
- [ ] `bd.url` o `bd.supabase` configurado para que los leads aterricen en tu base
- [ ] Prueba de extremo a extremo: QR → llamada en inglés → lead en tu BD → resumen en `/interprete`
- [ ] (Opcional, §6) Backend real: schema en Supabase + secretos en Vercel + `ia.voz = '/api/voz'`
- [ ] (Opcional, §6) Streaming en `/voz` verificado + lead resumido en Supabase + `/panel` remoto con tu `PANEL_SECRET`

Cuando las ocho casillas estén marcadas, el negocio está en línea de verdad: un prospecto en
cualquier idioma puede encontrarte, hablar con tu agente, ver su propio dinero en la
calculadora y dejar sus datos — mientras tú operas todo desde el español.

---

## 6 · Backend real (opcional): Gemini (Google) o Grok (xAI) + Supabase en Vercel

La fusión A+B le da a `/voz` un cerebro conversacional de verdad:

- **LLM en streaming**: la primera frase se habla antes de que el modelo termine de escribir.
  Proveedor por defecto **Gemini** (free tier de AI Studio); si el entorno solo trae
  `XAI_API_KEY`, habla Grok. El resto del backend no sabe ni le importa (ver `server/llm.js`).
- **Memoria de clientes en servidor** (Supabase + cookie httpOnly): el visitante vuelve y lo
  reconocen ("¡Hola de nuevo, José!") aunque haya pasado días, con coincidencia fuerte
  (teléfono/email/nombre+negocio) y débil (solo nombre → confirma sin revelar datos).
- **Conversación → lead estructurado** al colgar (`/api/voz/end`): intención, urgencia,
  frases textuales, objeciones, herramientas actuales y siguiente paso.
- **Cron de rescate** (diario 09:00 UTC): resume llamadas cortadas por batería o crash.
- **`/panel` con analítica real** de todas las conversaciones, no solo las del navegador.

El sitio **sigue siendo estático**: si no activas esto, nada cambia (el código remoto ni
siquiera entra en el bundle). Solo funciona en **Vercel** (GitHub Pages/Firebase sirven el
estático; las rutas `api/voz/*` necesitan servidor).

### Pasos

1. **Supabase** (plan Free alcanza): crea un proyecto → *SQL Editor* → pega
   `server/schema.sql` → *Run*. Crea las 4 tablas (`visitors`, `sessions`, `messages`,
   `leads`) con RLS activado y sin políticas: solo tu servidor las toca.

   > **Las tablas NO se crean solas.** Vincular Supabase desde Vercel (Storage →
   > Create Database / Marketplace) solo aprovisiona el proyecto e inyecta variables
   > de entorno; el esquema lo aplicas tú con ese copy-paste (30 s, es idempotente:
   > `create table if not exists`). Comprueba en *Table Editor* que aparecen las 4.
   > La integración de Vercel inyecta `SUPABASE_URL` + `SUPABASE_SECRET_KEY`
   > (nomenclatura nueva): el backend acepta ese nombre, así que no hace falta
   > duplicarla como `SUPABASE_SERVICE_KEY`. La clave **publishable/anon no sirve**:
   > no salta RLS y las tablas están cerradas a propósito.
2. **Google AI Studio**: crea una API key gratis en aistudio.google.com (Get API key).
   Verifica clave y modelo en 10 segundos (debe contestar algo en español):
   ```bash
   curl -s "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent" \
     -H "Content-Type: application/json" -H "x-goog-api-key: $GEMINI_API_KEY" \
     -d '{"contents":[{"parts":[{"text":"Di hola en español, 3 palabras."}]}],
          "generationConfig":{"maxOutputTokens":200,"thinkingConfig":{"thinkingBudget":0}}}'
   ```
   Si responde `API_KEY_INVALID` → clave mal copiada. Los `503 high demand` del free tier
   son temporales: el backend ya reintenta y degrada a no-stream solo (ver nota técnica).
   *(Alternativa Grok: key en console.x.ai con facturación activa; se activa poniendo
   `XAI_API_KEY` sin `GEMINI_API_KEY`, o `LLM_PROVIDER=grok`.)*
3. **Vercel** → tu proyecto → *Settings → Environment Variables* (referencia: `.env.ejemplo`):
   ```
   SUPABASE_URL=https://tu-proyecto.supabase.co
   SUPABASE_SERVICE_KEY=<service_role key>   ← SOLO servidor; jamás al cliente ni a git
   GEMINI_API_KEY=<key de AI Studio>
   CRON_SECRET=<cadena larga al azar>        ← autentica el cron diario de vercel.json
   PANEL_SECRET=<otra cadena al azar>        ← protege la analítica de /panel
   # opcionales: CHAT_MODEL / EXTRACT_MODEL (default gemini-2.5-flash)
   #             GEMINI_THINKING (default 0: latencia de voz) · LLM_PROVIDER (gemini|grok)
   #             con Grok: XAI_API_KEY · GROK_EFFORT (default low)
   ```
   *Si vinculaste Supabase desde Vercel, `SUPABASE_URL` y `SUPABASE_SECRET_KEY` ya
   están (ese nombre también vale). Tras tocar variables: **Redeploy** obligatorio.*

   **Modelo de Gemini.** Por defecto `gemini-2.5-flash` con `thinkingBudget: 0`
   (cero razonamiento = latencia de voz). Google retira la familia 2.5 el
   **2026-10-20**; el salto a 3.x ya está soportado y se hace solo con variables:
   ```
   CHAT_MODEL=gemini-3.5-flash     # o gemini-3.8-flash
   EXTRACT_MODEL=gemini-3.5-flash
   GEMINI_LEVEL=low                # minimal|low|medium|high (en 3.x sustituye a GEMINI_THINKING)
   ```
   En la familia 3.x la API no acepta `thinkingBudget`: `server/gemini.js` manda
   `thinkingLevel` automáticamente según el modelo que vea en `CHAT_MODEL`.

   **Diagnóstico rápido** — `POST /api/voz/session` con `{"consent":true,"lang":"es"}`:
   | Respuesta | Significa |
   |---|---|
   | `200 {sessionId,…}` | Todo conectado: tablas, clave y cerebro funcionando |
   | `503 backend sin configurar` | Faltan `SUPABASE_URL` o la clave secret/service_role en Vercel |
   | `500 db` | Las variables están pero la BD falla: **correr `schema.sql`** (404) o clave equivocada/anon (401/403). El motivo exacto queda en Vercel → *Logs* como `[supabase] … → <status>` |
   | `400 bad` | La función está viva; solo faltó el cuerpo de prueba |
4. **`src/config.js`**: `ia: { voz: '/api/voz' }` → commit → deploy.
5. **Verifica**:
   - `/voz` → primer toque pide **consentimiento** → aceptar → saludo del servidor.
   - Habla → la respuesta **empieza a sonar antes de terminar** (streaming).
   - Termina la llamada → en Supabase aparece el `lead` con resumen y frases textuales.
   - Mismo navegador, más tarde → "¡Hola de nuevo, …" (recall por cookie).
   - `/panel` → *Conectar con el servidor* → ingresa tu `PANEL_SECRET` → totales reales.
   - `curl -H "Authorization: Bearer $CRON_SECRET" https://tu-dominio.com/api/voz/cron` → `ok 0/0`.
6. **Costos**: Supabase Free para empezar; Gemini con el **free tier** de AI Studio
   (límites por minuto/día según el modelo; suficiente para las primeras conversaciones).
   `GEMINI_THINKING=0` mantiene la latencia de voz y no gasta tokens en razonamiento.
   Si un día quieres facturar, la capa de pago de Gemini o Grok (`XAI_API_KEY`) se activa
   solo cambiando el entorno. Hay techo de 60 mensajes/hora/visitante contra abuso.

> **Nota técnica**: usamos `POST …/v1beta/models/<modelo>:generateContent` de Google
> (cero SDK) y `:streamGenerateContent?alt=sse` para la voz. Tres defensas del free tier:
> reintento ante 429/500/503, caída a no-stream si el streaming sigue cerrado (la frase
> llega completa, la conversación no se cae) y `thinkingBudget: 0` para que el modelo
> pensante no se gaste los tokens de salida "pensando". La `thoughtSignature` de los
> functionCall se devuelve intacta en el bucle de tools (Gemini 3 la exige).
> El razonamiento nunca se habla ni se guarda. Cambiar de proveedor toca solo el entorno:
> `server/llm.js` elige entre `gemini.js` y `grok.js` (mismo contrato).

### Si el backend se cae o no lo activas

Con `ia.voz` vacío, todo funciona 100% local como siempre. Con `ia.voz` configurado pero el
backend caído, `/voz` avisa una vez y **degrada al motor local sin cortar la llamada**:
degrada, no se rompe. Las conversaciones en modo local no viajan a Supabase (no hay
consentimiento de por medio): el recall vuelve a ser por `localStorage`.

### Reglas de negocio del agente (guiones aprobados)

Todo lo que el agente puede afirmar vive en el system prompt de `server/agente.js`
(base de conocimiento aprobada por el negocio, 2026-09):

- **Servicios cerrados**: apps Android, apps/sitios web, agentes de voz, software a
  medida, SaaS, herramientas. Fuera de eso: "se evalúa caso por caso en la consultoría".
- **Precio único aprobado**: consultoría **$2,500 MXN**, descontable del proyecto si
  avanza; si no avanza, queda como pago de la consultoría. Demo/MVP se cotiza aparte
  considerando lo ya pagado. El agente jamás da otro número ni inventa el costo final.
- **Tiempos aprobados**: consultoría 3 días, MVP ~7 días (varía). Nada más.
- **Cero consultoría gratis**: el agente da el "qué" y el "para qué", nunca el "cómo"
  (arquitectura, herramientas exactas, paso a paso → se ven en la consultoría).
- **Límite duro de llamada**: a los ~15 min sin intención de pago, señal de alerta;
  a los **20 min** (`MAX_MINUTOS_LLAMADA`) el backend inyecta `avisoLimite()` en el
  turno: el agente concreta el pago, redirige firme o se despide. Nunca se alarga.
- **Descuento**: solo cuando el cliente objeta el dinero explícitamente ("está caro",
  "¿hay descuento?"). El agente solo abre la puerta ("puedo comentarle tu caso a
  Gabi"); nunca calcula ni menciona números de descuento. Decisión: la humana.
- **Privacidad**: nunca revela qué hace, cómo trabaja o quién es otro cliente.

Para editar nombre de la humana, precio, tiempos o guiones: `HUMANO` en
`server/langs.js` y el prompt en `server/agente.js`. Los tests de `backend.test.js`
(sección 4) verifican que el prompt mantenga estas reglas: si cambias el guion,
actualiza el test.

---

## 7 · Si la web abre con 404 (diagnóstico en 60 segundos)

El sitio **sí tiene página de inicio**: `src/pages/index.astro` → `dist/index.html`. Si Vercel
devuelve 404 en `/`, el problema nunca es Astro: es que **lo que está publicado no es este repo**.
Comprueba en este orden:

1. **¿GitHub tiene el repo correcto?** Abre `github.com/TU_USUARIO/sinaptia` y mira la lista de
   archivos de la raíz. Debes ver `package.json`, `astro.config.mjs`, `vercel.json`, `src/`,
   `api/`, `server/`.
   - Si ves otra cosa (p. ej. solo `api/`, `server/`, `vercel.json` — el contenido de un backend
     suelto), ese es el 404: Vercel compila eso y no hay portada que servir.
   - Arreglo: clona el bundle y fuerza el push correcto:
     ```bash
     git clone /ruta/a/sinaptia.bundle sinaptia && cd sinaptia
     bash scripts/push-github.sh https://github.com/TU_USUARIO/sinaptia.git
     ```
2. **¿Root Directory vacío?** Vercel → *Settings → General → Root Directory* debe estar **en blanco**
   (no `implementacion-b`, no `backend`, no `api`). Si apunta a una subcarpeta, Vercel busca ahí el
   `package.json` y publica lo que encuentra en esa carpeta.
3. **¿Qué dice el build?** Vercel → *Deployments → el último → Build Logs*. Debe aparecer
   `Framework: Astro`, `Build Command: npm run build`, `Output Directory: dist` y al final
   `Build Completed`. Si ves `No framework detected` o un build de Node puro, vuelve al punto 1.
4. **¿`dist` se generó?** En *Deployment → Source* o *Output*, debe existir `dist/index.html`.
5. **¿Caché del navegador?** Prueba en ventana privada o añade `/index.html` a la URL.

Regla práctica: `git ls-tree --name-only HEAD` en tu clon debe listar `src` y `package.json`.
Si no los lista, GitHub tiene el commit equivocado y Vercel heredó el 404.

**Error ya vivido (2026-09-24):** el build terminaba `Complete!` y luego moría con
`ERR_MODULE_NOT_FOUND`. Causa: `scripts/postbuild.mjs` importa `esbuild`, que en local existía
como dependencia transitiva de Astro pero **no estaba declarada** en `package.json`, así que el
`npm ci` de Vercel no lo instalaba. Arreglo aplicado: `esbuild` es dependencia directa
(commit `2393f10`) y el postbuild degrada sin romper si falta. Ojo: **no** añadir `nodeVersion`
a `vercel.json` — Vercel rechaza esa clave y falla el deploy antes de compilar (`761a2b0`).
