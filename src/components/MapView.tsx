import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Feature, FeatureCollection } from 'geojson';
import { PREDIOS_URL, type LayerConfig } from '../config/layers';
import { METADATA } from '../config/metadata';
import { colorRelleno, type CondicionActiva } from '../config/condiciones';
import { agregarMapaBase } from '../lib/basemap';
import { loadGeoJSON } from '../lib/data';
import type { NormasData, PredioProps } from '../lib/normas';
import { fichaPopup, predioPopup } from '../lib/popup';
import { StreetLabelLayer } from '../lib/streetLabels';
import { ID_CONDICION } from './LayerPanel';

interface Props {
  condicion: CondicionActiva;
  references: LayerConfig[];
  /** Orden de dibujo por id de capa (mayor = más arriba); incluye ID_CONDICION. */
  ordenes: Record<string, number>;
  normas: NormasData | null;
  onCount: (n: number | null) => void;
  /** Valores de densidad presentes en la condición activa (para la leyenda); null si no aplica. */
  onValoresClase: (valores: number[] | null) => void;
  onLoadingChange: (loading: boolean) => void;
  onLayerUnavailable: (id: string) => void;
}

interface ActiveLayer {
  id: string;
  layer: L.Layer;
}

/** Panel propio para los nombres de calles, sobre las coberturas y sin capturar clics. */
const PANE_CALLES = 'calles';

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function buildLayer(config: LayerConfig, data: FeatureCollection, renderer: L.Renderer) {
  const { style } = config;
  const filter = config.filter
    ? (f: Feature) => String(f.properties?.[config.filter!.property] ?? '') === config.filter!.value
    : undefined;
  const interactive = Boolean(config.tooltip || config.ficha);

  return L.geoJSON(data, {
    filter,
    style: () => ({ ...style, renderer, interactive }),
    pointToLayer: (_f, latlng) =>
      L.circleMarker(latlng, { ...style, radius: style.radius ?? 5, renderer, interactive }),
    onEachFeature: (feature, layer) => {
      const props = (feature.properties ?? {}) as Record<string, unknown>;
      if (config.ficha) {
        const ficha = config.ficha;
        layer.bindPopup(() => fichaPopup(ficha, props), { maxWidth: 340, minWidth: 280 });
      } else if (config.tooltip) {
        layer.bindTooltip(escapeHtml(config.tooltip(props)), { direction: 'top', offset: [0, -4] });
      }
    },
  });
}

/** Predios que cumplen la condición activa, con la simbología de su grupo. */
function buildCondicionLayer(
  condicion: CondicionActiva,
  data: FeatureCollection,
  renderer: L.Renderer,
  normas: () => NormasData | null,
) {
  const s = condicion.grupo.simbologia;
  return L.geoJSON(data, {
    filter: (f) => ((f.properties as PredioProps | null)?.cond ?? []).includes(condicion.campo),
    style: (f) => ({
      renderer,
      color: s.contorno,
      weight: s.grosor,
      fillColor: colorRelleno(s, (f?.properties as PredioProps | undefined)?.d),
      fillOpacity: s.opacidadRelleno,
    }),
    onEachFeature: (feature, layer) => {
      layer.bindPopup(() => predioPopup(feature.properties as PredioProps, condicion, normas()), {
        maxWidth: 320,
        minWidth: 260,
      });
    },
  });
}

