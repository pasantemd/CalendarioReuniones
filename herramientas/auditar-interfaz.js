import { expect } from '@playwright/test';

export async function auditarInterfaz(pagina, nombre) {
  const resultado = await pagina.evaluate(() => {
    const luminancia = rgb => {
      const [r,g,b] = rgb.map(v => v/255).map(v => v <= .04045 ? v/12.92 : ((v+.055)/1.055)**2.4);
      return .2126*r+.7152*g+.0722*b;
    };
    const parsear = color => color.match(/[\d.]+/g)?.map(Number) || [0,0,0,0];
    const errores = [];
    const modal = [...document.querySelectorAll('dialog[open]')].at(-1);
    let minimo = 21;
    for (const nodo of document.querySelectorAll('body *')) {
      if ((modal && !modal.contains(nodo)) || !nodo.checkVisibility() || nodo.closest('[disabled]') || ![...nodo.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue;
      const estilo = getComputedStyle(nodo);
      if (Number(estilo.opacity) < 1) continue;
      let fondo = [255,255,255], padre = nodo;
      while (padre) {
        const color = parsear(getComputedStyle(padre).backgroundColor);
        if (color.length === 3 || color[3] === 1) { fondo = color.slice(0,3); break; }
        padre = padre.parentElement;
      }
      const texto = parsear(estilo.color).slice(0,3);
      const a = luminancia(texto), b = luminancia(fondo);
      const ratio = (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
      minimo = Math.min(minimo,ratio);
      const grande = parseFloat(estilo.fontSize) >= 24 || (parseFloat(estilo.fontSize) >= 18.66 && Number(estilo.fontWeight) >= 700);
      if (ratio < (grande ? 3 : 4.5)) errores.push({ texto: nodo.textContent.trim().slice(0,70), ratio: +ratio.toFixed(2) });
    }
    const navegacionFuera = [...document.querySelectorAll('.navegacion-boton')].filter(n => n.checkVisibility()).some(n => { const r=n.getBoundingClientRect(); return r.left<0 || r.right>innerWidth; });
    return { errores, minimo: +minimo.toFixed(2), ancho:innerWidth, overflow:document.documentElement.scrollWidth>innerWidth, navegacionFuera };
  });
  expect(resultado.overflow, `${nombre}: desbordamiento a ${resultado.ancho}px`).toBe(false);
  expect(resultado.errores, `${nombre}: contraste de texto`).toEqual([]);
  expect(resultado.navegacionFuera, `${nombre}: navegación recortada`).toBe(false);
  return resultado;
}
