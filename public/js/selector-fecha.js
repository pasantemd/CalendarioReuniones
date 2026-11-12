import { crearElemento, fechaActual } from './nucleo.js';

export function iniciarSelectorFecha() {
  const dialogo = crearElemento('dialog', 'selector-fecha');
  dialogo.setAttribute('aria-label', 'Elegir fecha');
  const cabecera = crearElemento('div', 'selector-fecha-cabecera');
  const mes = crearElemento('select');
  mes.setAttribute('aria-label', 'Mes');
  for (let i = 0; i < 12; i++)
    mes.add(
      new Option(
        new Intl.DateTimeFormat('es', { month: 'long', timeZone: 'UTC' }).format(
          new Date(Date.UTC(2026, i, 1))
        ),
        i
      )
    );
  const anio = crearElemento('input');
  anio.type = 'number';
  anio.min = '1';
  anio.max = '9999';
  anio.setAttribute('aria-label', 'Año');
  const crearBoton = (texto, etiqueta, accion) => {
    const boton = crearElemento('button', 'secundario', texto);
    boton.type = 'button';
    if (etiqueta) boton.setAttribute('aria-label', etiqueta);
    boton.addEventListener('click', accion);
    return boton;
  };
  const anterior = crearBoton('‹', 'Mes anterior', () => cambiarMes(-1));
  const siguiente = crearBoton('›', 'Mes siguiente', () => cambiarMes(1));
  cabecera.append(anterior, mes, anio, siguiente);
  const diasSemana = crearElemento('div', 'selector-fecha-semana');
  diasSemana.setAttribute('aria-hidden', 'true');
  for (const nombre of ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'])
    diasSemana.append(crearElemento('span', '', nombre));
  const cuadricula = crearElemento('div', 'selector-fecha-dias');
  const pie = crearElemento('div', 'selector-fecha-pie');
  const hoy = crearBoton('Hoy', null, () => elegir(fechaActual()));
  pie.append(
    crearBoton('Borrar', null, () => elegir('')),
    hoy,
    crearBoton('Cerrar', null, () => dialogo.close())
  );
  dialogo.append(cabecera, diasSemana, cuadricula, pie);
  document.body.append(dialogo);
  let campo, disparador, fechaEnFoco;
  const fechaIso = (fecha) => fecha.toISOString().split('T')[0];
  const desplazarDia = (valor, dias) => {
    const fecha = new Date(`${valor}T12:00:00Z`);
    fecha.setUTCDate(fecha.getUTCDate() + dias);
    return fechaIso(fecha);
  };
  const valida = (fecha) =>
    /^\d{4}-\d{2}-\d{2}$/.test(fecha) &&
    !fecha.startsWith('0000') &&
    (!campo.min || fecha >= campo.min) &&
    (!campo.max || fecha <= campo.max);
  const fechaMes = () => {
    const fecha = new Date('2000-01-01T12:00:00Z');
    fecha.setUTCFullYear(Number(anio.value), Number(mes.value), 1);
    return fecha;
  };
  function mostrarMes(fecha, enfocar = false) {
    const valor = new Date(`${fecha}T12:00:00Z`);
    if (!Number.isFinite(+valor)) return;
    mes.value = valor.getUTCMonth();
    anio.value = valor.getUTCFullYear();
    fechaEnFoco = fecha;
    renderizar(enfocar);
  }
  function renderizar(enfocar = false) {
    if (!anio.checkValidity()) return;
    const primero = fechaMes();
    const inicio = desplazarDia(fechaIso(primero), -((primero.getUTCDay() + 6) % 7));
    cuadricula.replaceChildren();
    const fechas = Array.from({ length: 42 }, (_, i) => desplazarDia(inicio, i));
    if (!fechas.includes(fechaEnFoco) || !valida(fechaEnFoco))
      fechaEnFoco =
        fechas.find(
          (fecha) =>
            valida(fecha) && new Date(`${fecha}T12:00:00Z`).getUTCMonth() === Number(mes.value)
        ) || fechas.find(valida);
    for (const fecha of fechas) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || fecha.startsWith('0000')) {
        const espacio = crearElemento('span');
        espacio.setAttribute('aria-hidden', 'true');
        cuadricula.append(espacio);
        continue;
      }
      const dia = new Date(`${fecha}T12:00:00Z`);
      const boton = crearBoton(
        String(dia.getUTCDate()),
        new Intl.DateTimeFormat('es', { dateStyle: 'full', timeZone: 'UTC' }).format(dia),
        () => elegir(fecha)
      );
      boton.dataset.fecha = fecha;
      boton.disabled = !valida(fecha);
      boton.tabIndex = fecha === fechaEnFoco ? 0 : -1;
      boton.classList.toggle('exterior', dia.getUTCMonth() !== Number(mes.value));
      boton.classList.toggle('elegido', fecha === campo.value);
      boton.setAttribute('aria-pressed', String(fecha === campo.value));
      if (fecha === fechaActual()) boton.setAttribute('aria-current', 'date');
      cuadricula.append(boton);
    }
    hoy.disabled = !valida(fechaActual());
    if (enfocar) cuadricula.querySelector('[tabindex="0"]')?.focus();
  }
  function cambiarMes(desplazamiento) {
    const fecha = fechaMes();
    fecha.setUTCMonth(fecha.getUTCMonth() + desplazamiento);
    if (fecha.getUTCFullYear() < 1 || fecha.getUTCFullYear() > 9999) return;
    mostrarMes(fechaIso(fecha));
  }
  function elegir(fecha) {
    if (fecha && !valida(fecha)) return;
    campo.value = fecha;
    campo.dispatchEvent(new Event('input', { bubbles: true }));
    campo.dispatchEvent(new Event('change', { bubbles: true }));
    dialogo.close();
  }
  mes.addEventListener('change', () => renderizar());
  anio.addEventListener('change', () => renderizar());
  cuadricula.addEventListener('keydown', (evento) => {
    const actual = evento.target.dataset.fecha;
    if (!actual) return;
    let destino;
    const desplazamientos = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (evento.key in desplazamientos) destino = desplazarDia(actual, desplazamientos[evento.key]);
    if (evento.key === 'Home' || evento.key === 'End') {
      const indice = (new Date(`${actual}T12:00:00Z`).getUTCDay() + 6) % 7;
      destino = desplazarDia(actual, evento.key === 'Home' ? -indice : 6 - indice);
    }
    if (!destino) return;
    evento.preventDefault();
    if (valida(destino)) mostrarMes(destino, true);
  });
  dialogo.addEventListener('click', (evento) => {
    if (evento.target !== dialogo) return;
    const rect = dialogo.getBoundingClientRect();
    if (
      evento.clientX < rect.left ||
      evento.clientX > rect.right ||
      evento.clientY < rect.top ||
      evento.clientY > rect.bottom
    )
      dialogo.close();
  });
  dialogo.addEventListener('close', () => {
    disparador?.setAttribute('aria-expanded', 'false');
    if (disparador?.isConnected && !disparador.closest('[hidden]')) disparador.focus();
  });
  for (const entrada of document.querySelectorAll('input[type="date"]')) {
    const envoltorio = crearElemento('span', 'campo-fecha');
    entrada.before(envoltorio);
    envoltorio.append(entrada);
    const etiqueta = entrada.labels?.[0]?.textContent.trim() || 'Fecha';
    entrada.setAttribute('aria-label', etiqueta);
    const boton = crearBoton('▦', `Abrir calendario: ${etiqueta}`, () => {
      if (entrada.disabled || entrada.readOnly) return;
      campo = entrada;
      disparador = boton;
      let fecha = entrada.value || fechaActual();
      if (entrada.min && fecha < entrada.min) fecha = entrada.min;
      if (entrada.max && fecha > entrada.max) fecha = entrada.max;
      mostrarMes(fecha);
      dialogo.showModal();
      boton.setAttribute('aria-expanded', 'true');
      const rect = entrada.getBoundingClientRect();
      const ancho = dialogo.offsetWidth,
        alto = dialogo.offsetHeight;
      dialogo.style.left = `${Math.max(12, Math.min(rect.left, innerWidth - ancho - 12))}px`;
      dialogo.style.top = `${Math.max(12, Math.min(rect.bottom + 8, innerHeight - alto - 12))}px`;
      cuadricula.querySelector('[tabindex="0"]')?.focus();
    });
    boton.setAttribute('aria-haspopup', 'dialog');
    boton.setAttribute('aria-expanded', 'false');
    envoltorio.append(boton);
  }
}
