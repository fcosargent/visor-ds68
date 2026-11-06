import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { REFERENCE_LAYERS, fileName } from './config/layers';
import { METADATA } from './config/metadata';
import { CONDICIONES, condicionPorCampo } from './config/condiciones';
import { loadAvailableFiles } from './lib/data';
import { loadNormas, type NormasData } from './lib/normas';
import { NO_EXPORTAR, descargarJpg } from './lib/exportImage';
import MapView from './components/MapView';
import ConditionPanel from './components/ConditionPanel';
import MapSummary from './components/MapSummary';
import MapLegend from './components/MapLegend';
import LayerPanel from './components/LayerPanel';
import NormativePanel from './components/NormativePanel';
import SourcesPanel from './components/SourcesPanel';

type Panel = 'normativa' | 'fuentes' | null;

const hoy = () => new Intl.DateTimeFormat('es-CL', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());

export default function App() {
  const [campo, setCampo] = useState(CONDICIONES[0].campo);
  const [activeRefs, setActiveRefs] = useState(
    () => new Set(REFERENCE_LAYERS.filter((l) => l.visibleByDefault).map((l) => l.id)),
  );
  // undefined = informe aún no leído; null = sin informe (se intenta cargar todo).
  const [availableFiles, setAvailableFiles] = useState<Set<string> | null | undefined>(undefined);
  const [failed, setFailed] = useState<Set<string>>(() => new Set());
  const [count, setCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [normas, setNormas] = useState<NormasData | null>(null);
  const mapWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadAvailableFiles().then((files) => {
      if (files) {
        for (const layer of REFERENCE_LAYERS) {
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
    loadNormas()
      .then(setNormas)
      .catch((err) => console.warn(`[Visor DS 68] No se pudieron cargar las normas por zona: ${String(err)}`));
  }, []);

  const isAvailable = useCallback(
    (id: string, url: string) => !failed.has(id) && (availableFiles == null || availableFiles.has(fileName(url))),
    [availableFiles, failed],
  );

  const references = useMemo(() => REFERENCE_LAYERS.filter((l) => isAvailable(l.id, l.url)), [isAvailable]);
  const activeReferences = useMemo(() => references.filter((l) => activeRefs.has(l.id)), [references, activeRefs]);
  const condicion = useMemo(() => condicionPorCampo(campo), [campo]);

  const toggleRef = (id: string) =>
    setActiveRefs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const markUnavailable = useCallback((id: string) => setFailed((prev) => new Set(prev).add(id)), []);
  const closePanel = useCallback(() => setPanel(null), []);

  const exportar = async () => {
    if (!mapWrapRef.current || exporting) return;
    setExporting(true);
    try {
      await descargarJpg(mapWrapRef.current, `DS68_${condicion.campo}.jpg`);
    } catch (err) {
      console.error('[Visor DS 68] No se pudo exportar la imagen:', err);
      alert('No se pudo generar la imagen. Intente nuevamente cuando el mapa termine de cargar.');
    } finally {
      setExporting(false);
    }
  };

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
          <button className="link-button is-primary" onClick={exportar} disabled={exporting || loading}>
            {exporting ? 'Generando imagen…' : 'Descargar imagen (JPG)'}
          </button>
        </nav>
      </header>

      <div className="main">
        <aside className="sidebar">
          <ConditionPanel activa={condicion} onSelect={setCampo} />
          {availableFiles !== undefined && (
            <LayerPanel layers={references} active={activeRefs} onToggle={toggleRef} />
          )}
          <p className="disclaimer">{METADATA.avisoReferencial}</p>
        </aside>

        <div className="map-wrap" ref={mapWrapRef}>
          {availableFiles !== undefined && (
            <MapView
              condicion={condicion}
              references={activeReferences}
              normas={normas}
              onCount={setCount}
              onLoadingChange={setLoading}
              onLayerUnavailable={markUnavailable}
            />
          )}
          <MapSummary condicion={condicion} predios={count} />
          <MapLegend condicion={condicion} references={activeReferences} />
          <div className="north-arrow" aria-label="Norte">
            <svg viewBox="0 0 24 36" aria-hidden="true">
              <path d="M12 2 L20 26 L12 21 L4 26 Z" fill="#33383d" />
              <path d="M12 2 L12 21 L4 26 Z" fill="#8a9097" />
            </svg>
            <span>N</span>
          </div>
          <div className="export-footer">
            {hoy()} · Fuente: {METADATA.fuenteImagen}
          </div>
          {(loading || availableFiles === undefined) && <div className={`loading ${NO_EXPORTAR}`}>Cargando…</div>}
        </div>
      </div>

      {panel === 'normativa' && <NormativePanel activa={condicion} onClose={closePanel} />}
      {panel === 'fuentes' && <SourcesPanel onClose={closePanel} />}
    </div>
  );
}
