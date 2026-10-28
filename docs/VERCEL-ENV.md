# Vercel · variables limpias para Groq + Gmail

## Qué conservar

| Variable | Para qué | Obligatoria |
|---|---|---|
| `GROQ_API_KEY` | cerebro del chat y la voz | **sí** |
| `GROQ_MODEL` | modelo (default `llama-3.3-70b-versatile`) | no |
| `GROQ_EXTRACT_MODEL` | resumen de la llamada a lead | no |
| `GOOGLE_SCRIPT_URL` | Apps Script que envía el PDF por Gmail | recomendada |
| `GOOGLE_SCRIPT_TOKEN` | token compartido con Apps Script | recomendada |
| `LEAD_EMAIL` | correo privado que recibe el brief | recomendada |
| `CRON_SECRET` | autentica `/api/voz/cron` | si usas cron |
| `PANEL_SECRET` | protege `/api/voz/panel` | si usas panel |
| `SUPABASE_URL` / `SUPABASE_SERVICE_KEY` | memoria de clientes y proyectos | opcional |

Build (públicas, sin secretos): `PUBLIC_IA_ENDPOINT`, `PUBLIC_IA_VOZ`,
`PUBLIC_PROYECTO_ENDPOINT`, `PUBLIC_PROYECTO_AUTO`, `PUBLIC_FUNDADOR`,
`PUBLIC_IDIOMA`.

## Qué borrar si solo usas Groq

Estas eran de la etapa xAI/OpenAI. El código las acepta como respaldo, pero no
las necesitas y solo confunden:

```
XAI_API_KEY
GROK_API_KEY
GROK_MODEL
XAI_MODEL
XAI_BASE_URL
GROK_EFFORT
CHAT_MODEL
EXTRACT_MODEL
OPENAI_KEY
OPENAI_MODEL
OPENAI_EXTRACT_MODEL
GROK_EXTRACT_MODEL
XAI_EXTRACT_MODEL
```

```bash
vercel env ls
vercel env rm XAI_API_KEY production
vercel env rm GROK_MODEL production
# repite con las que aparezcan; luego:
vercel --prod
```

## Cómo saber qué quedó

1. **En Vercel**: `vercel env ls`.
2. **En local**: `vercel env pull .env.local && npm run env:check`.
3. **En producción**:
   ```bash
   curl https://tu-dominio.com/api/ia
   ```
   Devuelve:
   ```json
   {
     "ok": true,
     "proveedor": "groq",
     "modelo": "llama-3.3-70b-versatile",
     "configurado": { "groq": true, "google_script": true, "email_privado": true },
     "obsoletas": [],
     "recomendadas": ["GROQ_API_KEY", "..."]
   }
   ```
   Nunca devuelve valores de claves.

## Reglas

- El correo del dueño **solo** vive en `LEAD_EMAIL` (o en las propiedades del
  script de Google). Nunca en `PUBLIC_*`, en el HTML, en el bundle ni en el PDF.
- El contacto público es WhatsApp: `+52 983 406 6176`.
- Si rotas `GROQ_API_KEY`, actualiza Vercel y redeploy. No hay clave en el cliente.
