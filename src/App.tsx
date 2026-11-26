import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GRUPOS_CAPAS, ORDEN_CONDICION, REFERENCE_LAYERS, fileName, type LayerConfig } from './config/layers';
import { METADATA } from './config/metadata';
import { CONDICIONES, condicionPorCampo } from './config/condiciones';
import { loadAvailableFiles } from './lib/data';
import { loadNormas, type NormasData } from './lib/normas';
import { NO_EXPORTAR, descargarJpg } from './lib/exportImage';
import { escribirVista, leerVista, type Encuadre, type Vista } from './lib/vista';
import { esPantallaMovil } from './lib/pantalla';
import MapView from './components/MapView';
import ConditionPanel from './components/ConditionPanel';
import MapSummary from './components/MapSummary';
import MapLegend from './components/MapLegend';
import LayerPanel, { ID_CONDICION, idGrupo, type ItemCapa } from './components/LayerPanel';
import NormativePanel from './components/NormativePanel';
import SourcesPanel from './components/SourcesPanel';

type Panel = 'normativa' | 'fuentes' | null;

// El 3D va en un archivo aparte que solo se descarga al abrir esa vista.
const SceneView3D = lazy(() => import('./components/SceneView3D'));

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
  const [vista, setVista] = useState<Vista>(leerVista);
  const [avisoMovil3d, setAvisoMovil3d] = useState(true);
  /** Último centro y zoom, para conservarlos al cambiar entre 2D y 3D. */
  const encuadreRef = useRef<Encuadre | null>(null);
  const guardarEncuadre = useCallback((e: Encuadre) => (encuadreRef.current = e), []);
  /** Captura de la escena 3D (view.takeScreenshot), para la imagen JPG. */
  const capturaRef = useRef<(() => Promise<string>) | null>(null);
  const registrarCaptura = useCallback((c: (() => Promise<string>) | null) => (capturaRef.current = c), []);

  useEffect(() => escribirVista(vista), [vista]);

  useEffect(() => {
    loadAvailableFiles().then((files) => {
      if (files) {
        for (const layer of REFERENCE_LAYERS) {
          if (!layer.escena3d && !files.has(fileName(layer.url))) {
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
    (l: LayerConfig) =>
      !failed.has(l.id) && (l.escena3d || availableFiles == null || availableFiles.has(fileName(l.url))),
    [availableFiles, failed],
  );

  // Las capas externas del 3D (edificaciones) no aparecen en el 2D.
  const references = useMemo(
    () => REFERENCE_LAYERS.filter((l) => isAvailable(l) && (vista === '3d' || !l.escena3d)),
    [isAvailable, vista],
  );
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
    // En 3D, la escena (WebGL) se captura con view.takeScreenshot y se pone en su lugar mientras se
    // genera la imagen, para que el JPG incluya igual los cuadros, la leyenda y el pie.
    let captura: HTMLImageElement | null = null;
    try {
      if (vista === '3d') {
        if (!capturaRef.current) throw new Error('la escena 3D aún no está lista');
        captura = document.createElement('img');
        captura.className = 'scene-shot';
        captura.src = await capturaRef.current();
        await captura.decode();
        mapWrapRef.current.prepend(captura);
      }
      await descargarJpg(mapWrapRef.current, `DS68_${condicion.campo}${vista === '3d' ? '_3D' : ''}.jpg`);
    } catch (err) {
      console.error('[Visor DS 68] No se pudo exportar la imagen:', err);
      alert('No se pudo generar la imagen. Intente nuevamente cuando el mapa termine de cargar.');
    } finally {
      captura?.remove();
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
          <div className="view-switch" role="group" aria-label="Tipo de visualizador">
            {(['2d', '3d'] as const).map((v) => (
              <button
                key={v}
                type="button"
                className={vista === v ? 'is-active' : ''}
                aria-pressed={vista === v}
                onClick={() => setVista(v)}
              >
                Visualizador {v.toUpperCase()}
              </button>
            ))}
          </div>
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
          {availableFiles !== undefined &&
            (vista === '2d' ? (
              <MapView
                condicion={condicion}
                references={activeReferences}
                ordenes={ordenes}
                normas={normas}
                onCount={setCount}
                onValoresClase={setValoresClase}
                onLoadingChange={setLoading}
                onLayerUnavailable={markUnavailable}
                encuadreInicial={encuadreRef.current}
                onEncuadre={guardarEncuadre}
              />
            ) : (
              <Suspense fallback={<div className={`loading ${NO_EXPORTAR}`}>Cargando vista 3D…</div>}>
                <SceneView3D
                  condicion={condicion}
                  references={activeReferences}
                  ordenes={ordenes}
                  normas={normas}
                  onCount={setCount}
                  onValoresClase={setValoresClase}
                  onLoadingChange={setLoading}
                  onLayerUnavailable={markUnavailable}
                  encuadreInicial={encuadreRef.current}
                  onEncuadre={guardarEncuadre}
                  registrarCaptura={registrarCaptura}
                />
              </Suspense>
            ))}
          <MapSummary condicion={condicion} predios={count} />
          <MapLegend condicion={condicion} items={itemsLeyenda} valoresClase={valoresClase} />
          {/* En 3D la orientación la indica la brújula de la escena. */}
          {vista === '2d' && (
          <div className="north-arrow" aria-label="Norte">
            <svg viewBox="0 0 24 36" aria-hidden="true">
              <path d="M12 2 L20 26 L12 21 L4 26 Z" fill="#33383d" />
              <path d="M12 2 L12 21 L4 26 Z" fill="#8a9097" />
            </svg>
            <span>N</span>
          </div>
          )}
          {vista === '3d' && avisoMovil3d && esPantallaMovil() && (
            <div className={`aviso-3d ${NO_EXPORTAR}`} role="status">
              <span>La vista 3D puede funcionar lenta en celulares.</span>
              <button type="button" aria-label="Cerrar aviso" title="Cerrar aviso" onClick={() => setAvisoMovil3d(false)}>
                ×
              </button>
            </div>
          )}
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
