// Servicio de notificaciones por correo electrónico

import nodemailer from 'nodemailer';

let transportador = null;
const escaparHtml = valor => String(valor).replace(/[&<>"']/g, caracter => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[caracter]));

function obtenerTransportador() {
  if (transportador) return transportador;

  if (process.env.SMTP_HOST && process.env.SMTP_USER) {
    transportador = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
  }
  return transportador;
}

export async function enviarNotificacionReserva(reserva, accion = 'creada') {
  const esEdicion = accion === 'actualizada';
  const remitente = process.env.SMTP_FROM || 'Salas Apracom <notificaciones@apracom.local>';
  const destinatario = reserva.correo_responsable;

  if (!destinatario) {
    console.warn(`[NOTIFICACIÓN] No se encontró correo destinatario para la reserva #${reserva.id}`);
    return;
  }

  const formatoFecha = new Intl.DateTimeFormat('es-EC', {
    timeZone: 'America/Guayaquil',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  const formatoHora = new Intl.DateTimeFormat('es-EC', {
    timeZone: 'America/Guayaquil',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });

  const fechaTexto = formatoFecha.format(new Date(reserva.inicio));
  const horaInicio = formatoHora.format(new Date(reserva.inicio));
  const horaFin = formatoHora.format(new Date(reserva.fin));
  const salaNombre = reserva.nombre_sala || `Sala #${reserva.sala_id}`;
  const organizador = reserva.responsable || 'Colaborador';

  const asunto = esEdicion
    ? `[Apracom] Modificación de reunión: ${reserva.asunto}`
    : `[Apracom] Confirmación de reunión: ${reserva.asunto}`;

  const cuerpoTexto = `
Apracom — Notificación de Salas de Reunión
${esEdicion ? 'Tu reunión ha sido actualizada:' : 'Tu reunión ha sido agendada con éxito:'}

Asunto: ${reserva.asunto}
Sala: ${salaNombre}
Fecha: ${fechaTexto}
Horario: ${horaInicio} a ${horaFin} (Hora de Ecuador UTC−5)
Asistentes: ${reserva.asistentes}
Responsable: ${organizador}
${reserva.notas ? `Notas: ${reserva.notas}\n` : ''}

Puedes consultar o modificar tu reserva ingresando al sistema: ${process.env.APP_ORIGIN || 'http://localhost:3000'}
`.trim();

  const cuerpoHtml = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #0f172a; }
    .card { max-width: 560px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(15, 23, 42, 0.05); }
    .cabecera { background: #0078ad; padding: 24px 28px; text-align: left; }
    .cabecera h1 { margin: 0; color: #ffffff; font-size: 18px; font-weight: 700; letter-spacing: -0.01em; }
    .content { padding: 28px; }
    .lead { font-size: 15px; font-weight: 600; color: #0f172a; margin-top: 0; margin-bottom: 20px; }
    .details { width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 13.5px; }
    .details th { text-align: left; color: #64748b; font-weight: 500; padding: 8px 12px 8px 0; width: 110px; border-bottom: 1px solid #f1f5f9; }
    .details td { color: #0f172a; font-weight: 600; padding: 8px 0; border-bottom: 1px solid #f1f5f9; }
    .badge-time { display: inline-block; background: #e0f2fe; color: #0369a1; padding: 3px 8px; border-radius: 4px; font-size: 12.5px; font-weight: 700; }
    .notas-box { background: #f8fafc; border-left: 3px solid #0078ad; padding: 12px 14px; border-radius: 4px; font-size: 13px; color: #334155; margin-bottom: 24px; }
    .footer { padding: 18px 28px; background: #f8fafc; border-top: 1px solid #e2e8f0; font-size: 11.5px; color: #94a3b8; text-align: center; }
  </style>
</head>
<body>
  <div class="card">
    <div class="cabecera">
      <h1>Salas Apracom</h1>
    </div>
    <div class="content">
      <p class="lead">${esEdicion ? 'Se han actualizado los detalles de tu reunión:' : 'Tu reserva ha sido confirmada:'}</p>
      <table class="details">
        <tr><th>Asunto</th><td>${escaparHtml(reserva.asunto)}</td></tr>
        <tr><th>Sala</th><td>${escaparHtml(salaNombre)}</td></tr>
        <tr><th>Fecha</th><td>${fechaTexto}</td></tr>
        <tr><th>Horario</th><td><span class="badge-time">${horaInicio} – ${horaFin}</span> (UTC−5)</td></tr>
        <tr><th>Asistentes</th><td>${reserva.asistentes} personas</td></tr>
        <tr><th>Responsable</th><td>${escaparHtml(organizador)}</td></tr>
      </table>
      ${reserva.notas ? `<div class="notas-box"><strong>Notas:</strong><br>${escaparHtml(reserva.notas)}</div>` : ''}
    </div>
    <div class="footer">
      Este es un correo automático generado por el sistema de reservas de Apracom.
    </div>
  </div>
</body>
</html>
`.trim();

  const transportadorCorreo = obtenerTransportador();

  if (transportadorCorreo) {
    await transportadorCorreo.sendMail({
      from: remitente,
      to: destinatario,
      subject: asunto,
      text: cuerpoTexto,
      html: cuerpoHtml
    });
    console.log(`[CORREO SMTP ENVIADO] A: ${destinatario} | Asunto: ${asunto}`);
  } else {
    // Si no hay servidor SMTP configurado, registrar con formato en consola
    console.log(`\n======================================================`);
    console.log(`[NOTIFICACIÓN POR CORREO - MODO LOCAL]`);
    console.log(`Para: ${destinatario}`);
    console.log(`Asunto: ${asunto}`);
    console.log(`Sala: ${salaNombre} | Fecha: ${fechaTexto} | ${horaInicio} a ${horaFin}`);
    console.log(`======================================================\n`);
  }
}
