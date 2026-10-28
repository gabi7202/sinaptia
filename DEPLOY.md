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
3. *Settings → Environment Variables*: añade **`GROQ_API_KEY`** (recomendado, console.groq.com)
   o `XAI_API_KEY` / `OPENAI_KEY` como respaldo, y si quieres restringir el origen,
   `ORIGEN_PERMITIDO=https://tu-dominio.com`.
4. *Deploy*. Tu URL temporal: `https://sinaptia.vercel.app`.
5. `ia.endpoint` ya es `/api/ia` por defecto: no hay que editar código. Para streaming en `/voz`,
   añade `PUBLIC_IA_VOZ=/api/voz` (y Supabase, §6).
6. Prueba el cerebro (salud + un turno):
   ```bash
   curl https://sinaptia.vercel.app/api/ia
   curl -X POST https://sinaptia.vercel.app/api/ia \
     -H 'Content-Type: application/json' \
     -d '{"mensaje":"Sell auto parts, we quote by hand","idioma":"en","canal":"chat"}'
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
wrangler secret put GROQ_API_KEY --name sinaptia-ia
# respaldo: wrangler secret put OPENAI_KEY --name sinaptia-ia
wrangler deploy infra/worker-ia.js --name sinaptia-ia
```

Y en `src/config.js` (o en el build): `ia.endpoint = 'https://sinaptia-ia.TU_SUBDOMINIO.workers.dev'`.

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
- [ ] `GROQ_API_KEY` como secreto del entorno (xAI/OpenAI son respaldos opcionales)
- [ ] `ia.endpoint` apuntando a `/api/ia` (Vercel) o al Worker (Firebase)
- [ ] Dominio propio conectado y SSL activo
- [ ] `urlPublica`, `marca.whatsapp`, `marca.persona`, `marca.agenda` configurados y commiteados
- [ ] **Correo privado**: `LEAD_EMAIL` en Vercel (nunca en el cliente) + `GOOGLE_SCRIPT_URL` y
      `GOOGLE_SCRIPT_TOKEN` siguiendo `google-apps-script/README.md`
- [ ] `bd.url` o `bd.supabase` configurado para que los leads aterricen en tu base
- [ ] **Copia del brief**: `GOOGLE_SCRIPT_URL` + `GOOGLE_SCRIPT_TOKEN` (Gmail) o
      `RESEND_API_KEY` + `RESEND_FROM` + `LEAD_EMAIL`, o `PROYECTO_WEBHOOK`,
      o Supabase con `server/schema.sql`. Sin esto el sitio ofrece Web Share/WhatsApp.
- [ ] Prueba de extremo a extremo: `/en` → chat en inglés → PDF → copia recibida en tu email
- [ ] Prueba de memoria: recarga a mitad de la conversación y comprueba que retoma
- [ ] (Opcional, §6) Backend real: schema en Supabase + secretos en Vercel + `PUBLIC_IA_VOZ=/api/voz`
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
2. **Groq** (recomendado): crea una API key en console.groq.com. Verifica clave y modelo:
   ```bash
   curl -s https://api.groq.com/openai/v1/chat/completions \
     -H "Content-Type: application/json" -H "Authorization: Bearer $GROQ_API_KEY" \
     -d '{"model":"llama-3.3-70b-versatile","max_tokens":40,
          "messages":[{"role":"user","content":"Say hi in English, three words."}]}'
   ```
   Si responde `401` → clave mal copiada. Si responde `model not found` → fija el modelo que
   aparezca en tu consola con `GROQ_MODEL`.
   *(Alternativa: xAI/Grok con `XAI_API_KEY`, u OpenAI con `OPENAI_KEY`; el cliente elige el
   proveedor por prioridad y no hay que cambiar código. Si solo usas Groq, bórralas:
   `npm run env:check` las lista o `curl https://tu-dominio.com/api/ia`.)*
3. **Vercel** → tu proyecto → *Settings → Environment Variables* (referencia: `.env.ejemplo`):
   ```
   GROQ_API_KEY=gsk_...
   GOOGLE_SCRIPT_URL=https://script.google.com/macros/s/AKfy.../exec
   GOOGLE_SCRIPT_TOKEN=<misma cadena que TOKEN del script>
   LEAD_EMAIL=<correo privado del dueño>      ← solo servidor; nunca en el cliente
   CRON_SECRET=<cadena larga al azar>         ← autentica el cron diario de vercel.json
   PANEL_SECRET=<otra cadena al azar>         ← protege la analítica de /panel
   # Supabase (opcional) para memoria de clientes/proyectos
   # respaldo de email: RESEND_API_KEY + RESEND_FROM
   # o PROYECTO_WEBHOOK
   # opcionales: GROQ_MODEL · GROQ_EXTRACT_MODEL · PUBLIC_FUNDADOR
   ```
4. **Build**: `PUBLIC_IA_VOZ=/api/voz` para streaming + memoria de servidor en `/voz`.
   Sin esa variable, `/voz` usa `/api/ia` y la memoria del navegador.
5. **Verifica**:
   - `curl https://tu-dominio.com/api/ia` → `proveedor: "groq"`, `obsoletas: []`, `configurado.google_script: true`.
   - `/en` → landing inglesa, chat y WhatsApp.
   - Genera un brief → descarga `Cliente-Sinaptia-<empresa>.pdf` y llega el correo
     **Cliente Sinaptia — …** con el PDF adjunto (Google Apps Script).
   - `/voz` → primer toque pide **consentimiento** → aceptar → saludo del servidor.
   - Habla → la respuesta **empieza a sonar antes de terminar** (streaming).
   - Termina la llamada → en Supabase aparece el `lead` con resumen y frases textuales.
   - Mismo navegador, más tarde → "¡Hola de nuevo, …" (recall por cookie).
   - `/panel` → *Conectar con el servidor* → ingresa tu `PANEL_SECRET` → totales reales.
   - `curl -H "Authorization: Bearer $CRON_SECRET" https://tu-dominio.com/api/voz/cron` → `ok 0/0`.
6. **Costos**: Supabase Free para empezar; Groq tiene capa gratuita y luego pago por token.
   Hay techo de 60 mensajes/hora/visitante contra abuso. La memoria del navegador no cuesta nada.

> **Nota técnica**: Groq y xAI son OpenAI-compatibles (`/chat/completions`, SSE, tools), sin SDK.
> El proveedor se elige en `server/llm.js` por prioridad de claves. El `reasoning_content` de
> xAI se descarta: nunca se habla ni se guarda.

### Si el backend se cae o no lo activas

Con `ia.voz` vacío, todo funciona 100% local como siempre. Con `ia.voz` configurado pero el
backend caído, `/voz` avisa una vez y **degrada al motor local sin cortar la llamada**:
degrada, no se rompe. Las conversaciones en modo local no viajan a Supabase (no hay
consentimiento de por medio): el recall vuelve a ser por `localStorage`.

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
