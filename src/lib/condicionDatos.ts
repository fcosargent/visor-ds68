// Predios de la condición activa: filtro y valores de densidad presentes. Lo usan el mapa 2D
// y la escena 3D, para que los conteos y la leyenda sean siempre los mismos.

import type { Feature, FeatureCollection } from 'geojson';
import type { CondicionActiva } from '../config/condiciones';
import type { PredioProps } from './normas';

export const cumpleCondicion = (f: Feature | undefined, condicion: CondicionActiva) =>
  ((f?.properties as PredioProps | null)?.cond ?? []).includes(condicion.campo);

export const prediosDeCondicion = (data: FeatureCollection, condicion: CondicionActiva) =>
  data.features.filter((f) => cumpleCondicion(f, condicion));

/** Valores de densidad presentes (para la leyenda); null si el grupo no usa clases. */
export const valoresDeClase = (props: PredioProps[], condicion: CondicionActiva): number[] | null =>
  condicion.grupo.simbologia.clasificacion ? [...new Set(props.map((p) => p.d ?? 0))].sort((a, b) => a - b) : null;
