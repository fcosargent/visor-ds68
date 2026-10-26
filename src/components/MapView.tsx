import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Feature, FeatureCollection } from 'geojson';
import { PREDIO_FIELDS, type ConditionConfig, type ConditionId, type LayerConfig } from '../config/layers';
import { METADATA } from '../config/metadata';
import { CARD_UI } from '../config/normativeBenefits';
import { cumpleCondicion } from '../lib/conditions';
import { loadGeoJSON } from '../lib/data';
import { StreetLabelLayer } from '../lib/streetLabels';

interface Props {
  condition: ConditionConfig;
  references: LayerConfig[];
  onCount: (n: number | null) => void;
  onLoadingChange: (loading: boolean) => void;
  onLayerUnavailable: (id: string) => void;
  /** Botón «Ver efectos normativos» del popup predial. */
  onShowEffects: (feature: Feature, condition: ConditionId) => void;
}

interface ActiveLayer {
  config: LayerConfig;
  layer: L.Layer;
}

/** Panel propio para los nombres de calles, sobre las coberturas y sin capturar clics. */
const PANE_CALLES = 'calles';

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function predioPopup(props: Record<string, unknown>, condition: ConditionConfig, onEffects: () => void): HTMLElement {
  const id = props[PREDIO_FIELDS.id];
  const resultado = cumpleCondicion(props, condition.id) ? 'Cumple condición cartográfica' : CARD_UI.notIdentified;
  const fila = (k: string, v: string) => `<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(v)}</td></tr>`;
  const el = document.createElement('div');
  el.className = 'popup';
  el.innerHTML = `
    <table>
      ${fila('Predio', id == null ? 'Sin dato' : String(id))}
      ${fila('Condición activa', condition.buttonLabel)}
      ${fila('Resultado', resultado)}
    </table>`;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'popup-button';
  button.textContent = CARD_UI.popupButton;
  button.addEventListener('click', onEffects);
  const note = document.createElement('p');
  note.className = 'popup-note';
  note.textContent = METADATA.avisoReferencial;
  el.append(button, note);
  return el;
}

function buildLayer(
  config: LayerConfig,
  data: FeatureCollection,
  renderer: L.Renderer,
  condition?: ConditionConfig,
  onEffects?: (feature: Feature) => void,
) {
  const { style } = config;
  const filter = config.filter
    ? (f: Feature) => String(f.properties?.[config.filter!.property] ?? '') === config.filter!.value
    : undefined;
  const interactive = config.category === 'predial' || Boolean(config.tooltip);

  return L.geoJSON(data, {
    filter,
    style: () => ({ ...style, renderer, interactive }),
    pointToLayer: (_f, latlng) =>
      L.circleMarker(latlng, { ...style, radius: style.radius ?? 5, renderer, interactive }),
    onEachFeature: (feature, layer) => {
      const props = (feature.properties ?? {}) as Record<string, unknown>;
      if (condition) {
        layer.bindPopup(() => predioPopup(props, condition, () => onEffects?.(feature)), { maxWidth: 280 });
      } else if (config.tooltip) {
        layer.bindTooltip(escapeHtml(config.tooltip(props)), { direction: 'top', offset: [0, -4] });
      }
    },
  });
}

