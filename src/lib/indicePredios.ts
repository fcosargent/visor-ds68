// Índice espacial simple (grilla) de los predios de la condición activa, para saber en qué predio
// cae un punto. Lo usa la escena 3D para colorear cada edificio según el predio donde está su
// centro. Es mucho más rápido que consultar contra la unión de los predios (0,2 s contra 23 s
// para unos 8.000 edificios).

import type { Feature, Position } from 'geojson';

/** Tamaño de celda en grados (≈ 200 m). */
const CELDA = 0.002;

interface Entrada<P> {
  partes: Position[][][];
  caja: [number, number, number, number];
  props: P;
}

/** Punto dentro de un anillo (algoritmo del rayo). */
function enAnillo(x: number, y: number, anillo: Position[]): boolean {
  let dentro = false;
  for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
    const [xi, yi] = anillo[i];
    const [xj, yj] = anillo[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}

export interface IndicePredios<P> {
  /** Propiedades del predio que contiene el punto (longitud, latitud), o null. */
  buscar: (x: number, y: number) => P | null;
}

export function crearIndice<P>(features: Feature[]): IndicePredios<P> {
  const entradas: Entrada<P>[] = [];
  const grilla = new Map<string, number[]>();
  for (const f of features) {
    const g = f.geometry;
    const partes = g?.type === 'Polygon' ? [g.coordinates] : g?.type === 'MultiPolygon' ? g.coordinates : null;
    if (!partes) continue;
    let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const p of partes)
      for (const [x, y] of p[0]) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    const i = entradas.push({ partes, caja: [x0, y0, x1, y1], props: f.properties as P }) - 1;
    for (let gx = Math.floor(x0 / CELDA); gx <= Math.floor(x1 / CELDA); gx++)
      for (let gy = Math.floor(y0 / CELDA); gy <= Math.floor(y1 / CELDA); gy++) {
        const k = `${gx},${gy}`;
        const lista = grilla.get(k);
        if (lista) lista.push(i);
        else grilla.set(k, [i]);
      }
  }
  return {
    buscar(x, y) {
      const lista = grilla.get(`${Math.floor(x / CELDA)},${Math.floor(y / CELDA)}`);
      if (!lista) return null;
      for (const i of lista) {
        const e = entradas[i];
        if (x < e.caja[0] || x > e.caja[2] || y < e.caja[1] || y > e.caja[3]) continue;
        for (const p of e.partes) {
          if (enAnillo(x, y, p[0]) && !p.slice(1).some((hueco) => enAnillo(x, y, hueco))) return e.props;
        }
      }
      return null;
    },
  };
}
