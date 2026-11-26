// Altura del volumen pinchado en la capa Esri 3D Buildings.
//
// En esa capa un mismo objeto agrupa a menudo varios volúmenes adosados de distinta altura, y su
// campo `height` es la del más alto. Para dar la altura del volumen pinchado se lee la malla del
// objeto y se busca el techo justo sobre el punto del clic: la cota más alta de los triángulos no
// verticales que contienen ese punto en planta. La malla viene en Web Mercator con la cota medida
// desde el suelo (elevationInfo «relative-to-ground»), así que esa cota ya es la altura.
//
// Si el clic cae en una fachada, el punto está justo en el borde entre volúmenes (o entre el
// edificio y la calle): se corre medio metro hacia adentro, en la dirección en que mira la cámara.

import type { Esri } from './arcgis';

/** Cota (m) del techo sobre el punto (x, y), o null si el punto queda fuera de la planta. */
function techoEn(pos: ArrayLike<number>, x: number, y: number): number | null {
  let mejor: number | null = null;
  for (let i = 0; i + 8 < pos.length; i += 9) {
    const ax = pos[i], ay = pos[i + 1], az = pos[i + 2];
    const bx = pos[i + 3], by = pos[i + 4], bz = pos[i + 5];
    const cx = pos[i + 6], cy = pos[i + 7], cz = pos[i + 8];
    const d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (Math.abs(d) < 1e-6) continue; // triángulo vertical (fachada)
    const l1 = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / d;
    const l2 = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / d;
    const l3 = 1 - l1 - l2;
    if (l1 < -1e-9 || l2 < -1e-9 || l3 < -1e-9) continue;
    const z = l1 * az + l2 * bz + l3 * cz;
    if (mejor === null || z > mejor) mejor = z;
  }
  return mejor;
}

/** Cantidad de alturas de techo distintas (redondeadas al metro) en la malla. */
function nivelesDeTecho(pos: ArrayLike<number>): number {
  const niveles = new Set<number>();
  for (let i = 0; i + 8 < pos.length; i += 9) {
    const z = pos[i + 2];
    if (Math.abs(z - pos[i + 5]) < 0.05 && Math.abs(z - pos[i + 8]) < 0.05 && z > 1) niveles.add(Math.round(z));
  }
  return niveles.size;
}

export interface AlturaPunto {
  /** Altura (m) del techo sobre el punto medido. */
  altura: number;
  /** Punto medido (Web Mercator), para dibujar la línea vertical. */
  x: number;
  y: number;
  /** El objeto agrupa volúmenes de distinta altura. */
  conjunto: boolean;
}

/**
 * Altura en el punto pinchado. `punto` es el mapPoint del hitTest (Web Mercator, cota absoluta),
 * `suelo` la cota del terreno en ese punto y `camara` la posición de la cámara.
 */
export async function alturaEnPunto(
  lv: Esri,
  objectId: number,
  punto: { x: number; y: number; z?: number },
  suelo: number | null,
  camara: { x: number; y: number },
): Promise<AlturaPunto | null> {
  const { features } = await lv.queryFeatures({ objectIds: [objectId], returnGeometry: true, outFields: ['ObjectID'] });
  const malla = features?.[0]?.geometry;
  if (!malla) return null;
  if (typeof malla.load === 'function') await malla.load();
  const vertices: ArrayLike<number> | undefined = malla.vertexAttributes?.position;
  if (!vertices || vertices.length < 9) return null;
  // Triángulos seguidos (así viene esta capa) o, si la malla trae índices, se expanden.
  const caras: ArrayLike<number>[] = (malla.components ?? []).map((c: Esri) => c.faces).filter(Boolean);
  let pos: ArrayLike<number> = vertices;
  if (caras.length) {
    const lista: number[] = [];
    for (const f of caras) for (let i = 0; i < f.length; i++) lista.push(vertices[f[i] * 3], vertices[f[i] * 3 + 1], vertices[f[i] * 3 + 2]);
    pos = lista;
  }
  const conjunto = nivelesDeTecho(pos) > 1;

  // ¿Techo o fachada? Si la cota del clic coincide con el techo sobre ese punto, es el techo.
  const alturaClic = punto.z != null && suelo != null ? punto.z - suelo : null;
  const enPunto = techoEn(pos, punto.x, punto.y);
  if (enPunto != null && (alturaClic == null || Math.abs(enPunto - alturaClic) < 1)) {
    return { altura: enPunto, x: punto.x, y: punto.y, conjunto };
  }
  // Fachada: medio metro hacia adentro (en Web Mercator, 1 m real ≈ 1/cos(lat) unidades; ≈ 1,2 aquí).
  const dx = punto.x - camara.x;
  const dy = punto.y - camara.y;
  const largo = Math.hypot(dx, dy) || 1;
  for (const paso of [0.6, 1.5]) {
    const x = punto.x + (dx / largo) * paso;
    const y = punto.y + (dy / largo) * paso;
    const t = techoEn(pos, x, y);
    if (t != null) return { altura: t, x, y, conjunto };
  }
  return enPunto != null ? { altura: enPunto, x: punto.x, y: punto.y, conjunto } : null;
}
