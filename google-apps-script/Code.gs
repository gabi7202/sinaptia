/**
 * Sinaptia · Cliente Sinaptia
 * Google Apps Script que recibe el brief desde /api/proyecto y lo envía por Gmail
 * al correo del dueño de la cuenta. No hay correo hardcodeado: el destinatario
 * es la cuenta que despliega el script (Session.getEffectiveUser) o la propiedad
 * LEAD_EMAIL si la defines.
 *
 * Despliegue:
 *   1. script.google.com → Nuevo proyecto → pega este archivo.
 *   2. Configuración del proyecto → Propiedades del script:
 *        TOKEN        = una cadena larga (la misma en Vercel GOOGLE_SCRIPT_TOKEN)
 *        LEAD_EMAIL   = opcional; si falta, se usa el correo de la cuenta
 *        SHEET_ID     = opcional; id de una hoja para registrar clientes
 *   3. Implementar → Nueva implementación → Aplicación web
 *        Ejecutar como: yo
 *        Quién tiene acceso: cualquier persona
 *   4. Copia la URL /exec en Vercel: GOOGLE_SCRIPT_URL
 */

function doGet() {
  // No expone el correo del dueño: la URL puede ser conocida.
  return json({ ok: true, servicio: 'sinaptia-cliente' });
}

function doPost(e) {
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var props = PropertiesService.getScriptProperties();
    var token = props.getProperty('TOKEN') || '';
    if (token && String(body.token || '') !== token) {
      return json({ ok: false, error: 'token' });
    }

    var to = destinatario();
    if (!to) return json({ ok: false, error: 'sin_destino' });

    var asunto = body.asunto || 'Cliente Sinaptia';
    var nombreArchivo = body.nombreArchivo || 'Cliente-Sinaptia.pdf';
    var opciones = {
      to: to,
      subject: asunto,
      htmlBody: body.html || textoAParrafos(body.texto || ''),
      body: body.texto || '',
      name: 'Sinaptia · Cliente',
    };

    if (body.pdfBase64) {
      opciones.attachments = [Utilities.newBlob(
        Utilities.base64Decode(body.pdfBase64),
        'application/pdf',
        nombreArchivo
      )];
    }

    MailApp.sendEmail(opciones);
    registrar(body, asunto, to);

    return json({ ok: true, id: (body.proyecto && body.proyecto.id) || 'ok' });
  } catch (err) {
    return json({ ok: false, error: String(err).slice(0, 240) });
  }
}

function destinatario() {
  var props = PropertiesService.getScriptProperties();
  return props.getProperty('LEAD_EMAIL') || Session.getEffectiveUser().getEmail();
}

/** Registro opcional en Google Sheets: una fila por Cliente Sinaptia. */
function registrar(body, asunto, to) {
  var id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (!id) return;
  try {
    var hoja = SpreadsheetApp.openById(id).getSheetByName('Clientes') || SpreadsheetApp.openById(id).insertSheet('Clientes');
    var p = body.proyecto || {};
    var c = p.contacto || {};
    hoja.appendRow([
      new Date(), asunto, to,
      c.nombre || '', c.empresa || '', c.email || '', c.telefono || '',
      c.sector || '', c.volumen || '', p.id || '',
      (p.diagnostico && p.diagnostico.dolor) || '',
      (p.propuesta && p.propuesta.titulo) || '',
      (p.propuesta && p.propuesta.inversion) || '',
      body.nombreArchivo || '',
    ]);
  } catch (err) {
    // El email ya salió: un fallo de la hoja no debe romper la entrega.
    console.error('sheet', err);
  }
}

function textoAParrafos(t) {
  var seguro = String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return '<pre style="font-family:Inter,Arial,sans-serif;white-space:pre-wrap;font-size:14px;color:#0E1B2A">' + seguro + '</pre>';
}

function json(o) {
  return ContentService.createTextOutput(JSON.stringify(o))
    .setMimeType(ContentService.MimeType.JSON);
}
