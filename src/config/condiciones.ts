// Acceso tipado a condiciones.json (textos, cifras, colores y parámetros del ejercicio).
// Para cambiar textos o parámetros, editar condiciones.json; este archivo no contiene textos.

import datos from './condiciones.json';

export type TipoEjercicio = 'constructibilidad' | 'altura' | 'densidad';

export interface Ejercicio {
  tipo: TipoEjercicio;
  /** Constructibilidad y altura: se multiplica la norma base del Plan Regulador. */
  multiplicador?: number;
  /** Densidad: habitantes por vivienda. */
  factor?: number;
  /** Densidad: factor general, para comparar. */
  factorComparacion?: number;
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

export interface Simbologia {
  relleno: string;
  contorno: string;
  grosor: number;
  opacidadRelleno: number;
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
  ejercicio: { metrosPorPiso: number; nota: string };
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
