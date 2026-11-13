import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GRUPOS_CAPAS, ORDEN_CONDICION, REFERENCE_LAYERS, fileName, type LayerConfig } from './config/layers';
import { METADATA } from './config/metadata';
import { CONDICIONES, condicionPorCampo } from './config/condiciones';
import { loadAvailableFiles } from './lib/data';
import { loadNormas, type NormasData } from './lib/normas';
import { NO_EXPORTAR, descargarJpg } from './lib/exportImage';
import MapView from './components/MapView';
import ConditionPanel from './components/ConditionPanel';
import MapSummary from './components/MapSummary';
import MapLegend from './components/MapLegend';
import LayerPanel, { ID_CONDICION, idGrupo, type ItemCapa } from './components/LayerPanel';
import NormativePanel from './components/NormativePanel';
import SourcesPanel from './components/SourcesPanel';

type Panel = 'normativa' | 'fuentes' | null;

/**
 * Orden inicial del panel (de arriba hacia abajo), según `order` de layers.ts. Las capas de
 * un grupo ocupan una sola posición (el grupo), con el `order` de su capa más alta.
 */
const ORDEN_INICIAL = [
  ...REFERENCE_LAYERS.filter((l) => !l.grupo).map((l) => ({ id: l.id, order: l.order })),
  ...GRUPOS_CAPAS.map((g) => ({
    id: idGrupo(g.id),
    order: Math.max(...REFERENCE_LAYERS.filter((l) => l.grupo === g.id).map((l) => l.order)),
  })),
  { id: ID_CONDICION, order: ORDEN_CONDICION },
]
  .sort((a, b) => b.order - a.order)
  .map((l) => l.id);

/** Capas de un grupo, de arriba hacia abajo según su `order`. */
const capasDelGrupo = (grupo: string, capas: LayerConfig[]) =>
  capas.filter((l) => l.grupo === grupo).sort((a, b) => b.order - a.order);

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
  const [valoresClase, setValoresClase] = useState<number[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [normas, setNormas] = useState<NormasData | null>(null);
  const [orden, setOrden] = useState<string[]>(ORDEN_INICIAL);
  const [gruposActivos, setGruposActivos] = useState(
    () => new Set(GRUPOS_CAPAS.filter((g) => g.visibleByDefault).map((g) => g.id)),
  );
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
  /** Una capa se ve si está encendida y, si pertenece a un grupo, el grupo también lo está. */
  const seVe = useCallback(
    (l: LayerConfig) => activeRefs.has(l.id) && (!l.grupo || gruposActivos.has(l.grupo)),
    [activeRefs, gruposActivos],
  );
  const activeReferences = useMemo(() => references.filter(seVe), [references, seVe]);
  const condicion = useMemo(() => condicionPorCampo(campo), [campo]);

  // Elementos del panel en su orden: capas sueltas, grupos y la condición activa.
  const items = useMemo(
    () =>
      orden
        .map((id): ItemCapa | null => {
          if (id === ID_CONDICION) return { tipo: 'condicion' };
          const grupo = GRUPOS_CAPAS.find((g) => idGrupo(g.id) === id);
          if (grupo) {
            const capas = capasDelGrupo(grupo.id, references);
            return capas.length ? { tipo: 'grupo', grupo, capas } : null;
          }
          const capa = references.find((l) => l.id === id);
          return capa ? { tipo: 'capa', capa } : null;
        })
        .filter((i): i is ItemCapa => i !== null),
    [orden, references],
  );
  // Leyenda: capas visibles en el orden del panel; null = predios de la condición activa.
  const itemsLeyenda = useMemo(
    () =>
      items.flatMap((i): (LayerConfig | null)[] =>
        i.tipo === 'condicion' ? [null] : i.tipo === 'grupo' ? i.capas.filter(seVe) : seVe(i.capa) ? [i.capa] : [],
      ),
    [items, seVe],
  );
  // Orden de dibujo: las capas de un grupo quedan juntas, en su orden interno.
  const ordenes = useMemo(() => {
    const resultado: Record<string, number> = {};
    orden.forEach((id, i) => {
      const valor = orden.length - i;
      const grupo = GRUPOS_CAPAS.find((g) => idGrupo(g.id) === id);
      if (grupo) capasDelGrupo(grupo.id, REFERENCE_LAYERS).forEach((l, j) => (resultado[l.id] = valor - j * 0.01));
      else resultado[id] = valor;
    });
    return resultado;
  }, [orden]);

  const toggleGrupo = (id: string) =>
    setGruposActivos((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  /** Sube o baja una capa o grupo, intercambiándolo con su vecino visible en el panel. */
  const moverCapa = (id: string, paso: -1 | 1) => {
    const visibles = items.map((i) => (i.tipo === 'condicion' ? ID_CONDICION : i.tipo === 'grupo' ? idGrupo(i.grupo.id) : i.capa.id));
    const vecina = visibles[visibles.indexOf(id) + paso];
    if (!vecina) return;
    setOrden((prev) => {
      const next = [...prev];
      const a = next.indexOf(id);
      const b = next.indexOf(vecina);
      [next[a], next[b]] = [next[b], next[a]];
      return next;
    });
  };

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
            <LayerPanel
              items={items}
              condicion={condicion}
              active={activeRefs}
              gruposActivos={gruposActivos}
              onToggle={toggleRef}
              onToggleGrupo={toggleGrupo}
              onMove={moverCapa}
            />
          )}
          <p className="disclaimer">{METADATA.avisoReferencial}</p>
        </aside>

        <div className="map-wrap" ref={mapWrapRef}>
          {availableFiles !== undefined && (
            <MapView
              condicion={condicion}
              references={activeReferences}
              ordenes={ordenes}
              normas={normas}
              onCount={setCount}
              onValoresClase={setValoresClase}
              onLoadingChange={setLoading}
              onLayerUnavailable={markUnavailable}
            />
          )}
          <MapSummary condicion={condicion} predios={count} />
          <MapLegend condicion={condicion} items={itemsLeyenda} valoresClase={valoresClase} />
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
