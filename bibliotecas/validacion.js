// Validación de parámetros, horarios laborales y fechas ISO

export class ErrorHttp extends Error {
  constructor(codigoEstado, mensaje) {
    super(mensaje);
    this.status = codigoEstado;
  }
}

export function validarTexto(valor, etiqueta, maximo, requerido = true) {
  if (typeof valor !== 'string' || valor.length > maximo || (requerido && !valor.trim())) {
    throw new ErrorHttp(400, `${etiqueta}: revisa el contenido (máximo ${maximo} caracteres).`);
  }
  return valor.trim();
}

export function validarEntero(valor, etiqueta, maximo = 2147483647) {
  if ((typeof valor !== 'number' && typeof valor !== 'string') || (typeof valor === 'string' && !/^\d+$/.test(valor))) {
    throw new ErrorHttp(400, `${etiqueta} no válido.`);
  }
  const numero = Number(valor);
  if (!Number.isInteger(numero) || numero < 1 || numero > maximo) {
    throw new ErrorHttp(400, `${etiqueta} no válido.`);
  }
  return numero;
}

export function validarFechas(inicio, fin, futura = false) {
  if (typeof inicio !== 'string' || typeof fin !== 'string') throw new ErrorHttp(400, 'Las fechas deben ser texto con zona horaria explícita.');
  // Requiere un desfase explícito de zona horaria (ej: -05:00 o Z) para evitar malas interpretaciones
  const patronIso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;
  const fechaInicio = new Date(inicio);
  const fechaFin = new Date(fin);

  if (
    !patronIso.test(inicio) ||
    !patronIso.test(fin) ||
    !Number.isFinite(+fechaInicio) ||
    !Number.isFinite(+fechaFin) ||
    fechaFin <= fechaInicio
  ) {
    throw new ErrorHttp(400, 'El horario de fin debe ser posterior al inicio.');
  }

  for (const valor of [inicio, fin]) {
    const coincidencia = valor.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?/)[0];
    const [anio, mes, dia, hora, minuto, segundo = 0] = coincidencia.split(/[-T:]/).map(Number);
    const calendario = new Date(Date.UTC(anio, mes - 1, dia));

    if (
      calendario.getUTCFullYear() !== anio ||
      calendario.getUTCMonth() !== mes - 1 ||
      calendario.getUTCDate() !== dia ||
      hora > 23 ||
      minuto > 59 ||
      segundo > 59
    ) {
      throw new ErrorHttp(400, 'La fecha o la hora no existe. Revisa el calendario.');
    }
  }

  if (futura && (+fechaInicio <= Date.now() || fechaFin - fechaInicio > 86400000)) {
    throw new ErrorHttp(400, 'Reserva un horario futuro con una duración máxima de 24 horas.');
  }

  return [fechaInicio.toISOString(), fechaFin.toISOString()];
}

export function validarHorarioLaboral(inicioIso, finIso) {
  const fechaInicio = new Date(inicioIso);
  const fechaFin = new Date(finIso);

  const formatoDia = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Guayaquil',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const formatoHora = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Guayaquil',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  const diaInicio = formatoDia.format(fechaInicio);
  const diaFin = formatoDia.format(fechaFin);

  if (diaInicio !== diaFin) {
    throw new ErrorHttp(400, 'Las reservas deben iniciar y terminar el mismo día laboral.');
  }

  const horaInicio = formatoHora.format(fechaInicio);
  const horaFin = formatoHora.format(fechaFin);

  if (horaInicio < '08:00:00' || horaInicio >= '17:00:00' || horaFin <= '08:00:00' || horaFin > '17:00:00' || (horaFin === '17:00:00' && fechaFin.getMilliseconds() > 0)) {
    throw new ErrorHttp(400, 'El horario de reservas permitido es únicamente de 8:00 a.m. a 5:00 p.m. (08:00 a 17:00).');
  }
}

