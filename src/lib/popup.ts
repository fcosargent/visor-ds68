// Contenido de las ventanas emergentes: predios de la condición activa y fichas MH / ICH.

import type { FichaConfig } from '../config/layers';
import { CONFIG, type CondicionActiva } from '../config/condiciones';
import {
  calcularEjercicio,
  formatearNumero,
  textoNorma,
  textoNumerico,
  zonasDelPredio,
  type NormasData,
  type PredioProps,
} from './normas';

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const fila = (k: string, v: string, clase = '') =>
  `<tr${clase ? ` class="${clase}"` : ''}><th>${escapeHtml(k)}</th><td>${escapeHtml(v)}</td></tr>`;

export function predioPopup(props: PredioProps, condicion: CondicionActiva, normas: NormasData | null): string {
  const noAplica = CONFIG.textos.noAplica;
  const zonasExcel = zonasDelPredio(props, normas);
  const incentivo = (clave: 'alt_inc' | 'constr_inc_viv' | 'dens_inc') =>
    zonasExcel.length ? textoNorma(zonasExcel, clave) : normas ? noAplica : 'Cargando…';
  const ejercicio = calcularEjercicio(props, condicion);

  const filasNormas = [
    fila('Altura máxima', props.alt ?? noAplica),
    fila('Altura con incentivo', incentivo('alt_inc')),
    fila('Coef. de constructibilidad (vivienda)', textoNumerico(props.cvt) ?? noAplica),
    fila('Constructibilidad con incentivo', incentivo('constr_inc_viv')),
  ];
  if (condicion.grupo.id === 'densidad') {
    filasNormas.push(
      fila('Densidad máxima', props.d ? `${formatearNumero(props.d, 0)} hab/há` : noAplica),
      fila('Densidad con incentivo', incentivo('dens_inc')),
    );
  }

  let ejercicioHtml = '';
  if (ejercicio) {
    const cuerpo =
      'filas' in ejercicio
        ? `<table class="popup-table">${ejercicio.filas.map((f) => fila(f.etiqueta, f.valor, f.destacado ? 'is-strong' : '')).join('')}</table>`
        : `<p class="popup-muted">${escapeHtml(ejercicio.mensaje)}</p>`;
    ejercicioHtml = `<h4>${escapeHtml(ejercicio.titulo ?? 'Ejercicio referencial')}</h4>${cuerpo}<p class="popup-note">${escapeHtml(CONFIG.ejercicio.nota)}</p>`;
  }

  return `
    <div class="popup" style="--accent:${condicion.grupo.recuadro.acento}">
      <table class="popup-table popup-id">
        ${fila('Código catastral', props.c ?? 'Sin dato')}
        <tr><th>Zona del Plan Regulador</th><td>${escapeHtml(props.z ?? CONFIG.textos.zonaNoInformada)}${
          props.n ? `<span class="popup-zone-name">${escapeHtml(props.n)}</span>` : ''
        }</td></tr>
      </table>
      <h4>Qué permite esta condición</h4>
      <p>${escapeHtml(condicion.resumen)}</p>
      <h4>Normas de la zona</h4>
      <table class="popup-table">${filasNormas.join('')}</table>
      ${ejercicioHtml}
    </div>`;
}

/** Ficha de MH / ICH: todos los campos con sus alias; los enlaces como «Más información». */
export function fichaPopup(ficha: FichaConfig, props: Record<string, unknown>): string {
  const filas = ficha.campos
    .map(({ campo, alias, enlace }) => {
      const v = props[campo];
      const texto = v == null || v === '' ? 'Sin dato' : String(v);
      const valor =
        enlace && typeof v === 'string' && /^https?:\/\//.test(v)
          ? `<a href="${escapeHtml(v)}" target="_blank" rel="noopener noreferrer">Más información</a>`
          : escapeHtml(texto);
      return `<tr><th>${escapeHtml(alias)}</th><td>${valor}</td></tr>`;
    })
    .join('');
  return `<div class="popup popup-ficha"><h4 class="popup-ficha-title">${escapeHtml(ficha.titulo)}</h4><table class="popup-table">${filas}</table></div>`;
}
