# Copia del PDF por Gmail (Google Apps Script)

Esta es la vía recomendada para que **cada “Cliente Sinaptia” te llegue a tu Gmail**
como PDF adjunto, sin contratar un proveedor de email ni verificar un dominio.

```
Sitio → POST /api/proyecto → Apps Script (tu cuenta Google) → Gmail con PDF adjunto
```

## 1 · Crear el script (5 minutos)

1. Entra en [script.google.com](https://script.google.com) con la cuenta de Gmail
   que quieres que reciba los clientes.
2. **Nuevo proyecto** → borra el contenido y pega `google-apps-script/Code.gs`.
3. **Configuración del proyecto → Propiedades del script**:
   - `TOKEN`: una cadena larga y aleatoria (la misma en Vercel).
   - `LEAD_EMAIL`: opcional. Si lo omites, se usa el correo de la cuenta que
     despliega el script. No hace falta escribirlo en el código.
   - `SHEET_ID`: opcional. Si quieres un registro en Google Sheets, crea una hoja,
     copia el id de la URL y añade la propiedad. La pestaña `Clientes` se crea sola.
4. **Implementar → Nueva implementación → Aplicación web**:
   - **Ejecutar como**: `Yo (tu correo)`.
   - **Quién tiene acceso**: `Cualquier persona`.
   - Autoriza los permisos de Gmail (y Sheets si usas `SHEET_ID`).
5. Copia la URL que termina en `/exec`.

## 2 · Configurar Vercel

En *Settings → Environment Variables*:

```env
GOOGLE_SCRIPT_URL=https://script.google.com/macros/s/AKfy.../exec
GOOGLE_SCRIPT_TOKEN=la-misma-cadena-que-pusiste-en-TOKEN
```

La primera vez, haz *Redeploy* para que la función tome las variables.

## 3 · Probar sin pasar por el sitio

```bash
curl -X POST "https://script.google.com/macros/s/AKfy.../exec" \
  -H "Content-Type: application/json" \
  -d '{
    "token":"la-misma-cadena",
    "asunto":"Cliente Sinaptia — Prueba",
    "nombreArchivo":"Cliente-Sinaptia-Prueba.pdf",
    "texto":"Prueba de entrega del brief.",
    "pdfBase64":""
  }'
```

Debe responder `{"ok":true,...}` y llegarte un correo con asunto
**Cliente Sinaptia — Prueba**.

## 4 · Qué hace por dentro

- Verifica el `TOKEN` (si está configurado) antes de enviar nada.
- Envía a `LEAD_EMAIL` o, si no existe, al correo de la cuenta que ejecuta el script.
- Adjunta el PDF con el nombre `Cliente-Sinaptia-<empresa>.pdf`.
- Asunto: `Cliente Sinaptia — <empresa> — <referencia>`.
- El cuerpo lleva la idea del cliente, los **requerimientos para contactarlo**,
  las preguntas para debatir, la propuesta y el siguiente paso.
- Si configuras `SHEET_ID`, añade una fila a la hoja `Clientes`.
- Si falla el email, `/api/proyecto` cae a Resend, webhook o Supabase; el lead
  no se pierde.

## 5 · Límites y seguridad

- Gmail tiene cuota diaria (≈100 correos/día en cuentas gratuitas). Para más
  volumen, usa Google Workspace o Resend.
- La URL `/exec` es pública: el `TOKEN` es lo que impide que un tercero te llene
  el correo. No lo publiques ni lo pongas en el cliente.
- El correo del dueño **no se escribe en el HTML ni en el bundle**: vive en
  Vercel (`LEAD_EMAIL`) o en las propiedades del script.
- Si cambias el código, crea una **nueva versión** de la implementación; el
  `/exec` se mantiene.
