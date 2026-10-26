// Prueba de intersección entre polígonos GeoJSON (en grados, plano local).
// Se usa para saber si un predio toca una Zona de Conservación Histórica.

import type { FeatureCollection, Geometry, Position } from 'geojson';

type Ring = Position[];
type Poly = Ring[];
type BBox = [number, number, number, number];

function polygons(g: Geometry | null): Poly[] {
  if (!g) return [];
  if (g.type === 'Polygon') return [g.coordinates];
  if (g.type === 'MultiPolygon') return g.coordinates;
  return [];
}

function bbox(polys: Poly[]): BBox {
  const b: BBox = [Infinity, Infinity, -Infinity, -Infinity];
  for (const poly of polys)
    for (const [x, y] of poly[0]) {
      if (x < b[0]) b[0] = x;
      if (y < b[1]) b[1] = y;
      if (x > b[2]) b[2] = x;
      if (y > b[3]) b[3] = y;
    }
  return b;
}

const bboxOverlap = (a: BBox, b: BBox) => a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];

/** Par-impar sobre todos los anillos: respeta los huecos. */
function pointInPoly([x, y]: Position, poly: Poly): boolean {
  let inside = false;
  for (const ring of poly)
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  return inside;
}

const cross = (o: Position, a: Position, b: Position) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

function segmentsCross(p1: Position, p2: Position, q1: Position, q2: Position): boolean {
  const d1 = cross(q1, q2, p1);
  const d2 = cross(q1, q2, p2);
  const d3 = cross(p1, p2, q1);
  const d4 = cross(p1, p2, q2);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

function polysIntersect(a: Poly, b: Poly): boolean {
  if (pointInPoly(a[0][0], b) || pointInPoly(b[0][0], a)) return true;
  for (const ra of a)
    for (let i = 1; i < ra.length; i++)
      for (const rb of b)
        for (let j = 1; j < rb.length; j++) if (segmentsCross(ra[i - 1], ra[i], rb[j - 1], rb[j])) return true;
  return false;
}

/** true si la geometría intersecta algún polígono de la colección. */
export function intersectsAny(geometry: Geometry | null, collection: FeatureCollection): boolean {
  const a = polygons(geometry);
  if (!a.length) return false;
  const boxA = bbox(a);
  for (const feature of collection.features) {
    const b = polygons(feature.geometry);
    if (!b.length || !bboxOverlap(boxA, bbox(b))) continue;
    for (const pa of a) for (const pb of b) if (polysIntersect(pa, pb)) return true;
  }
  return false;
}
