// Acceso tipado a condiciones.json (textos, cifras, colores y parámetros del ejercicio).
// Para cambiar textos o parámetros, editar condiciones.json; este archivo no contiene textos.

import datos from './condiciones.json';

export type TipoEjercicio = 'constructibilidad' | 'altura' | 'densidad';

export interface Ejercicio {
  tipo: TipoEjercicio;
  /** Constructibilidad y altura: se multiplica la norma base del Plan Regulador. */
  multiplicador?: number;
  /** Densidad: habitantes por vivienda con el DS 68. */
  factor?: number;
}

export interface Condicion {
  campo: string;
  nombre: string;
  variante: string;
  manzanas: number;
  porcentaje: number;
  texto: string;
  resumen: string;
  ejercicio: Ejercicio | null;
}

export interface Plano {
  id: string;
  titulo: string;
  articulo: string;
  condiciones: Condicion[];
}

/** Colores por valor único de un atributo del predio (densidad en P4). */
export interface Clasificacion {
  titulo: string;
  unidad: string;
  clases: { valor: number; color: string }[];
  /** Valor 0 o vacío. */
  sinValor: { color: string; etiqueta: string };
}

export interface Simbologia {
  relleno: string;
  contorno: string;
  grosor: number;
  opacidadRelleno: number;
  clasificacion?: Clasificacion;
}

export interface Grupo {
  id: string;
  titulo: string;
  introduccion: string;
  recuadro: { fondo: string; borde: string; acento: string };
  simbologia: Simbologia;
  planos: Plano[];
}

interface Configuracion {
  totalManzanas: number;
  grupos: Grupo[];
  ejercicio: {
    metrosPorPiso: number;
    nota: string;
    densidad: { factorAnterior: number; incrementoSuperficieBruta: number; rotulo: string };
  };
  textos: Record<'resumenManzanas' | 'noAplica' | 'sinValorNumerico' | 'zonaNoInformada' | 'sinNormas', string>;
}

export const CONFIG = datos as Configuracion;

/** Condición con su plano y grupo, para no repetir búsquedas en los componentes. */
export interface CondicionActiva extends Condicion {
  plano: Plano;
  grupo: Grupo;
}

export const CONDICIONES: CondicionActiva[] = CONFIG.grupos.flatMap((grupo) =>
  grupo.planos.flatMap((plano) => plano.condiciones.map((c) => ({ ...c, plano, grupo }))),
);

export const condicionPorCampo = (campo: string) => CONDICIONES.find((c) => c.campo === campo) ?? CONDICIONES[0];

/** Color de relleno de un predio según la simbología de su grupo (por clase de densidad si corresponde). */
export function colorRelleno(s: Simbologia, valor: number | null | undefined): string {
  const cl = s.clasificacion;
  if (!cl) return s.relleno;
  if (!valor) return cl.sinValor.color;
  return cl.clases.find((c) => c.valor === valor)?.color ?? cl.sinValor.color;
}
