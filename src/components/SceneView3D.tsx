// Visualizador 3D: la misma información del mapa 2D (condición activa, capas de referencia,
// conteos y ventanas emergentes) sobre una escena de ArcGIS con las edificaciones de la comuna.
// Recibe las mismas propiedades que MapView; el panel, los cuadros y la leyenda son los del 2D.
// El SDK de ArcGIS se descarga del CDN solo cuando se abre esta vista (ver lib/arcgis.ts).

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Feature, Geometry, Position } from 'geojson';
import { EDIFICIOS_3D, MAPA_BASE_3D, PREDIOS_URL, REFERENCE_LAYERS, type LayerConfig } from '../config/layers';
import { crearIndice, type IndicePredios } from '../lib/indicePredios';
import { alturaEnPunto, type AlturaPunto } from '../lib/alturaVolumen';
import { capaNombresCalles } from '../lib/callesSuelo';
import { METADATA } from '../config/metadata';
import { colorRelleno, type CondicionActiva } from '../config/condiciones';
import { importar, type Esri } from '../lib/arcgis';
import { estiloSinTextos } from '../lib/basemap';
import { prediosDeCondicion, valoresDeClase } from '../lib/condicionDatos';
import { loadGeoJSON } from '../lib/data';
import { NO_EXPORTAR } from '../lib/exportImage';
import { formatearNumero, type NormasData, type PredioProps } from '../lib/normas';
import { esPantallaMovil } from '../lib/pantalla';
import { fichaPopup, predioPopup } from '../lib/popup';
import type { Encuadre } from '../lib/vista';
import { ID_CONDICION } from './LayerPanel';

interface Props {
  condicion: CondicionActiva;
  references: LayerConfig[];
  ordenes: Record<string, number>;
  normas: NormasData | null;
  onCount: (n: number | null) => void;
  onValoresClase: (valores: number[] | null) => void;
  onLoadingChange: (loading: boolean) => void;
  onLayerUnavailable: (id: string) => void;
  encuadreInicial?: Encuadre | null;
  onEncuadre?: (e: Encuadre) => void;
  /** Entrega la función que captura la escena (para la imagen JPG), o null al cerrar la vista. */
  registrarCaptura: (captura: (() => Promise<string>) | null) => void;
}

type Herramienta = 'distancia' | 'area' | null;
/** «auto»: calidad según la distancia (recomendada); «alta»: siempre «medium». */
type Calidad = 'auto' | 'alta';

/**
 * Calidad y bordes según la distancia (mediciones en el README):
 * - de cerca, perfil «low» con bordes y transparencia: ≈ 41 cuadros por segundo (con «medium» y
 *   bordes eran ≈ 22);
 * - de lejos (toda la comuna), perfil «medium» y sin bordes, porque «low» no carga los edificios a esa
 *   distancia y los bordes casi no se distinguen.
 * El cambio se hace solo con la cámara detenida (cuesta una pausa de ≈ 0,4 s). Hay un margen
 * entre los dos umbrales para que no cambie de ida y vuelta.
 */
const ZOOM_CERCA = 15.2;
const ZOOM_LEJOS = 14.8;
interface ModoDibujo {
  cerca: boolean;
  perfil: 'low' | 'medium';
  bordes: boolean;
}
function modoDibujo(calidad: Calidad, movil: boolean, zoom: number, cercaAntes: boolean): ModoDibujo {
  const cerca = zoom >= ZOOM_CERCA ? true : zoom < ZOOM_LEJOS ? false : cercaAntes;
  // En celular siempre «low» (como antes); con «alta», siempre «medium».
  const perfil = movil ? 'low' : calidad === 'alta' ? 'medium' : cerca ? 'low' : 'medium';
  return { cerca, perfil, bordes: cerca };
}
/**
 * Clave nueva («-v2»): la versión anterior guardaba «alta» al abrir la vista aunque nadie la eligiera,
 * así que ese valor antiguo se ignora.
 */
const CLAVE_CALIDAD = 'ds68-calidad-3d-v2';
function leerCalidad(): Calidad {
  try {
    return localStorage.getItem(CLAVE_CALIDAD) === 'alta' ? 'alta' : 'auto';
  } catch {
    return 'auto';
  }
}

/** Inclinación de la cámara al abrir (0 = vista cenital). */
const INCLINACION = 55;
/** Zoom con que la vista oblicua inicial abarca toda la comuna. */
const ZOOM_COMUNA = 14;
/** Los predios se dibujan algo más transparentes que en 2D, para distinguirlos bajo los edificios. */
const FACTOR_OPACIDAD_3D = 0.8;
/**
 * Edificios semitransparentes, para ver si el predio de abajo está pintado: grises al 75 % y los de
 * la condición al 95 %. Los bordes (contorno de cada edificio) dependen de la distancia (ver modoDibujo).
 */
const COLOR_EDIFICIO_GRIS = [238, 239, 241, 0.75];
const OPACIDAD_EDIFICIOS_CONDICION = 0.95;
const BORDE_EDIFICIO = { type: 'solid', color: [80, 86, 92, 0.55], size: 0.6 };
/** Espera tras detenerse la cámara antes de clasificar los edificios nuevos. */
const ESPERA_COLOREADO_MS = 500;
/** Edificios por consulta de geometría al clasificar. */
const LOTE_CLASIFICACION = 250;
/** Línea vertical que marca dónde se midió la altura de un edificio (coral del Observatorio). */
const COLOR_MEDICION = [234, 104, 78, 1];
const SR_WGS84 = { wkid: 4326 };