export default function MapView({
  condition,
  references,
  onCount,
  onLoadingChange,
  onLayerUnavailable,
  onShowEffects,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const rendererRef = useRef<L.Renderer | null>(null);
  const predialRef = useRef<ActiveLayer | null>(null);
  const refsRef = useRef(new Map<string, ActiveLayer>());
  const activeIdsRef = useRef(new Set<string>());
  const pendingRef = useRef(0);
  const firstFitRef = useRef(true);

  // Callbacks en refs para no reiniciar efectos cuando cambian.
  const cb = useRef({ onCount, onLoadingChange, onLayerUnavailable, onShowEffects });
  cb.current = { onCount, onLoadingChange, onLayerUnavailable, onShowEffects };

  const track = <T,>(p: Promise<T>) => {
    pendingRef.current += 1;
    cb.current.onLoadingChange(true);
    return p.finally(() => {
      pendingRef.current -= 1;
      if (pendingRef.current === 0) cb.current.onLoadingChange(false);
    });
  };

  /** Ordena el dibujo según `order` (un único lienzo comparte todas las capas). */
  const reorder = () => {
    const all = [...refsRef.current.values()];
    if (predialRef.current) all.push(predialRef.current);
    all
      .sort((a, b) => a.config.order - b.config.order)
      .forEach((a) => a.layer instanceof L.FeatureGroup && a.layer.bringToFront());
  };

  // Inicialización del mapa.
  useEffect(() => {
    const map = L.map(containerRef.current!, {
      center: METADATA.vistaInicial.centro,
      zoom: METADATA.vistaInicial.zoom,
      zoomControl: true,
      preferCanvas: true,
    });
    L.tileLayer(METADATA.mapaBase.url, {
      attribution: METADATA.mapaBase.atribucion,
      maxNativeZoom: METADATA.mapaBase.zoomNativoMax,
      maxZoom: 20,
    }).addTo(map);
    map.createPane('etiquetas');
    map.getPane('etiquetas')!.style.zIndex = '450';
    map.getPane('etiquetas')!.style.pointerEvents = 'none';
    const etiquetasBase = L.tileLayer(METADATA.mapaBase.urlEtiquetas, {
      pane: 'etiquetas',
      maxNativeZoom: METADATA.mapaBase.zoomNativoMax,
      maxZoom: 20,
    });
    // Se quita la capa (no basta con maxZoom: Leaflet deja las teselas previas ampliadas).
    const ajustarEtiquetasBase = () => {
      const mostrar = map.getZoom() <= METADATA.mapaBase.zoomMaxEtiquetas;
      if (mostrar && !map.hasLayer(etiquetasBase)) etiquetasBase.addTo(map);
      else if (!mostrar && map.hasLayer(etiquetasBase)) map.removeLayer(etiquetasBase);
    };
    map.on('zoomend', ajustarEtiquetasBase);
    ajustarEtiquetasBase();
    map.createPane(PANE_CALLES);
    map.getPane(PANE_CALLES)!.style.zIndex = '460';
    map.getPane(PANE_CALLES)!.style.pointerEvents = 'none';
    L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(map);
    rendererRef.current = L.canvas({ padding: 0.5, tolerance: 3 });
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      predialRef.current = null;
      refsRef.current.clear();
    };
  }, []);

  // Cobertura predial: una sola visible a la vez.
  useEffect(() => {
    const map = mapRef.current!;
    let stale = false;

    if (predialRef.current) {
      map.removeLayer(predialRef.current.layer);
      predialRef.current = null;
    }
    cb.current.onCount(null);

    track(loadGeoJSON(condition.url))
      .then((data) => {
        if (stale) return;
        const layer = buildLayer(condition, data, rendererRef.current!, condition, (f) =>
          cb.current.onShowEffects(f, condition.id),
        ).addTo(map);
        predialRef.current = { config: condition, layer };
        reorder();
        cb.current.onCount(data.features.length);
        const bounds = layer.getBounds();
        if (bounds.isValid()) {
          if (firstFitRef.current) {
            map.fitBounds(bounds, { padding: [16, 16] });
            firstFitRef.current = false;
          } else {
            map.flyToBounds(bounds, { padding: [16, 16], duration: 0.8 });
          }
        }
      })
      .catch((err) => {
        if (stale) return;
        console.warn(`[Visor DS 68] No se pudo cargar «${condition.label}» (${condition.url}): ${String(err)}`);
        cb.current.onLayerUnavailable(condition.id);
      });

    return () => {
      stale = true;
    };
  }, [condition]);

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
          refsRef.current.set(config.id, { config, layer });
          reorder();
        })
        .catch((err) => {
          console.warn(`[Visor DS 68] No se pudo cargar la capa «${config.label}» (${config.url}): ${String(err)}`);
          cb.current.onLayerUnavailable(config.id);
        });
    }
  }, [references]);

  return <div ref={containerRef} className="map" role="application" aria-label="Mapa" />;
}
