// Contenido del popup al hacer clic en un predio de la condición activa.

import { CONFIG, type CondicionActiva } from '../config/condiciones';
import {
  calcularEjercicio,
  textoNorma,
  zonasDelPredio,
  type ClaveNorma,
  type NormasData,
  type PredioProps,
} from './normas';

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const NORMAS_POR_GRUPO: Record<string, [ClaveNorma, string][]> = {
  conjunto_armonico: [
    ['altura', 'Altura máxima'],
    ['alt_inc', 'Altura con incentivo'],
    ['constr_viv', 'Coef. de constructibilidad (vivienda)'],
    ['constr_inc_viv', 'Constructibilidad con incentivo'],
  ],
  densidad: [
    ['altura', 'Altura máxima'],
    ['alt_inc', 'Altura con incentivo'],
    ['constr_viv', 'Coef. de constructibilidad (vivienda)'],
    ['constr_inc_viv', 'Constructibilidad con incentivo'],
    ['densidad', 'Densidad (hab/ha)'],
    ['dens_inc', 'Densidad con incentivo'],
  ],
};

const fila = (k: string, v: string, clase = '') =>
  `<tr${clase ? ` class="${clase}"` : ''}><th>${escapeHtml(k)}</th><td>${escapeHtml(v)}</td></tr>`;

export function predioPopup(props: PredioProps, condicion: CondicionActiva, normas: NormasData | null): string {
  const zonas = zonasDelPredio(props, normas);
  const zona = props.z ?? CONFIG.textos.zonaNoInformada;
  const nombresExcel = zonas.map((z) => z.nombre).join(' / ');
  const ejercicio = calcularEjercicio(props, zonas, condicion);

  const normasHtml = zonas.length
    ? `<table class="popup-table">${(NORMAS_POR_GRUPO[condicion.grupo.id] ?? NORMAS_POR_GRUPO.conjunto_armonico)
        .map(([clave, etiqueta]) => fila(etiqueta, textoNorma(zonas, clave)))
        .join('')}</table>`
    : `<p class="popup-muted">${escapeHtml(normas ? CONFIG.textos.sinNormas : 'Cargando normas…')}</p>`;

  let ejercicioHtml = '';
  if (ejercicio && 'filas' in ejercicio) {
    ejercicioHtml = `<table class="popup-table">${ejercicio.filas
      .map((f) => fila(f.etiqueta, f.valor, f.destacado ? 'is-strong' : ''))
      .join('')}</table>`;
  } else if (ejercicio) {
    ejercicioHtml = `<p class="popup-muted">${escapeHtml(ejercicio.mensaje)}</p>`;
  }

  return `
    <div class="popup" style="--accent:${condicion.grupo.recuadro.acento}">
      <table class="popup-table popup-id">
        ${fila('Código catastral', props.c ?? 'Sin dato')}
        ${fila('Zona del Plan Regulador', zona)}
      </table>
      ${nombresExcel && nombresExcel.replace(/^(ZONA|SUBZONA|ZCH|SE)\s+/, '') !== zona ? `<p class="popup-muted">Normas de: ${escapeHtml(nombresExcel)}</p>` : ''}
      <h4>Qué permite esta condición</h4>
      <p>${escapeHtml(condicion.resumen)}</p>
      <h4>Normas de la zona</h4>
      ${normasHtml}
      ${ejercicioHtml ? `<h4>Ejercicio referencial</h4>${ejercicioHtml}<p class="popup-note">${escapeHtml(CONFIG.ejercicio.nota)}</p>` : ''}
    </div>`;
}