const MODULOS = {
  Map: 'Map',
  SceneView: 'views/SceneView',
  Basemap: 'Basemap',
  VectorTileLayer: 'layers/VectorTileLayer',
  TileLayer: 'layers/TileLayer',
  FeatureLayer: 'layers/FeatureLayer',
  SceneLayer: 'layers/SceneLayer',
  SceneFilter: 'layers/support/SceneFilter',
  MediaLayer: 'layers/MediaLayer',
  ImageElement: 'layers/support/ImageElement',
  ExtentAndRotationGeoreference: 'layers/support/ExtentAndRotationGeoreference',
  Extent: 'geometry/Extent',
  Graphic: 'Graphic',
  Polygon: 'geometry/Polygon',
  Point: 'geometry/Point',
  Polyline: 'geometry/Polyline',
  webMercatorUtils: 'geometry/support/webMercatorUtils',
  geodesicBufferOperator: 'geometry/operators/geodesicBufferOperator',
  DirectLineMeasurement3D: 'widgets/DirectLineMeasurement3D',
  AreaMeasurement3D: 'widgets/AreaMeasurement3D',
  Zoom: 'widgets/Zoom',
  NavigationToggle: 'widgets/NavigationToggle',
  Compass: 'widgets/Compass',
  intl: 'intl',
  reactiveUtils: 'core/reactiveUtils',
} as const;
type Modulos = Record<keyof typeof MODULOS, Esri>;

async function cargarModulos(): Promise<Modulos> {
  const claves = Object.keys(MODULOS) as (keyof typeof MODULOS)[];
  const mods = await importar(claves.map((k) => MODULOS[k]));
  return Object.fromEntries(claves.map((k, i) => [k, mods[i]])) as Modulos;
}

/** «#RRGGBB» → [r, g, b, a] para los símbolos de ArcGIS. */
function rgba(hex: string, alfa = 1): number[] {
  let h = hex.replace('#', '');
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, alfa];
}

/** Área con signo (positiva = antihoraria en lon/lat). */
const areaConSigno = (anillo: Position[]) =>
  anillo.reduce((s, p, i) => {
    const q = anillo[(i + 1) % anillo.length];
    return s + (p[0] * q[1] - q[0] * p[1]);
  }, 0) / 2;

/** ArcGIS espera el anillo exterior en sentido horario y los huecos en antihorario (GeoJSON usa lo inverso). */
const orientar = (anillos: Position[][]) =>
  anillos.map((a, i) => ((i === 0) === areaConSigno(a) > 0 ? [...a].reverse() : a));

function geometria(g: Geometry | null): Esri | null {
  if (!g) return null;
  switch (g.type) {
    case 'Polygon':
      return { type: 'polygon', rings: orientar(g.coordinates), spatialReference: SR_WGS84 };
    case 'MultiPolygon':
      return { type: 'polygon', rings: g.coordinates.flatMap(orientar), spatialReference: SR_WGS84 };
    case 'LineString':
      return { type: 'polyline', paths: [g.coordinates], spatialReference: SR_WGS84 };
    case 'MultiLineString':
      return { type: 'polyline', paths: g.coordinates, spatialReference: SR_WGS84 };
    case 'Point':
      return { type: 'point', x: g.coordinates[0], y: g.coordinates[1], spatialReference: SR_WGS84 };
    default:
      return null;
  }
}

const TIPO_GEOMETRIA: Record<string, string> = { polygon: 'polygon', polyline: 'polyline', point: 'point' };

/** Contenido HTML (el mismo del 2D) para la ventana emergente de ArcGIS. */
const contenidoHtml = (html: string) => {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div;
};

/**
 * Capa de entidades en memoria a partir de un GeoJSON. Los atributos completos quedan en `props`
 * (la ventana emergente los busca por `oid`); la capa solo guarda los campos que necesita.
 */
function capaEntidades(
  E: Modulos,
  features: Feature[],
  opciones: {
    titulo: string;
    renderer: Esri;
    atributos?: (props: Record<string, unknown>) => Record<string, unknown>;
    campos?: { name: string; type: string }[];
    popup?: { titulo: (p: Record<string, unknown>) => string; html: (p: Record<string, unknown>) => string };
  },
) {
  const props: Record<string, unknown>[] = [];
  const fuente: Esri[] = [];
  let tipo: string | null = null;
  for (const f of features) {
    const geom = geometria(f.geometry);
    if (!geom) continue;
    tipo ??= geom.type;
    if (geom.type !== tipo) continue;
    const p = (f.properties ?? {}) as Record<string, unknown>;
    props.push(p);
    fuente.push({ geometry: geom, attributes: { oid: props.length, ...(opciones.atributos?.(p) ?? {}) } });
  }
  const deOid = (g: Esri) => props[(g?.attributes?.oid ?? 1) - 1] ?? {};
  const popup = opciones.popup;
  return new E.FeatureLayer({
    title: opciones.titulo,
    source: fuente,
    objectIdField: 'oid',
    fields: [{ name: 'oid', type: 'oid' }, ...(opciones.campos ?? [])],
    geometryType: TIPO_GEOMETRIA[tipo ?? 'polygon'],
    spatialReference: SR_WGS84,
    renderer: opciones.renderer,
    elevationInfo: { mode: 'on-the-ground' },
    popupEnabled: Boolean(popup),
    outFields: ['*'],
    popupTemplate: popup
      ? {
          title: (e: Esri) => popup.titulo(deOid(e.graphic)),
          content: (e: Esri) => contenidoHtml(popup.html(deOid(e.graphic))),
          outFields: ['*'],
        }
      : undefined,
  });
}

/** Simbología de una capa de referencia a partir de su estilo en layers.ts. */
function rendererReferencia(config: LayerConfig): Esri {
  const s = config.style;
  const estiloLinea = s.dashArray ? 'dash' : 'solid';
  // ArcGIS mide en puntos (1 pt ≈ 1,33 px).
  const pt = (px: number) => px * 0.75;
  if (config.type === 'point') {
    return {
      type: 'simple',
      symbol: {
        type: 'simple-marker',
        style: 'circle',
        size: pt((s.radius ?? 5) * 2),
        color: rgba(s.fillColor ?? s.color, s.fillOpacity ?? 1),
        outline: { color: rgba(s.color, s.opacity ?? 1), width: pt(s.weight) },
      },
    };
  }
  if (config.type === 'line') {
    return {
      type: 'simple',
      symbol: { type: 'simple-line', color: rgba(s.color, s.opacity ?? 1), width: pt(s.weight), style: estiloLinea },
    };
  }
  return {
    type: 'simple',
    symbol: {
      type: 'simple-fill',
      color: rgba(s.fillColor ?? s.color, s.fillOpacity ?? 0),
      outline: { color: rgba(s.color, s.opacity ?? 1), width: pt(s.weight), style: estiloLinea },
    },
  };
}

