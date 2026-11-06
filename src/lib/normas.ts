// Normas de edificación por zona (normas_zonas.json) y ejercicio referencial del popup.
// Los porcentajes y factores vienen de condiciones.json; aquí solo se calcula.

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
  /** Zona del Plan Regulador (ZONA, o ZONA_2 cuando ZONA venía como «0»). */
  z: string | null;
  /** Columnas del Excel asociadas a la zona, separadas por «|». */
  k: string;
  /** Superficie del predio dentro de la zona, en m². */
  s: number;
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

/**
 * Texto de una norma para el popup. Si la zona corresponde a dos columnas del Excel
 * con valores distintos (p. ej. zona B oriente/poniente), se muestran ambos rotulados.
 */
export function textoNorma(zonas: ZonaNormas[], clave: ClaveNorma): string {
  const noAplica = CONFIG.textos.noAplica;
  const textos = zonas.map((z) => z[clave].texto ?? noAplica);
  if (textos.length === 0) return noAplica;
  if (new Set(textos).size === 1) return textos[0];
  return zonas.map((z, i) => `${z.nombre}: ${textos[i]}`).join(' · ');
}

/** Valor numérico común a todas las columnas de la zona; null si falta o difiere. */
function valorComun(zonas: ZonaNormas[], clave: ClaveNorma): number | null {
  const valores = zonas.map((z) => z[clave].valor);
  if (valores.length === 0 || valores.some((v) => v == null)) return null;
  return new Set(valores).size === 1 ? valores[0] : null;
}

export interface FilaEjercicio {
  etiqueta: string;
  valor: string;
  destacado?: boolean;
}

/** Ejercicio referencial según la condición activa. Devuelve filas o un mensaje. */
export function calcularEjercicio(
  props: PredioProps,
  zonas: ZonaNormas[],
  condicion: CondicionActiva,
): { filas: FilaEjercicio[] } | { mensaje: string } | null {
  const ej = condicion.ejercicio;
  if (!ej) return null;
  if (zonas.length === 0) return { mensaje: CONFIG.textos.sinNormas };

  const superficie = props.s;
  const filaSuperficie = { etiqueta: 'Superficie del predio en esta zona', valor: `${fmt(superficie, 0)} m²` };
  const pct = (m: number) => `+${fmt((m - 1) * 100, 0)}%`;

  if (ej.tipo === 'constructibilidad' && ej.multiplicador) {
    const coef = valorComun(zonas, 'constr_viv');
    if (coef == null) return { mensaje: CONFIG.textos.sinValorNumerico };
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
    const altura = valorComun(zonas, 'altura');
    if (altura == null) return { mensaje: CONFIG.textos.sinValorNumerico };
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
    const densidad = valorComun(zonas, 'densidad');
    if (densidad == null) return { mensaje: CONFIG.textos.sinValorNumerico };
    const viviendas = (factor: number) => Math.floor((densidad * (superficie / 10000)) / factor);
    const filas: FilaEjercicio[] = [
      filaSuperficie,
      { etiqueta: 'Densidad del Plan Regulador', valor: `${fmt(densidad, 0)} hab/ha` },
      { etiqueta: `Máximo de viviendas con factor ${fmt(ej.factor)}`, valor: fmt(viviendas(ej.factor), 0), destacado: true },
    ];
    if (ej.factorComparacion) {
      const base = viviendas(ej.factorComparacion);
      filas.push({ etiqueta: `Con el factor general ${fmt(ej.factorComparacion)}`, valor: fmt(base, 0) });
      filas.push({ etiqueta: 'Diferencia', valor: `+${fmt(viviendas(ej.factor) - base, 0)} viviendas` });
    }
    return { filas };
  }
  return null;
}
