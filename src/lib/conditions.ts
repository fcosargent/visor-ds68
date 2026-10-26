// Evaluación de las condiciones a partir de los campos reales del predio.
// Solo «SI» (sin espacios, sin distinguir mayúsculas) cuenta como cumplimiento; nulo nunca cumple.

import { PREDIO_FIELDS, type ConditionId } from '../config/layers';

export const esSi = (v: unknown) => typeof v === 'string' && v.trim().toUpperCase() === 'SI';

export function cumpleCondicion(props: Record<string, unknown>, condition: ConditionId): boolean {
  const base = esSi(props[PREDIO_FIELDS.cumple]) && esSi(props[PREDIO_FIELDS.via20]);
  if (condition === 'base') return base;
  if (condition === 'vial') return base && esSi(props[PREDIO_FIELDS.vial]);
  return base && esSi(props[PREDIO_FIELDS.metro]);
}
