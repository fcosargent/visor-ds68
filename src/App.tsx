import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Feature } from 'geojson';
import { CONDITIONS, REFERENCE_LAYERS, fileName, type ConditionId } from './config/layers';
import { METADATA } from './config/metadata';
import { formatNumber, loadAvailableFiles, loadGeoJSON } from './lib/data';
import { intersectsAny } from './lib/geometry';
import MapView from './components/MapView';
import NormativeBenefitsCard from './components/NormativeBenefitsCard';
import LayerPanel from './components/LayerPanel';
import Legend from './components/Legend';
import NormativePanel from './components/NormativePanel';
import SourcesPanel from './components/SourcesPanel';

type Panel = 'normativa' | 'fuentes' | null;

/** Tarjeta de efectos normativos abierta (solo una a la vez). */
interface OpenCard {
  condition: ConditionId;
  featureProperties?: Record<string, unknown>;
  isInHistoricZone?: boolean;
}

const ZCH_LAYER = REFERENCE_LAYERS.find((l) => l.id === 'zch');

export default function App() {
  const [conditionId, setConditionId] = useState<ConditionId>('base');
  const [activeRefs, setActiveRefs] = useState(
    () => new Set(REFERENCE_LAYERS.filter((l) => l.visibleByDefault).map((l) => l.id)),
  );
  // undefined = informe aún no leído; null = sin informe (se intenta cargar todo).
  const [availableFiles, setAvailableFiles] = useState<Set<string> | null | undefined>(undefined);
  const [failed, setFailed] = useState<Set<string>>(() => new Set());
  const [count, setCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [card, setCard] = useState<OpenCard | null>(null);

  useEffect(() => {
    loadAvailableFiles().then((files) => {
      if (files) {
        for (const layer of [...CONDITIONS, ...REFERENCE_LAYERS]) {
          if (!files.has(fileName(layer.url))) {
            console.warn(
              `[Visor DS 68] Capa no disponible: «${layer.label}». Falta public/data/${fileName(layer.url)} ` +
                `(fuente: ${layer.source}). Se oculta su interruptor.`,
            );
          }
        }
      }
      setAvailableFiles(files);
    });
  }, []);

  const isAvailable = useCallback(
    (id: string, url: string) => !failed.has(id) && (availableFiles == null || availableFiles.has(fileName(url))),
    [availableFiles, failed],
  );

  const conditions = useMemo(() => CONDITIONS.filter((c) => isAvailable(c.id, c.url)), [isAvailable]);
  const references = useMemo(() => REFERENCE_LAYERS.filter((l) => isAvailable(l.id, l.url)), [isAvailable]);
  const activeReferences = useMemo(() => references.filter((l) => activeRefs.has(l.id)), [references, activeRefs]);
  const condition = CONDITIONS.find((c) => c.id === conditionId)!;

  const toggleRef = (id: string) =>
    setActiveRefs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const markUnavailable = useCallback((id: string) => setFailed((prev) => new Set(prev).add(id)), []);
  const closePanel = useCallback(() => setPanel(null), []);
  const closeCard = useCallback(() => setCard(null), []);

  const selectCondition = (id: ConditionId) => {
    setConditionId(id);
    setCard({ condition: id });
  };

  // Desde el popup predial: tarjeta de la condición activa, con los campos del predio
  // y el aviso de Zona de Conservación Histórica si el predio la intersecta.
  const showEffects = useCallback(async (feature: Feature, condition: ConditionId) => {
    const featureProperties = (feature.properties ?? {}) as Record<string, unknown>;
    let isInHistoricZone = false;
    if (ZCH_LAYER) {
      try {
        isInHistoricZone = intersectsAny(feature.geometry, await loadGeoJSON(ZCH_LAYER.url));
      } catch (err) {
        console.warn(`[Visor DS 68] No se pudo evaluar la Zona de Conservación Histórica: ${String(err)}`);
      }
    }
    setCard({ condition, featureProperties, isInHistoricZone });
  }, []);

  return (
    <div className="app">
      <header className="topbar">
        <div className="titles">
          <h1>{METADATA.titulo}</h1>
          <p>{METADATA.subtitulo}</p>
        </div>
        <nav className="topbar-actions">
          <button className="link-button" onClick={() => setPanel('normativa')}>Referencia normativa</button>
          <button className="link-button" onClick={() => setPanel('fuentes')}>Fuentes</button>
        </nav>
      </header>

      <div className="main">
        <aside className="sidebar">
          <section className="block">
            <div className="selector" role="radiogroup" aria-label="Condición predial">
              {CONDITIONS.map((c, i) => {
                const enabled = conditions.includes(c);
                return (
                  <button
                    key={c.id}
                    role="radio"
                    aria-checked={c.id === conditionId}
                    className={`selector-option${c.id === conditionId ? ' is-active' : ''}`}
                    style={{ ['--accent' as string]: c.style.color }}
                    disabled={!enabled}
                    title={enabled ? c.label : 'Cobertura no disponible'}
                    onClick={() => selectCondition(c.id)}
                  >
                    <span className="selector-num">{i + 1}</span>
                    {c.buttonLabel}
                  </button>
                );
              })}
            </div>
            {card ? (
              <NormativeBenefitsCard
                condition={card.condition}
                featureProperties={card.featureProperties}
                isInHistoricZone={card.isInHistoricZone}
                onClose={closeCard}
              />
            ) : (
              <p className="explanation">{condition.description}</p>
            )}
            <p className="counter">
              Predios mostrados: <strong>{count == null ? '…' : formatNumber(count)}</strong>
            </p>
          </section>

          {availableFiles !== undefined && (
            <LayerPanel layers={references} active={activeRefs} onToggle={toggleRef} />
          )}
          <Legend condition={condition} references={activeReferences} />
          <p className="disclaimer">{METADATA.avisoReferencial}</p>
        </aside>

        <div className="map-wrap">
          {availableFiles !== undefined && (
            <MapView
              condition={condition}
              references={activeReferences}
              onCount={setCount}
              onLoadingChange={setLoading}
              onLayerUnavailable={markUnavailable}
              onShowEffects={showEffects}
            />
          )}
          {(loading || availableFiles === undefined) && <div className="loading">Cargando…</div>}
        </div>
      </div>

      {panel === 'normativa' && <NormativePanel current={conditionId} onClose={closePanel} />}
      {panel === 'fuentes' && <SourcesPanel onClose={closePanel} />}
    </div>
  );
}
