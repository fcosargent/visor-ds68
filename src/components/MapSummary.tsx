import { useState } from 'react';
import { CONFIG, type CondicionActiva } from '../config/condiciones';
import { formatNumber } from '../lib/data';
import { NO_EXPORTAR } from '../lib/exportImage';
import { esPantallaMovil } from '../lib/pantalla';
import FloatingPanel from './FloatingPanel';

interface Props {
  condicion: CondicionActiva;
  predios: number | null;
}

const porcentaje = (n: number) => `${new Intl.NumberFormat('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n)}%`;

/**
 * Recuadro sobre el mapa: título, manzanas y porcentaje comunal, y la explicación simple.
 * En celular la explicación queda oculta tras «Ver descripción».
 */
export default function MapSummary({ condicion, predios }: Props) {
  const [movil] = useState(esPantallaMovil);
  const [verDescripcion, setVerDescripcion] = useState(false);
  const resumen = CONFIG.textos.resumenManzanas.replace('{total}', formatNumber(CONFIG.totalManzanas));
  return (
    <FloatingPanel
      className="map-summary"
      ariaLabel="Resumen de la condición"
      inicial={{ left: 10, top: 10 }}
      anchoBase={300}
      tituloBarra={`${condicion.nombre} · ${porcentaje(condicion.porcentaje)}`}
      etiquetaReabrir="Mostrar condición"
      claveReapertura={condicion.campo}
      style={{ ['--accent' as string]: condicion.grupo.recuadro.acento }}
    >
      <p className="summary-group">{condicion.grupo.titulo}</p>
      <h2 className="summary-title">{condicion.nombre}</h2>
      <p className="summary-percent">{porcentaje(condicion.porcentaje)}</p>
      <p className="summary-count">
        <strong>{formatNumber(condicion.manzanas)} manzanas</strong> {resumen}
        {predios != null && <span className="summary-predios"> ({formatNumber(predios)} predios)</span>}
      </p>
      {(!movil || verDescripcion) && <p className="summary-text">{condicion.texto}</p>}
      {movil && (
        <button
          type="button"
          className={`summary-toggle ${NO_EXPORTAR}`}
          aria-expanded={verDescripcion}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => setVerDescripcion((v) => !v)}
        >
          {verDescripcion ? 'Ocultar descripción' : 'Ver descripción'}
        </button>
      )}
    </FloatingPanel>
  );
}
