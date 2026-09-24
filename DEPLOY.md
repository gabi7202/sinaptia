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
3. *Settings → Environment Variables*: añade `OPENAI_KEY` (o `ANTHROPIC_KEY`) y, si quieres
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
- [ ] `OPENAI_KEY` (o `ANTHROPIC_KEY`) como secreto del entorno
- [ ] `ia.endpoint` apuntando a `/api/ia` (Vercel) o al Worker (Firebase)
- [ ] Dominio propio conectado y SSL activo
- [ ] `urlPublica`, `marca.email`, `marca.agenda` configurados y commiteados
- [ ] `bd.url` o `bd.supabase` configurado para que los leads aterricen en tu base
- [ ] Prueba de extremo a extremo: QR → llamada en inglés → lead en tu BD → resumen en `/interprete`

Cuando las ocho casillas estén marcadas, el negocio está en línea de verdad: un prospecto en
cualquier idioma puede encontrarte, hablar con tu agente, ver su propio dinero en la
calculadora y dejar sus datos — mientras tú operas todo desde el español.
