// Visualizador 3D: la misma información del mapa 2D (condición activa, capas de referencia,
// conteos y ventanas emergentes) sobre una escena de ArcGIS con las edificaciones de la comuna.
// Recibe las mismas propiedades que MapView; el panel, los cuadros y la leyenda son los del 2D.
// El SDK de ArcGIS se descarga del CDN solo cuando se abre esta vista (ver lib/arcgis.ts).

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Feature, Geometry, Position } from 'geojson';
import { EDIFICIOS_3D, PREDIOS_URL, REFERENCE_LAYERS, type LayerConfig } from '../config/layers';
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

/** Inclinación de la cámara al abrir (0 = vista cenital). */
const INCLINACION = 55;
/** Zoom con que la vista oblicua inicial abarca toda la comuna. */
const ZOOM_COMUNA = 14;
/** Los predios se dibujan algo más transparentes que en 2D, para distinguirlos bajo los edificios. */
const FACTOR_OPACIDAD_3D = 0.8;
/** Opacidad de los volúmenes de edificios. */
const OPACIDAD_EDIFICIOS = 0.75;
/** Escala desde la que se muestran los nombres de calles (equivale aprox. al zoom 16 del 2D). */
const ESCALA_NOMBRES_CALLES = 12000;
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
  Polygon: 'geometry/Polygon',
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
    etiquetas?: Esri[];
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
    labelingInfo: opciones.etiquetas,
    labelsVisible: Boolean(opciones.etiquetas),
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
  if (config.type === 'label') {
    return { type: 'simple', symbol: { type: 'simple-marker', size: 0, color: [0, 0, 0, 0], outline: { width: 0 } } };
  }
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

/** Nombres de calles: puntos invisibles con su etiqueta (en 3D las etiquetas no se giran). */
function etiquetasCalles(config: LayerConfig): Esri[] {
  return [
    {
      labelExpressionInfo: { expression: '$feature.nombre' },
      // Sobre el terreno ArcGIS solo admite etiquetas centradas en el punto.
      labelPlacement: 'center-center',
      minScale: ESCALA_NOMBRES_CALLES,
      symbol: {
        type: 'label-3d',
        symbolLayers: [
          {
            type: 'text',
            material: { color: rgba(config.style.color) },
            halo: { color: [255, 255, 255, 0.9], size: 1 },
            font: { weight: 'bold' },
            size: 8,
          },
        ],
      },
    },
  ];
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
    campos: config.type === 'label' ? [{ name: 'nombre', type: 'string' }] : undefined,
    atributos: config.type === 'label' ? (p) => ({ nombre: String(p.nombre ?? '') }) : undefined,
    etiquetas: config.type === 'label' ? etiquetasCalles(config) : undefined,
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

/**
 * Edificaciones 3D, recortadas con un SceneFilter («contains») al límite comunal ampliado
 * EDIFICIOS_3D.bufferRecorteMetros (ver config/layers.ts).
 */
async function capaEdificios(E: Modulos, limiteGeojson: Esri | null) {
  let limite: Esri = null;
  if (limiteGeojson) {
    const poligono = new E.Polygon(limiteGeojson);
    await E.geodesicBufferOperator.load?.();
    limite = E.geodesicBufferOperator.execute(poligono, EDIFICIOS_3D.bufferRecorteMetros, { unit: 'meters' }) ?? poligono;
  }
  const capa = new E.SceneLayer({
    url: EDIFICIOS_3D.url,
    title: 'Edificaciones 3D',
    renderer: {
      type: 'simple',
      symbol: {
        type: 'mesh-3d',
        symbolLayers: [
          {
            type: 'fill',
            // Algo transparentes, para que se vean los predios de la condición bajo los edificios.
            material: { color: [238, 239, 241, OPACIDAD_EDIFICIOS], colorMixMode: 'replace' },
            edges: { type: 'solid', color: [80, 86, 92, 0.55], size: 0.6 },
          },
        ],
      },
    },
    filter: limite ? new E.SceneFilter({ geometries: [limite], spatialRelationship: 'contains' }) : undefined,
  });
  await capa.load();
  const existentes = new Set((capa.fields ?? []).map((f: Esri) => f.name));
  const campos = EDIFICIOS_3D.campos.filter((c) => existentes.has(c.campo));
  capa.outFields = campos.map((c) => c.campo);
  // Tabla con el mismo formato de las fichas del 2D; se omiten los campos vacíos, en 0 o «unknown».
  const valor = (campo: string, v: unknown): string | null => {
    if (v == null || v === '' || v === 0 || v === 'unknown') return null;
    if (campo === 'height' && typeof v === 'number') return `${formatearNumero(v, 1)} m`;
    if (campo === 'building_levels' && typeof v === 'number') return formatearNumero(v, 0);
    if (campo === 'OSMID') return String(Math.round(Number(v)));
    return String(v);
  };
  capa.popupTemplate = {
    title: (e: Esri) => String(e.graphic?.attributes?.name || 'Edificación'),
    outFields: campos.map((c) => c.campo),
    content: (e: Esri) => {
      const at = e.graphic?.attributes ?? {};
      const filas = campos
        .map((c) => [c.alias.replace(' (m)', ''), valor(c.campo, at[c.campo])] as const)
        .filter(([, v]) => v !== null)
        .map(([a, v]) => `<tr><th>${escapar(a)}</th><td>${escapar(v!)}</td></tr>`)
        .join('');
      return contenidoHtml(
        `<div class="popup popup-ficha"><table class="popup-table">${filas || '<tr><td>Sin atributos informados.</td></tr>'}</table>` +
          `<p class="popup-note">${escapar(EDIFICIOS_3D.nota)}</p></div>`,
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

  const track = <T,>(p: Promise<T>) => {
    pendingRef.current += 1;
    cb.current.onLoadingChange(true);
    return p.finally(() => {
      pendingRef.current -= 1;
      if (pendingRef.current === 0) cb.current.onLoadingChange(false);
    });
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
          qualityProfile: esPantallaMovil() ? 'low' : 'medium',
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
        view.map.remove(active.layer);
        refsRef.current.delete(id);
      }
    }
    for (const config of references) {
      if (refsRef.current.has(config.id)) continue;
      const crear = config.escena3d
        ? (async () => {
            const limite = REFERENCE_LAYERS.find((l) => l.id === 'limite_comunal');
            const data = limite ? await loadGeoJSON(limite.url).catch(() => null) : null;
            return capaEdificios(E, geometria(data?.features[0]?.geometry ?? null));
          })()
        : loadGeoJSON(config.url).then((data) => capaReferencia(E, config, data.features));
      track(crear)
        .then((layer) => {
          if (!viewRef.current || !activeIdsRef.current.has(config.id) || refsRef.current.has(config.id)) return;
          view.map.add(layer);
          refsRef.current.set(config.id, { id: config.id, layer });
          reorder();
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