export default function MapView({
  condicion,
  references,
  ordenes,
  normas,
  onCount,
  onValoresClase,
  onLoadingChange,
  onLayerUnavailable,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const rendererRef = useRef<L.Renderer | null>(null);
  const condicionRef = useRef<ActiveLayer | null>(null);
  const refsRef = useRef(new Map<string, ActiveLayer>());
  const activeIdsRef = useRef(new Set<string>());
  const pendingRef = useRef(0);
  const firstFitRef = useRef(true);
  const normasRef = useRef(normas);
  normasRef.current = normas;
  const ordenesRef = useRef(ordenes);
  ordenesRef.current = ordenes;

  // Callbacks en refs para no reiniciar efectos cuando cambian.
  const cb = useRef({ onCount, onValoresClase, onLoadingChange, onLayerUnavailable });
  cb.current = { onCount, onValoresClase, onLoadingChange, onLayerUnavailable };

  const track = <T,>(p: Promise<T>) => {
    pendingRef.current += 1;
    cb.current.onLoadingChange(true);
    return p.finally(() => {
      pendingRef.current -= 1;
      if (pendingRef.current === 0) cb.current.onLoadingChange(false);
    });
  };

  /** Ordena el dibujo según el orden del panel (un único lienzo comparte todas las capas). */
  const reorder = () => {
    const all = [...refsRef.current.values()];
    if (condicionRef.current) all.push(condicionRef.current);
    const orden = (a: ActiveLayer) => ordenesRef.current[a.id] ?? 0;
    all
      .sort((a, b) => orden(a) - orden(b))
      .forEach((a) => a.layer instanceof L.FeatureGroup && a.layer.bringToFront());
  };

  // Inicialización del mapa.
  useEffect(() => {
    const map = L.map(containerRef.current!, {
      center: METADATA.vistaInicial.centro,
      zoom: METADATA.vistaInicial.zoom,
      zoomControl: false,
      preferCanvas: true,
    });
    // Zoom a la derecha: la columna izquierda queda para el resumen y la leyenda.
    L.control.zoom({ position: 'topright' }).addTo(map);
    // Mapa base sin textos (ver lib/basemap.ts).
    agregarMapaBase(map, () => mapRef.current === map);
    map.createPane(PANE_CALLES);
    map.getPane(PANE_CALLES)!.style.zIndex = '460';
    map.getPane(PANE_CALLES)!.style.pointerEvents = 'none';
    L.control.scale({ imperial: false, position: 'bottomright' }).addTo(map);
    rendererRef.current = L.canvas({ padding: 0.5, tolerance: 3 });
    mapRef.current = map;
    // Solo en desarrollo: acceso al mapa desde la consola para pruebas (no se incluye en la publicación).
    if (import.meta.env.DEV) (window as unknown as { __mapa: L.Map }).__mapa = map;
    return () => {
      map.remove();
      mapRef.current = null;
      condicionRef.current = null;
      refsRef.current.clear();
    };
  }, []);

  // Condición activa: una sola visible a la vez. La vista se ajusta solo en la primera carga,
  // para que el encuadre elegido se mantenga al cambiar de condición (útil al exportar).
  useEffect(() => {
    const map = mapRef.current!;
    let stale = false;

    if (condicionRef.current) {
      map.removeLayer(condicionRef.current.layer);
      condicionRef.current = null;
    }
    cb.current.onCount(null);

    track(loadGeoJSON(PREDIOS_URL))
      .then((data) => {
        if (stale) return;
        const layer = buildCondicionLayer(condicion, data, rendererRef.current!, () => normasRef.current).addTo(map);
        condicionRef.current = { id: ID_CONDICION, layer };
        reorder();
        const predios = layer.getLayers() as L.Path[];
        cb.current.onCount(predios.length);
        cb.current.onValoresClase(
          condicion.grupo.simbologia.clasificacion
            ? [...new Set(predios.map((p) => ((p as L.Polygon).feature?.properties as PredioProps).d ?? 0))].sort((a, b) => a - b)
            : null,
        );
        if (firstFitRef.current) {
          const bounds = layer.getBounds();
          if (bounds.isValid()) map.fitBounds(bounds, { padding: [16, 16] });
          firstFitRef.current = false;
        }
      })
      .catch((err) => {
        if (stale) return;
        console.warn(`[Visor DS 68] No se pudieron cargar los predios (${PREDIOS_URL}): ${String(err)}`);
      });

    return () => {
      stale = true;
    };
  }, [condicion]);

  // Capas de referencia: se cargan al encenderlas y se mantienen al cambiar de condición.
  useEffect(() => {
    const map = mapRef.current!;
    const wanted = new Set(references.map((r) => r.id));
    activeIdsRef.current = wanted;

    for (const [id, active] of refsRef.current) {
      if (!wanted.has(id)) {
        map.removeLayer(active.layer);
        refsRef.current.delete(id);
      }
    }

    for (const config of references) {
      if (refsRef.current.has(config.id)) continue;
      track(loadGeoJSON(config.url))
        .then((data) => {
          const current = mapRef.current;
          if (!current || !activeIdsRef.current.has(config.id) || refsRef.current.has(config.id)) return;
          const layer =
            config.type === 'label'
              ? new StreetLabelLayer(data, {
                  minZoom: config.minZoom ?? 0,
                  color: config.style.color,
                  pane: PANE_CALLES,
                }).addTo(current)
              : buildLayer(config, data, rendererRef.current!).addTo(current);
          refsRef.current.set(config.id, { id: config.id, layer });
          reorder();
        })
        .catch((err) => {
          console.warn(`[Visor DS 68] No se pudo cargar la capa «${config.label}» (${config.url}): ${String(err)}`);
          cb.current.onLayerUnavailable(config.id);
        });
    }
  }, [references]);

  // Cambio de orden en el panel de capas.
  useEffect(() => {
    reorder();
  }, [ordenes]);

  return <div ref={containerRef} className="map" role="application" aria-label="Mapa" />;
}