const ESCAPAR: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapar = (s: string) => s.replace(/[&<>"']/g, (c) => ESCAPAR[c]);

function capaReferencia(E: Modulos, config: LayerConfig, features: Feature[]) {
  const filtro = config.filter;
  const lista = filtro
    ? features.filter((f) => String(f.properties?.[filtro.property] ?? '') === filtro.value)
    : features;
  const ficha = config.ficha;
  const tooltip = config.tooltip;
  return capaEntidades(E, lista, {
    titulo: config.label,
    renderer: rendererReferencia(config),
    popup: ficha
      ? { titulo: () => config.label, html: (p) => fichaPopup(ficha, p) }
      : tooltip
        ? { titulo: (p) => tooltip(p), html: () => `<p class="popup-muted">${escapar(config.label)}</p>` }
        : undefined,
  });
}

/** Predios que cumplen la condición activa, con la misma simbología del 2D. */
function capaCondicion(E: Modulos, condicion: CondicionActiva, features: Feature[], normas: () => NormasData | null) {
  const s = condicion.grupo.simbologia;
  const colores = [...new Set(features.map((f) => colorRelleno(condicion, (f.properties as PredioProps).d)))];
  return capaEntidades(E, features, {
    titulo: condicion.nombre,
    campos: [{ name: 'clase', type: 'string' }],
    atributos: (p) => ({ clase: colorRelleno(condicion, (p as unknown as PredioProps).d) }),
    renderer: {
      type: 'unique-value',
      field: 'clase',
      uniqueValueInfos: colores.map((c) => ({
        value: c,
        symbol: {
          type: 'simple-fill',
          color: rgba(c, s.opacidadRelleno * FACTOR_OPACIDAD_3D),
          outline: { color: rgba(s.contorno), width: Math.max(s.grosor, 0.4) },
        },
      })),
    },
    popup: {
      titulo: (p) => `Predio ${String((p as unknown as PredioProps).c ?? '')}`.trim(),
      html: (p) => predioPopup(p as unknown as PredioProps, condicion, normas()),
    },
  });
}

/** Volumen de edificio, gris o con el color de la condición, con o sin bordes. */
const simboloEdificio = (color: number[], bordes: boolean) => ({
  type: 'mesh-3d',
  symbolLayers: [
    { type: 'fill', material: { color, colorMixMode: 'replace' }, ...(bordes ? { edges: BORDE_EDIFICIO } : {}) },
  ],
});

/** Renderer de los edificios: gris, salvo los clasificados en un predio de la condición (por ObjectID). */
function rendererEdificios(colores: Map<number, string>, bordes: boolean): Esri {
  const simbolos = new Map<string, Esri>();
  const infos: Esri[] = [];
  for (const [oid, color] of colores) {
    if (!simbolos.has(color)) simbolos.set(color, simboloEdificio(rgba(color, OPACIDAD_EDIFICIOS_CONDICION), bordes));
    infos.push({ value: oid, symbol: simbolos.get(color) });
  }
  return {
    type: 'unique-value',
    field: 'ObjectID',
    defaultSymbol: simboloEdificio(COLOR_EDIFICIO_GRIS, bordes),
    uniqueValueInfos: infos,
  };
}

/**
 * Límite comunal ampliado EDIFICIOS_3D.bufferRecorteMetros, para recortar con SceneFilter
 * («contains») los edificios, árboles y etiquetas. Se calcula una vez.
 */
let recorte: Promise<Esri> | null = null;
function recorteComunal(E: Modulos): Promise<Esri> {
  recorte ??= (async () => {
    const limite = REFERENCE_LAYERS.find((l) => l.id === 'limite_comunal');
    const data = limite ? await loadGeoJSON(limite.url).catch(() => null) : null;
    const geojson = geometria(data?.features[0]?.geometry ?? null);
    if (!geojson) return null;
    const poligono = new E.Polygon(geojson);
    await E.geodesicBufferOperator.load?.();
    return E.geodesicBufferOperator.execute(poligono, EDIFICIOS_3D.bufferRecorteMetros, { unit: 'meters' }) ?? poligono;
  })().catch((err) => {
    recorte = null;
    throw err;
  });
  return recorte;
}

const filtroComunal = (E: Modulos, limite: Esri) =>
  limite ? new E.SceneFilter({ geometries: [limite], spatialRelationship: 'contains' }) : undefined;

/** Copia de un estilo vectorial con solo algunas de sus capas (sin textos), con rutas completas. */
let estiloOpenBasemap: Promise<Esri> | null = null;
async function estiloParcial(patron: RegExp): Promise<Esri> {
  estiloOpenBasemap ??= fetch(MAPA_BASE_3D.estiloVectorial)
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    })
    .catch((err) => {
      estiloOpenBasemap = null;
      throw err;
    });
  const estilo = JSON.parse(JSON.stringify(await estiloOpenBasemap));
  const abs = (ruta: string) => new URL(ruta, MAPA_BASE_3D.estiloVectorial).href;
  if (typeof estilo.sprite === 'string') estilo.sprite = abs(estilo.sprite);
  if (estilo.glyphs) estilo.glyphs = abs(estilo.glyphs);
  for (const fuente of Object.values(estilo.sources) as Esri[]) if (fuente.url) fuente.url = abs(fuente.url);
  estilo.layers = estilo.layers.filter((l: Esri) => l.type !== 'symbol' && l.type !== 'background' && patron.test(l.id));
  return estilo;
}

/** Capas del grupo «Mapa base 3D»: árboles, etiquetas de lugares, áreas verdes y agua. */
async function capaMapaBase3d(E: Modulos, config: LayerConfig): Promise<Esri> {
  switch (config.escena3d) {
    case 'arboles':
      return new E.SceneLayer({
        url: MAPA_BASE_3D.arboles,
        title: config.label,
        popupEnabled: false,
        filter: filtroComunal(E, await recorteComunal(E)),
      });
    case 'etiquetas':
      return new E.SceneLayer({
        url: MAPA_BASE_3D.etiquetas,
        title: config.label,
        popupEnabled: false,
        definitionExpression: MAPA_BASE_3D.filtroEtiquetas,
        filter: filtroComunal(E, await recorteComunal(E)),
      });
    case 'verdes':
    case 'agua':
      return new E.VectorTileLayer({
        title: config.label,
        style: await estiloParcial(config.escena3d === 'verdes' ? MAPA_BASE_3D.capasVerdes : MAPA_BASE_3D.capasAgua),
      });
    default:
      throw new Error(`capa 3D desconocida: ${String(config.escena3d)}`);
  }
}

