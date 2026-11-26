// Nombres de calles del Visualizador 3D, pegados al suelo sobre el eje de cada calle.
//
// En la escena 3D, las etiquetas de ArcGIS siempre miran a la pantalla (no se pueden girar ni
// acostar). Por eso cada nombre se dibuja como una imagen pequeña (canvas) apoyada en el terreno
// (MediaLayer), girada con el ángulo de la calle que trae etiquetas_ejes_viales.geojson. Así queda
// sobre el eje, sigue la dirección de la calle y los edificios la tapan en vez de quedar encima.
//
// Rendimiento: las imágenes se crean solo para las etiquetas cercanas a la cámara y únicamente con
// la cámara detenida y cerca (escala ESCALA_MAXIMA); se guardan para reutilizarlas.

import type { Feature } from 'geojson';
import type { Esri } from './arcgis';

/** Escala desde la que se muestran (≈ cámara a 600 m; antes 1:12.000, cuando ya eran ilegibles). */
export const ESCALA_NOMBRES_CALLES = 5000;
/** Radio (m) alrededor del centro de la vista en que se dibujan etiquetas. */
const RADIO_METROS = 1300;
/**
 * Alto de la etiqueta sobre el suelo, en metros, incluido el halo: con 8 m la letra mide ≈ 5,3 m
 * (antes 9 m y letra de ≈ 7 m, que se veía muy grande de cerca).
 */
const ALTO_METROS = 8;
/** Resolución del texto en el canvas (más alta que antes para que la letra chica se vea nítida). */
const PX = 64;
/** Grosor del halo blanco a cada lado de la letra, en px del canvas (≈ 16 % de la letra). */
const HALO_PX = 10;
const R_TIERRA = 6378137;

interface Etiqueta {
  nombre: string;
  angulo: number;
  lon: number;
  lat: number;
  /** Web Mercator. */
  x: number;
  y: number;
  elemento?: Esri;
}

const aMercator = (lon: number, lat: number) => [
  ((lon * Math.PI) / 180) * R_TIERRA,
  Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) * R_TIERRA,
];

function imagenTexto(texto: string, color: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  const fuente = `bold ${PX}px Arial, Helvetica, sans-serif`;
  ctx.font = fuente;
  // Margen del tamaño del halo, para que no se corte en los bordes.
  const margen = HALO_PX + 2;
  canvas.width = Math.ceil(ctx.measureText(texto).width) + 2 * margen;
  canvas.height = Math.round(PX * 1.2) + 2 * HALO_PX;
  ctx.font = fuente;
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  // Halo blanco opaco bajo la letra: se nota sobre áreas verdes y predios de color (sobre la calle,
  // que es casi blanca, se confunde con el fondo).
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2 * HALO_PX;
  ctx.strokeText(texto, margen, canvas.height / 2);
  ctx.fillStyle = color;
  ctx.fillText(texto, margen, canvas.height / 2);
  return canvas;
}

export interface ModulosCalles {
  MediaLayer: Esri;
  ImageElement: Esri;
  ExtentAndRotationGeoreference: Esri;
  Extent: Esri;
  reactiveUtils: Esri;
}

/**
 * Crea la capa y la mantiene al día con la cámara. `quitar()` suelta los vigilantes (llamarlo al
 * sacar la capa de la escena).
 */
export function capaNombresCalles(
  E: ModulosCalles,
  view: Esri,
  features: Feature[],
  opciones: { titulo: string; color: string; esperaMs: number },
): { layer: Esri; quitar: () => void } {
  const etiquetas: Etiqueta[] = [];
  for (const f of features) {
    if (f.geometry?.type !== 'Point') continue;
    const [lon, lat] = f.geometry.coordinates;
    const p = f.properties ?? {};
    const nombre = String(p.nombre ?? '').trim();
    if (!nombre) continue;
    const [x, y] = aMercator(lon, lat);
    etiquetas.push({ nombre, angulo: Number(p.angulo) || 0, lon, lat, x, y });
  }

  const layer = new E.MediaLayer({ title: opciones.titulo, source: [] });
  const visibles = new Set<Etiqueta>();

  const elementoDe = (e: Etiqueta) => {
    if (e.elemento) return e.elemento;
    const canvas = imagenTexto(e.nombre, opciones.color);
    // Web Mercator agranda las distancias en 1/cos(latitud): se compensa para que el alto sea real.
    const k = 1 / Math.cos((e.lat * Math.PI) / 180);
    const mPorPx = ALTO_METROS / canvas.height;
    const medioAncho = (canvas.width * mPorPx * k) / 2;
    const medioAlto = (canvas.height * mPorPx * k) / 2;
    e.elemento = new E.ImageElement({
      image: canvas,
      georeference: new E.ExtentAndRotationGeoreference({
        extent: new E.Extent({
          xmin: e.x - medioAncho,
          xmax: e.x + medioAncho,
          ymin: e.y - medioAlto,
          ymax: e.y + medioAlto,
          spatialReference: { wkid: 3857 },
        }),
        // Mismo giro horario que usa el 2D (el texto nunca queda invertido).
        rotation: e.angulo,
      }),
    });
    return e.elemento;
  };

  const actualizar = () => {
    const elementos = layer.source?.elements;
    if (!elementos) return;
    const c = view.center;
    const deseadas = new Set<Etiqueta>();
    if (c && view.scale <= ESCALA_NOMBRES_CALLES) {
      const [cx, cy] = aMercator(c.longitude, c.latitude);
      const radio = RADIO_METROS / Math.cos((c.latitude * Math.PI) / 180);
      for (const e of etiquetas) if (Math.hypot(e.x - cx, e.y - cy) <= radio) deseadas.add(e);
    }
    const sacar = [...visibles].filter((e) => !deseadas.has(e));
    const poner = [...deseadas].filter((e) => !visibles.has(e));
    if (sacar.length) elementos.removeMany(sacar.map((e) => e.elemento));
    if (poner.length) elementos.addMany(poner.map(elementoDe));
    sacar.forEach((e) => visibles.delete(e));
    poner.forEach((e) => visibles.add(e));
  };

  let espera: ReturnType<typeof setTimeout> | undefined;
  const manija = E.reactiveUtils.watch(
    () => view.stationary,
    (quieta: boolean) => {
      clearTimeout(espera);
      if (quieta) espera = setTimeout(() => view.stationary && actualizar(), opciones.esperaMs);
    },
    { initial: true },
  );
  return {
    layer,
    quitar: () => {
      clearTimeout(espera);
      manija.remove();
    },
  };
}
