// Normas de edificación por zona (normas_zonas.json) y ejercicio referencial del popup.
// Los valores para calcular vienen de cada predio (predios_zona_oct_2026_norma, dato oficial);
// del Excel solo se toman los valores con incentivo. Multiplicadores y factores: condiciones.json.

import { NORMAS_URL } from '../config/layers';
import { CONFIG, type CondicionActiva } from '../config/condiciones';

export interface Norma {
  texto: string | null;
  valor: number | null;
}

export type ClaveNorma = 'constr_viv' | 'densidad' | 'altura' | 'constr_inc_viv' | 'dens_inc' | 'alt_inc';

export type ZonaNormas = { nombre: string } & Record<ClaveNorma, Norma>;

export interface NormasData {
  fuente: string;
  zonas: Record<string, ZonaNormas>;
}

/** Propiedades de cada predio en predios.geojson. */
export interface PredioProps {
  /** Código catastral. */
  c: string | null;
  /** Código de zona del Plan Regulador (ZONA_TAB). */
  z: string | null;
  /** Nombre de la zona (NOM_TABLA con la sigla desarrollada). */
  n: string | null;
  /** Columnas del Excel asociadas a la zona, separadas por «|». */
  k: string;
  /** Superficie del predio, en m². */
  s: number;
  /** Coeficiente de constructibilidad (vivienda): texto original y valor. */
  cvt: string | null;
  cv: number | null;
  /** Altura máxima: texto original y valor en metros. */
  alt: string | null;
  al: number | null;
  /** Densidad máxima (hab/há). */
  d: number | null;
  /** Condiciones que cumple el predio (nombres de campo P*). */
  cond: string[];
}

let pendiente: Promise<NormasData> | null = null;

export function loadNormas(): Promise<NormasData> {
  pendiente ??= fetch(NORMAS_URL)
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json() as Promise<NormasData>;
    })
    .catch((err) => {
      pendiente = null;
      throw err;
    });
  return pendiente;
}

export const zonasDelPredio = (props: PredioProps, normas: NormasData | null): ZonaNormas[] =>
  normas && props.k ? props.k.split('|').map((k) => normas.zonas[k]).filter(Boolean) : [];

const fmt = (n: number, decimales = 1) =>
  new Intl.NumberFormat('es-CL', { maximumFractionDigits: decimales }).format(n);
export const formatearNumero = fmt;

/** Texto original de la norma; si es solo un número («3.6»), se muestra con coma decimal. */
export const textoNumerico = (texto: string | null | undefined): string | null => {
  if (!texto) return null;
  return /^\d+(\.\d+)?$/.test(texto) ? fmt(Number(texto), 2) : texto;
};

/**
 * Texto de una norma del Excel para el popup. Si la zona corresponde a dos columnas
 * con valores distintos, se muestran ambos rotulados.
 */
export function textoNorma(zonas: ZonaNormas[], clave: ClaveNorma): string {
  const noAplica = CONFIG.textos.noAplica;
  const textos = zonas.map((z) => z[clave].texto ?? noAplica);
  if (textos.length === 0) return noAplica;
  if (new Set(textos).size === 1) return textos[0];
  return zonas.map((z, i) => `${z.nombre}: ${textos[i]}`).join(' · ');
}

export interface FilaEjercicio {
  etiqueta: string;
  valor: string;
  destacado?: boolean;
}

export type ResultadoEjercicio = { titulo?: string; filas: FilaEjercicio[] } | { titulo?: string; mensaje: string } | null;

/** Ejercicio referencial según la condición activa, con los valores oficiales del predio. */
export function calcularEjercicio(props: PredioProps, condicion: CondicionActiva): ResultadoEjercicio {
  const ej = condicion.ejercicio;
  if (!ej) return null;

  const superficie = props.s;
  const filaSuperficie = { etiqueta: 'Superficie del predio', valor: `${fmt(superficie, 0)} m²` };
  const pct = (m: number) => `+${fmt((m - 1) * 100, 1)}%`;

  if (ej.tipo === 'constructibilidad' && ej.multiplicador) {
    const coef = props.cv;
    if (!coef) return { mensaje: CONFIG.textos.sinValorNumerico };
    const actual = superficie * coef;
    const nueva = actual * ej.multiplicador;
    return {
      filas: [
        filaSuperficie,
        { etiqueta: 'Coeficiente de constructibilidad (vivienda)', valor: fmt(coef, 2) },
        { etiqueta: 'Superficie construible actual', valor: `${fmt(actual, 0)} m²` },
        { etiqueta: `Con esta condición (${pct(ej.multiplicador)})`, valor: `${fmt(nueva, 0)} m²` },
        { etiqueta: 'Diferencia', valor: `+${fmt(nueva - actual, 0)} m²`, destacado: true },
      ],
    };
  }

  if (ej.tipo === 'altura' && ej.multiplicador) {
    const altura = props.al;
    if (!altura) return { mensaje: CONFIG.textos.sinValorNumerico };
    const nueva = altura * ej.multiplicador;
    const dif = nueva - altura;
    const pisos = Math.round(dif / CONFIG.ejercicio.metrosPorPiso);
    return {
      filas: [
        { etiqueta: 'Altura máxima actual', valor: `${fmt(altura)} m` },
        { etiqueta: `Con esta condición (${pct(ej.multiplicador)})`, valor: `${fmt(nueva)} m` },
        {
          etiqueta: 'Diferencia',
          valor: `+${fmt(dif)} m (≈ ${pisos} ${pisos === 1 ? 'piso' : 'pisos'} más, aproximado)`,
          destacado: true,
        },
      ],
    };
  }

  if (ej.tipo === 'densidad' && ej.factor) {
    const cfg = CONFIG.ejercicio.densidad;
    const densidad = props.d;
    if (!densidad) return { titulo: cfg.rotulo, mensaje: CONFIG.textos.noAplica };
    const bruta = superficie * (1 + cfg.incrementoSuperficieBruta);
    const brutaHa = bruta / 10000;
    const antes = Math.floor((densidad * brutaHa) / cfg.factorAnterior);
    const ahora = Math.floor((densidad * brutaHa) / ej.factor);
    // El porcentaje es el de la norma (factor anterior ÷ factor actual), no el de las cifras redondeadas.
    const variacion = (cfg.factorAnterior / ej.factor - 1) * 100;
    return {
      titulo: cfg.rotulo,
      filas: [
        filaSuperficie,
        { etiqueta: 'Superficie bruta estimada (+30%)', valor: `${fmt(bruta, 0)} m² (${fmt(brutaHa, 4)} há)` },
        { etiqueta: 'Densidad máxima del Plan Regulador', valor: `${fmt(densidad, 0)} hab/há` },
        { etiqueta: `Viviendas antes del DS 68 (÷ ${fmt(cfg.factorAnterior)})`, valor: fmt(antes, 0) },
        { etiqueta: `Viviendas con el DS 68 (÷ ${fmt(ej.factor)})`, valor: fmt(ahora, 0) },
        {
          etiqueta: 'Variación',
          valor: `+${fmt(ahora - antes, 0)} viviendas (+${fmt(variacion, 1)}%)`,
          destacado: true,
        },
      ],
    };
  }
  return null;
}