/**
 * Edificaciones 3D, recortadas con un SceneFilter («contains») al límite comunal ampliado.
 * `enCondicion` dice si el edificio quedó clasificado en un predio de la condición activa y `medir`
 * calcula la altura del volumen pinchado (ver lib/alturaVolumen.ts).
 */
async function capaEdificios(
  E: Modulos,
  enCondicion: (oid: number) => string | null,
  medir: (oid: number) => Promise<AlturaPunto | null>,
  bordes: boolean,
) {
  const capa = new E.SceneLayer({
    url: EDIFICIOS_3D.url,
    title: 'Edificaciones 3D',
    renderer: rendererEdificios(new Map(), bordes),
    filter: filtroComunal(E, await recorteComunal(E)),
  });
  await capa.load();
  const existentes = new Set((capa.fields ?? []).map((f: Esri) => f.name));
  const campos = EDIFICIOS_3D.campos.filter((c) => existentes.has(c.campo));
  capa.outFields = ['ObjectID', ...campos.map((c) => c.campo)];
  // Tabla con el mismo formato de las fichas del 2D; se omiten los campos vacíos, en 0 o «unknown».
  const valor = (campo: string, v: unknown, at: Record<string, unknown>): string | null => {
    if (v == null || v === '' || v === 0 || v === 'unknown') return null;
    if (campo === 'height' && typeof v === 'number') {
      // 3 m sin pisos informados es el valor por defecto de la capa, no una medición.
      const sinPisos = !(Number(at.building_levels) > 0);
      return v === EDIFICIOS_3D.alturaPorDefecto && sinPisos ? EDIFICIOS_3D.textoAlturaNoInformada : `${formatearNumero(v, 1)} m`;
    }
    if (campo === 'building_levels' && typeof v === 'number') return formatearNumero(v, 0);
    if (campo === 'source') return EDIFICIOS_3D.fuentes[String(v)] ?? String(v);
    if (campo === 'OSMID') return String(Math.round(Number(v)));
    return String(v);
  };
  capa.popupTemplate = {
    title: (e: Esri) => String(e.graphic?.attributes?.name || 'Edificación'),
    outFields: ['ObjectID', ...campos.map((c) => c.campo)],
    content: async (e: Esri) => {
      const at = e.graphic?.attributes ?? {};
      const oid = typeof at.ObjectID === 'number' ? at.ObjectID : null;
      const condicion = oid != null ? enCondicion(oid) : null;
      // Altura por defecto (3 m sin pisos): no es una medición, así que tampoco se calculan pisos.
      const alturaConjunto = Number(at.height);
      const sinAltura = alturaConjunto === EDIFICIOS_3D.alturaPorDefecto && !(Number(at.building_levels) > 0);
      const punto = oid != null && !sinAltura ? await medir(oid).catch(() => null) : null;
      const filasAltura: (readonly [string, string | null])[] = punto
        ? [
            ['Altura en el punto pinchado', `${formatearNumero(punto.altura, 1)} m`],
            ['Pisos aproximados', formatearNumero(Math.max(1, Math.round(punto.altura / EDIFICIOS_3D.alturaPiso)), 0)],
            // Se muestra la del conjunto solo si es distinta (el campo de la capa es la máxima).
            [
              'Altura máxima del conjunto',
              Math.abs(alturaConjunto - punto.altura) >= 1 ? valor('height', at.height, at) : null,
            ],
          ]
        : [['Altura', valor('height', at.height, at)]];
      const filas = [
        ...filasAltura,
        ...campos
          .filter((c) => c.campo !== 'height')
          .map((c) => [c.alias, valor(c.campo, at[c.campo], at)] as const),
        ['Capa', EDIFICIOS_3D.nombreCapa] as const,
        ['Condición activa', condicion ? `En predio de «${condicion}»` : 'No está en predios de la condición'] as const,
      ]
        .filter(([, v]) => v !== null)
        .map(([a, v]) => `<tr><th>${escapar(a)}</th><td>${escapar(v!)}</td></tr>`)
        .join('');
      const notaConjunto = punto?.conjunto ? `<p class="popup-note">${escapar(EDIFICIOS_3D.notaConjunto)}</p>` : '';
      return contenidoHtml(
        `<div class="popup popup-ficha"><table class="popup-table">${filas}</table>${notaConjunto}` +
          `<p class="popup-note">${escapar(EDIFICIOS_3D.nota)} ${escapar(EDIFICIOS_3D.atribucion)}</p></div>`,
      );
    },
  };
  return capa;
}

const A_METROS: Record<string, number> = { mm: 0.001, cm: 0.01, m: 1, km: 1000 };

/**
 * Distancia en metros desde la medición del SDK. En esta versión el SDK entrega solo el texto
 * formateado (por ejemplo «1.234,5 m» con locale «es»), así que se lee desde ahí.
 */
function aMetros(d: Esri): number | null {
  if (typeof d?.value === 'number') return d.value * (A_METROS[d.unit] ?? 1);
  const m = /(-?[\d.,]+)\s*(km|cm|mm|m)\b/i.exec(String(d?.text ?? ''));
  if (!m) return null;
  return Number(m[1].replace(/\./g, '').replace(',', '.')) * A_METROS[m[2].toLowerCase()];
}

/** Pendiente de la medición directa: arcotangente(vertical ÷ horizontal), en grados y en %. */
function pendiente(m: Esri): string | null {
  const hm = aMetros(m?.horizontalDistance);
  const v = aMetros(m?.verticalDistance);
  if (hm == null || v == null || !(hm > 0)) return null;
  const vm = Math.abs(v);
  const grados = (Math.atan(vm / hm) * 180) / Math.PI;
  return `${formatearNumero(grados, 1)}° (${formatearNumero((vm / hm) * 100, 1)}%)`;
}

