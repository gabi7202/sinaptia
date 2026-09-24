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
3. *Settings → Environment Variables*: añade `XAI_API_KEY` (Grok) u `OPENAI_KEY` y, si quieres
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
- [ ] `XAI_API_KEY` (Grok) u `OPENAI_KEY` como secreto del entorno
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

## 6 · Backend real (opcional): Grok (xAI) + Supabase en Vercel

La fusión A+B le da a `/voz` un cerebro conversacional de verdad:

- **Grok en streaming**: la primera frase se habla antes de que el modelo termine de escribir.
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
2. **xAI**: crea una API key en console.x.ai (con créditos/facturación activa).
   Verifica clave y modelo en 10 segundos (debe contestar algo en español):
   ```bash
   curl -s https://api.x.ai/v1/chat/completions \
     -H "Content-Type: application/json" -H "Authorization: Bearer $XAI_API_KEY" \
     -d '{"model":"grok-4.7","max_completion_tokens":40,"reasoning_effort":"low",
          "messages":[{"role":"user","content":"Di hola en español, 3 palabras."}]}'
   ```
   Si responde `401` → clave mal copiada. Si responde `model not found` → tu cuenta no tiene
   `grok-4.7`: usa el modelo que sí aparezca en console.x.ai y fíjalo con `CHAT_MODEL`.
3. **Vercel** → tu proyecto → *Settings → Environment Variables* (referencia: `.env.ejemplo`):
   ```
   SUPABASE_URL=https://tu-proyecto.supabase.co
   SUPABASE_SERVICE_KEY=<service_role key>   ← SOLO servidor; jamás al cliente ni a git
   XAI_API_KEY=xai-...
   CRON_SECRET=<cadena larga al azar>        ← autentica el cron diario de vercel.json
   PANEL_SECRET=<otra cadena al azar>        ← protege la analítica de /panel
   # opcionales: CHAT_MODEL (default grok-4.7) · EXTRACT_MODEL (default grok-4.7)
   #             GROK_EFFORT (default low: latencia de voz; medium/high para resumir mejor)
   ```
4. **`src/config.js`**: `ia: { voz: '/api/voz' }` → commit → deploy.
5. **Verifica**:
   - `/voz` → primer toque pide **consentimiento** → aceptar → saludo del servidor.
   - Habla → la respuesta **empieza a sonar antes de terminar** (streaming).
   - Termina la llamada → en Supabase aparece el `lead` con resumen y frases textuales.
   - Mismo navegador, más tarde → "¡Hola de nuevo, …" (recall por cookie).
   - `/panel` → *Conectar con el servidor* → ingresa tu `PANEL_SECRET` → totales reales.
   - `curl -H "Authorization: Bearer $CRON_SECRET" https://tu-dominio.com/api/voz/cron` → `ok 0/0`.
6. **Costos**: Supabase Free para empezar; Grok se paga por token (grok-4.7: ~$2 entrada /
   ~$6 salida por millón, y el razonamiento se factura aparte). `GROK_EFFORT=low` mantiene la
   latencia de voz y el gasto bajo; `EXTRACT_MODEL` puede apuntar a un modelo más barato para
   los resúmenes. Hay techo de 60 mensajes/hora/visitante contra abuso.

> **Nota técnica**: usamos `POST https://api.x.ai/v1/chat/completions` (compatible con OpenAI,
> cero SDK). xAI lo marca como endpoint *legacy*: sigue funcionando igual, y si algún día lo
> retiran la migración a `/v1/responses` toca solo `server/grok.js` (nadie más habla con xAI).
> El `reasoning_content` que devuelve Grok se descarta: nunca se habla ni se guarda.

### Si el backend se cae o no lo activas

Con `ia.voz` vacío, todo funciona 100% local como siempre. Con `ia.voz` configurado pero el
backend caído, `/voz` avisa una vez y **degrada al motor local sin cortar la llamada**:
degrada, no se rompe. Las conversaciones en modo local no viajan a Supabase (no hay
consentimiento de por medio): el recall vuelve a ser por `localStorage`.