export default function SceneView3D({
  condicion,
  references,
  ordenes,
  normas,
  onCount,
  onValoresClase,
  onLoadingChange,
  onLayerUnavailable,
  encuadreInicial,
  onEncuadre,
  registrarCaptura,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const esriRef = useRef<Modulos | null>(null);
  const viewRef = useRef<Esri>(null);
  const condicionRef = useRef<{ id: string; layer: Esri } | null>(null);
  const refsRef = useRef(new Map<string, { id: string; layer: Esri }>());
  /** Vigilantes que hay que soltar al sacar una capa (nombres de calles). */
  const limpiezaRef = useRef(new Map<string, () => void>());
  const activeIdsRef = useRef(new Set<string>());
  const pendingRef = useRef(0);
  const normasRef = useRef(normas);
  normasRef.current = normas;
  const ordenesRef = useRef(ordenes);
  ordenesRef.current = ordenes;
  const cb = useRef({ onCount, onValoresClase, onLoadingChange, onLayerUnavailable, onEncuadre, registrarCaptura });
  cb.current = { onCount, onValoresClase, onLoadingChange, onLayerUnavailable, onEncuadre, registrarCaptura };

  const [lista, setLista] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [barra, setBarra] = useState<HTMLDivElement | null>(null);
  const [herramienta, setHerramienta] = useState<Herramienta>(null);
  const [textoPendiente, setTextoPendiente] = useState<string | null>(null);
  const [nodoPendiente, setNodoPendiente] = useState<HTMLDivElement | null>(null);
  // Calidad gráfica: «auto» (según la distancia, por defecto) o «alta» (siempre medium); en celular,
  // siempre «low». Se recuerda en este navegador. Ver modoDibujo.
  const [movil] = useState(esPantallaMovil);
  const [calidad, setCalidad] = useState<Calidad>(() => (movil ? 'auto' : leerCalidad()));
  const calidadRef = useRef(calidad);
  calidadRef.current = calidad;
  /** Modo de dibujo vigente (perfil de calidad y bordes de los edificios). */
  const modoRef = useRef<ModoDibujo>(
    modoDibujo(calidad, movil, encuadreInicial?.zoom ?? ZOOM_COMUNA, (encuadreInicial?.zoom ?? ZOOM_COMUNA) >= ZOOM_CERCA),
  );

  const track = <T,>(p: Promise<T>) => {
    pendingRef.current += 1;
    cb.current.onLoadingChange(true);
    return p.finally(() => {
      pendingRef.current -= 1;
      if (pendingRef.current === 0) cb.current.onLoadingChange(false);
    });
  };

  // ── Edificios coloreados por condición ─────────────────────────────────────────────
  // Cada edificio cargado en la escena se asigna al predio donde cae el centro de su planta
  // (índice de los predios de la condición activa). Si cae en uno, toma su color (rosado en
  // Conjunto Armónico, la clase de densidad en Densidad); si no, queda gris. Los edificios nuevos
  // se clasifican a medida que la escena los carga.
  const indiceRef = useRef<IndicePredios<PredioProps> | null>(null);
  /** ObjectID → color, de los edificios en predios de la condición. */
  const coloresRef = useRef(new Map<number, string>());
  /** ObjectID de los edificios ya revisados (en la condición o no). */
  const revisadosRef = useRef(new Set<number>());
  const edificiosRef = useRef<Esri>(null);
  const manijaEdificiosRef = useRef<Esri>(null);
  const condicionActRef = useRef(condicion);
  condicionActRef.current = condicion;
  const coloreandoRef = useRef<Promise<void> | null>(null);

  const colorearEdificios = (reiniciar = false) => {
    if (reiniciar) {
      coloresRef.current = new Map();
      revisadosRef.current = new Set();
    }
    const capa = edificiosRef.current;
    const view = viewRef.current;
    const E = esriRef.current;
    if (!capa || !view || !E || !indiceRef.current) return;
    // Una pasada a la vez; si llega otra mientras tanto, se encadena.
    const anterior = coloreandoRef.current ?? Promise.resolve();
    coloreandoRef.current = anterior
      .then(async () => {
        // Se trabaja sobre los mapas vigentes al empezar: si cambia la condición, esta pasada se descarta.
        const colores = coloresRef.current;
        const revisados = revisadosRef.current;
        const indiceActual = indiceRef.current;
        if (!indiceActual) return;
        const lv = await view.whenLayerView(capa);
        // Rendimiento: primero solo los identificadores (≈ 10 ms para 8.000 edificios) y luego la
        // geometría únicamente de los edificios nuevos. Pedir todas las mallas costaba ≈ 650 ms por pasada.
        const ids: number[] = await lv.queryObjectIds({});
        const nuevos = ids.filter((id) => !revisados.has(id));
        let cambios = reiniciar;
        const cond = condicionActRef.current;
        // En lotes chicos y cediendo el turno entre lotes, para no trabar la pantalla; si la cámara
        // se vuelve a mover, se interrumpe y lo pendiente se clasifica en la próxima parada.
        for (let i = 0; i < nuevos.length; i += LOTE_CLASIFICACION) {
          if (i > 0) {
            await new Promise((r) => setTimeout(r, 0));
            if (!view.stationary) break;
          }
          const lote = nuevos.slice(i, i + LOTE_CLASIFICACION);
          const { features } = await lv.queryFeatures({ objectIds: lote, returnGeometry: true, outFields: ['ObjectID'] });
          if (colores !== coloresRef.current) return;
          for (const id of lote) revisados.add(id);
          for (const f of features) {
            const oid = f.attributes?.ObjectID;
            const c = f.geometry?.extent?.center;
            if (typeof oid !== 'number' || !c) continue;
            const [x, y] = c.spatialReference?.isWGS84 ? [c.x, c.y] : E.webMercatorUtils.xyToLngLat(c.x, c.y);
            const predio = indiceActual.buscar(x, y);
            if (predio) {
              colores.set(oid, colorRelleno(cond, predio.d));
              cambios = true;
            }
          }
        }
        if (cambios && edificiosRef.current === capa) capa.renderer = rendererEdificios(colores, modoRef.current.bordes);
      })
      .catch((err) => console.warn(`[Visor DS 68] No se pudieron colorear los edificios: ${String(err)}`));
  };

  // ── Altura del volumen pinchado ────────────────────────────────────────────────────
  // Cada clic guarda su hitTest; la ventana del edificio lo usa para medir el techo bajo ese punto
  // y se marca el lugar medido (línea vertical y punto coral en el techo), que se borra al cerrar la
  // ventana.
  const clicRef = useRef<Promise<Esri> | null>(null);
  const lineaRef = useRef<Esri[]>([]);

  const quitarLinea = () => {
    const view = viewRef.current;
    if (lineaRef.current.length && view) view.graphics.removeMany(lineaRef.current);
    lineaRef.current = [];
  };

  const medirVolumen = async (oid: number): Promise<AlturaPunto | null> => {
    const view = viewRef.current;
    const E = esriRef.current;
    const capa = edificiosRef.current;
    if (!view || !E || !capa || !clicRef.current) return null;
    const hit = await clicRef.current;
    const r = hit?.results?.find((x: Esri) => x.graphic?.attributes?.ObjectID === oid);
    const p = r?.mapPoint;
    if (!p) return null;
    const lv = await view.whenLayerView(capa);
    const suelo = (pt: Esri): number | null => {
      const z = view.groundView?.elevationSampler?.queryElevation(pt)?.z;
      return typeof z === 'number' ? z : null;
    };
    const cam = view.camera.position;
    const medida = await alturaEnPunto(lv, oid, { x: p.x, y: p.y, z: p.z }, suelo(p), { x: cam.x, y: cam.y });
    quitarLinea();
    if (medida) {
      const base = suelo(new E.Point({ x: medida.x, y: medida.y, spatialReference: p.spatialReference })) ?? suelo(p) ?? 0;
      const sr = p.spatialReference;
      lineaRef.current = [
        new E.Graphic({
          geometry: new E.Polyline({
            paths: [[[medida.x, medida.y, base], [medida.x, medida.y, base + medida.altura]]],
            hasZ: true,
            spatialReference: sr,
          }),
          symbol: { type: 'line-3d', symbolLayers: [{ type: 'line', size: 3, material: { color: COLOR_MEDICION } }] },
        }),
        // Punto en el techo medido (la línea queda dentro del volumen y a veces no se distingue).
        new E.Graphic({
          geometry: new E.Point({ x: medida.x, y: medida.y, z: base + medida.altura + 0.3, spatialReference: sr }),
          symbol: {
            type: 'point-3d',
            symbolLayers: [
              {
                type: 'icon',
                resource: { primitive: 'circle' },
                size: 11,
                material: { color: COLOR_MEDICION },
                outline: { color: [255, 255, 255, 1], size: 1.5 },
              },
            ],
          },
        }),
      ];
      view.graphics.addMany(lineaRef.current);
    }
    return medida;
  };

  const desvincularEdificios = () => {
    manijaEdificiosRef.current?.remove();
    manijaEdificiosRef.current = null;
    edificiosRef.current = null;
  };

  const vincularEdificios = (capa: Esri) => {
    const view = viewRef.current;
    const E = esriRef.current;
    if (!view || !E) return;
    desvincularEdificios();
    edificiosRef.current = capa;
    colorearEdificios(true);
    view.whenLayerView(capa).then((lv: Esri) => {
      if (edificiosRef.current !== capa) return;
      // Los edificios nuevos se clasifican solo con la cámara detenida, tras una breve espera: al
      // detenerse (con lo ya cargado) y otra vez cuando la escena termina de cargar. Así el
      // coloreado (y el cambio de renderer) nunca interrumpe el desplazamiento.
      let espera: ReturnType<typeof setTimeout> | undefined;
      const manija = E.reactiveUtils.watch(
        () => [view.stationary, lv.updating],
        ([quieta]: [boolean, boolean]) => {
          clearTimeout(espera);
          if (quieta)
            espera = setTimeout(() => {
              if (view.stationary) colorearEdificios();
            }, ESPERA_COLOREADO_MS);
        },
        // También al inicio: la cámara puede estar quieta desde antes de vincular la capa.
        { initial: true },
      );
      manijaEdificiosRef.current = {
        remove: () => {
          clearTimeout(espera);
          manija.remove();
        },
      };
    });
  };

  /** Ajusta el perfil de calidad y los bordes de los edificios a la distancia de la cámara. */
  const aplicarModo = () => {
    const view = viewRef.current;
    if (!view) return;
    const modo = modoDibujo(calidadRef.current, movil, view.zoom, modoRef.current.cerca);
    const bordesCambian = modo.bordes !== modoRef.current.bordes;
    modoRef.current = modo;
    if (view.qualityProfile !== modo.perfil) view.qualityProfile = modo.perfil;
    const capa = edificiosRef.current;
    if (bordesCambian && capa) capa.renderer = rendererEdificios(coloresRef.current, modo.bordes);
  };

  /** Orden de dibujo sobre el terreno: el mismo del panel (los edificios van siempre en 3D). */
  const reorder = () => {
    const view = viewRef.current;
    if (!view) return;
    const todas = [...refsRef.current.values()];
    if (condicionRef.current) todas.push(condicionRef.current);
    todas
      .sort((a, b) => (ordenesRef.current[a.id] ?? 0) - (ordenesRef.current[b.id] ?? 0))
      .forEach((a, i) => view.map.reorder(a.layer, i));
  };

  // Inicialización: SDK, mapa base, terreno, controles y cámara.
  useEffect(() => {
    let cancelado = false;
    let view: Esri = null;
    const manijas: Esri[] = [];

    track(
      (async () => {
        const E = await cargarModulos();
        if (cancelado) return;
        E.intl.setLocale('es');
        esriRef.current = E;

        let capaBase: Esri;
        try {
          capaBase = new E.VectorTileLayer({ style: await estiloSinTextos() });
        } catch (err) {
          console.warn(`[Visor DS 68] Mapa base vectorial no disponible en 3D (${String(err)}); se usa el raster.`);
          capaBase = new E.TileLayer({ url: METADATA.mapaBase.rasterRespaldo.replace(/\/tile\/.*$/, '') });
        }
        if (cancelado) return;

        const [lat, lon] = encuadreInicial?.centro ?? METADATA.vistaInicial.centro;
        view = new E.SceneView({
          container: containerRef.current!,
          map: new E.Map({ basemap: new E.Basemap({ baseLayers: [capaBase] }), ground: 'world-elevation' }),
          center: [lon, lat],
          zoom: encuadreInicial?.zoom ?? METADATA.vistaInicial.zoom,
          qualityProfile: modoRef.current.perfil,
          environment: { starsEnabled: false },
          ui: { components: ['attribution'] },
          popup: { dockEnabled: false, defaultPopupTemplateEnabled: false },
        });
        viewRef.current = view;
        view.ui.add(new E.Zoom({ view }), 'top-right');
        view.ui.add(new E.NavigationToggle({ view }), 'top-right');
        view.ui.add(new E.Compass({ view }), 'top-right');
        const contenedorBarra = document.createElement('div');
        view.ui.add(contenedorBarra, 'top-right');
        setBarra(contenedorBarra);

        await view.when();
        if (cancelado) return;
        // Vista oblicua: desde el 2D conserva el centro y el zoom; si no, encuadra la comuna.
        if (encuadreInicial) {
          view.goTo({ center: [lon, lat], zoom: encuadreInicial.zoom, tilt: INCLINACION }, { animate: false }).catch(() => {});
        } else {
          // Centro de la comuna (caja del Límite comunal) con un zoom que la abarca completa en la
          // vista oblicua. Con `target` y una inclinación, ArcGIS encuadra demasiado cerca.
          const limite = REFERENCE_LAYERS.find((l) => l.id === 'limite_comunal');
          const data = limite ? await loadGeoJSON(limite.url).catch(() => null) : null;
          const g = data?.features[0]?.geometry;
          const puntos = g?.type === 'Polygon' ? g.coordinates.flat() : g?.type === 'MultiPolygon' ? g.coordinates.flat(2) : [];
          const medio = (eje: 0 | 1) => (Math.min(...puntos.map((p) => p[eje])) + Math.max(...puntos.map((p) => p[eje]))) / 2;
          const centro = puntos.length ? [medio(0), medio(1)] : [lon, lat];
          if (cancelado) return;
          view
            .goTo({ center: centro, zoom: ZOOM_COMUNA, tilt: INCLINACION, heading: 0 }, { animate: false })
            .catch(() => {});
        }
        manijas.push(
          E.reactiveUtils.when(
            () => view.stationary,
            () => {
              const c = view.center;
              if (c) cb.current.onEncuadre?.({ centro: [c.latitude, c.longitude], zoom: view.zoom });
            },
          ),
        );
        // Calidad y bordes según la distancia: se revisan con la cámara detenida (tras una breve espera).
        let esperaModo: ReturnType<typeof setTimeout> | undefined;
        const manijaModo = E.reactiveUtils.watch(
          () => view.stationary,
          (quieta: boolean) => {
            clearTimeout(esperaModo);
            if (quieta) esperaModo = setTimeout(() => view.stationary && aplicarModo(), ESPERA_COLOREADO_MS);
          },
        );
        manijas.push({
          remove: () => {
            clearTimeout(esperaModo);
            manijaModo.remove();
          },
        });
        // Altura del volumen pinchado: se guarda el hitTest de cada clic (ver medirVolumen).
        manijas.push(
          view.on('click', (ev: Esri) => {
            quitarLinea();
            const capa = edificiosRef.current;
            clicRef.current = capa ? view.hitTest(ev, { include: [capa] }).catch(() => null) : null;
          }),
          E.reactiveUtils.watch(
            () => view.popup?.visible,
            (visible: boolean) => {
              if (!visible) quitarLinea();
            },
          ),
        );
        cb.current.registrarCaptura(async () => (await view.takeScreenshot({ format: 'png' })).dataUrl);
        if (import.meta.env.DEV) (window as unknown as { __escena: Esri }).__escena = view;
        setLista(true);
      })(),
    ).catch((err) => {
      if (cancelado) return;
      console.error('[Visor DS 68] No se pudo iniciar la vista 3D:', err);
      setError('No se pudo cargar la vista 3D. Revise su conexión o use el Visualizador 2D.');
    });

    return () => {
      cancelado = true;
      manijas.forEach((m) => m.remove());
      cb.current.registrarCaptura(null);
      desvincularEdificios();
      limpiezaRef.current.forEach((quitar) => quitar());
      limpiezaRef.current.clear();
      lineaRef.current = [];
      clicRef.current = null;
      view?.destroy();
      viewRef.current = null;
      condicionRef.current = null;
      refsRef.current.clear();
      setLista(false);
      setBarra(null);
    };
    // Solo al montar: el encuadre inicial se lee una vez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Condición activa: la misma selección y conteos del 2D.
  useEffect(() => {
    if (!lista) return;
    const E = esriRef.current!;
    const view = viewRef.current;
    let stale = false;
    if (condicionRef.current) {
      view.map.remove(condicionRef.current.layer);
      condicionRef.current = null;
    }
    cb.current.onCount(null);
    track(loadGeoJSON(PREDIOS_URL))
      .then((data) => {
        if (stale || !viewRef.current) return;
        const features = prediosDeCondicion(data, condicion);
        // Edificios: se vuelven a clasificar según los predios de la nueva condición.
        indiceRef.current = crearIndice<PredioProps>(features);
        colorearEdificios(true);
        const layer = capaCondicion(E, condicion, features, () => normasRef.current);
        view.map.add(layer);
        condicionRef.current = { id: ID_CONDICION, layer };
        reorder();
        cb.current.onCount(features.length);
        cb.current.onValoresClase(valoresDeClase(features.map((f) => f.properties as PredioProps), condicion));
      })
      .catch((err) => {
        if (!stale) console.warn(`[Visor DS 68] No se pudieron cargar los predios (${PREDIOS_URL}): ${String(err)}`);
      });
    return () => {
      stale = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [condicion, lista]);

  // Capas de referencia (incluidas las edificaciones 3D).
  useEffect(() => {
    if (!lista) return;
    const E = esriRef.current!;
    const view = viewRef.current;
    const wanted = new Set(references.map((r) => r.id));
    activeIdsRef.current = wanted;
    for (const [id, active] of refsRef.current) {
      if (!wanted.has(id)) {
        if (active.layer === edificiosRef.current) desvincularEdificios();
        limpiezaRef.current.get(id)?.();
        limpiezaRef.current.delete(id);
        view.map.remove(active.layer);
        refsRef.current.delete(id);
      }
    }
    for (const config of references) {
      if (refsRef.current.has(config.id)) continue;
      const crear: Promise<Esri> =
        config.escena3d === 'edificios'
          ? capaEdificios(
              E,
              (oid) => (coloresRef.current.has(oid) ? condicionActRef.current.nombre : null),
              medirVolumen,
              modoRef.current.bordes,
            )
          : config.escena3d
            ? capaMapaBase3d(E, config)
            : config.type === 'label'
              ? // Nombres de calles: pegados al suelo sobre el eje (ver lib/callesSuelo.ts).
                loadGeoJSON(config.url).then((data) => {
                  const { layer, quitar } = capaNombresCalles(E, view, data.features, {
                    titulo: config.label,
                    color: config.style.color,
                    esperaMs: ESPERA_COLOREADO_MS,
                  });
                  limpiezaRef.current.get(config.id)?.();
                  limpiezaRef.current.set(config.id, quitar);
                  return layer;
                })
              : loadGeoJSON(config.url).then((data) => capaReferencia(E, config, data.features));
      track(crear)
        .then((layer) => {
          if (!viewRef.current || !activeIdsRef.current.has(config.id) || refsRef.current.has(config.id)) return;
          view.map.add(layer);
          refsRef.current.set(config.id, { id: config.id, layer });
          reorder();
          if (config.escena3d === 'edificios') vincularEdificios(layer);
        })
        .catch((err) => {
          console.warn(`[Visor DS 68] No se pudo cargar la capa «${config.label}» en 3D: ${String(err)}`);
          cb.current.onLayerUnavailable(config.id);
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [references, lista]);

  useEffect(() => {
    reorder();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ordenes, lista]);

  // Herramientas de medición: una a la vez.
  useEffect(() => {
    const E = esriRef.current;
    const view = viewRef.current;
    setTextoPendiente(null);
    if (!lista || !E || !view || !herramienta) return;
    const Widget = herramienta === 'distancia' ? E.DirectLineMeasurement3D : E.AreaMeasurement3D;
    const widget = new Widget({ view, unit: 'metric' });
    view.ui.add(widget, 'top-right');
    widget.viewModel.start?.();
    // La pendiente va en un recuadro propio, bajo el panel de la medición.
    let manija: Esri = null;
    let recuadro: HTMLDivElement | null = null;
    if (herramienta === 'distancia') {
      recuadro = document.createElement('div');
      view.ui.add(recuadro, 'top-right');
      setNodoPendiente(recuadro);
      manija = E.reactiveUtils.watch(
        () => {
          const m = widget.viewModel.measurement;
          return [m?.horizontalDistance?.text, m?.verticalDistance?.text, m?.horizontalDistance?.value, m?.verticalDistance?.value];
        },
        () => setTextoPendiente(pendiente(widget.viewModel.measurement)),
      );
    }
    return () => {
      manija?.remove();
      if (recuadro) view.ui.remove(recuadro);
      setNodoPendiente(null);
      view.ui.remove(widget);
      widget.destroy();
    };
  }, [herramienta, lista]);

  const alternar = (h: Exclude<Herramienta, null>) => setHerramienta((actual) => (actual === h ? null : h));

  useEffect(() => {
    const view = viewRef.current;
    if (lista && view) aplicarModo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calidad, lista]);

  /** La preferencia se guarda solo cuando el usuario pulsa el botón (no al abrir la vista). */
  const cambiarCalidad = () =>
    setCalidad((c) => {
      const nueva: Calidad = c === 'alta' ? 'auto' : 'alta';
      try {
        localStorage.setItem(CLAVE_CALIDAD, nueva);
      } catch {
        /* sin almacenamiento: se usa el valor por defecto */
      }
      return nueva;
    });

  return (
    <>
      <div ref={containerRef} className={`map scene-3d ${NO_EXPORTAR}`} role="application" aria-label="Escena 3D" />
      {error && <div className="scene-error">{error}</div>}
      {barra &&
        createPortal(
          <div className="scene-tools" role="toolbar" aria-label="Herramientas de medición">
            <button
              type="button"
              className={herramienta === 'distancia' ? 'is-active' : ''}
              aria-pressed={herramienta === 'distancia'}
              title="Medir distancia: directa, horizontal y vertical"
              onClick={() => alternar('distancia')}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 20 L20 4 M4 20 h7 M4 20 v-7" fill="none" stroke="currentColor" strokeWidth="1.8" />
              </svg>
              <span>Distancia</span>
            </button>
            <button
              type="button"
              className={herramienta === 'area' ? 'is-active' : ''}
              aria-pressed={herramienta === 'area'}
              title="Medir área y perímetro"
              onClick={() => alternar('area')}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M5 7 L14 4 L20 12 L12 20 L4 15 Z" fill="currentColor" fillOpacity="0.15" stroke="currentColor" strokeWidth="1.8" />
              </svg>
              <span>Área</span>
            </button>
            {!movil && (
              <button
                type="button"
                className={`scene-quality${calidad === 'alta' ? ' is-active' : ''}`}
                aria-pressed={calidad === 'alta'}
                title={
                  calidad === 'alta'
                    ? 'Calidad alta siempre (más detalle, menos fluida). Clic para calidad automática'
                    : 'Calidad automática: más fluida de cerca y completa de lejos. Clic para calidad alta siempre'
                }
                onClick={cambiarCalidad}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  {/* Velocímetro: modo rápido */}
                  <path d="M4 16a8 8 0 0 1 16 0" fill="none" stroke="currentColor" strokeWidth="1.8" />
                  <path d="M12 16l4.5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
                <span>Calidad {calidad === 'alta' ? 'alta' : 'automática'}</span>
              </button>
            )}
          </div>,
          barra,
        )}
      {nodoPendiente &&
        createPortal(
          <p className="scene-slope" title="Calculada con la medición: arcotangente(vertical ÷ horizontal)">
            Pendiente (calculada): <strong>{textoPendiente ?? '—'}</strong>
          </p>,
          nodoPendiente,
        )}
    </>
  );
}
