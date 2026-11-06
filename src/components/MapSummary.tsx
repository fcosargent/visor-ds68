import { CONFIG, type CondicionActiva } from '../config/condiciones';
import { formatNumber } from '../lib/data';
import FloatingPanel from './FloatingPanel';

interface Props {
  condicion: CondicionActiva;
  predios: number | null;
}

const porcentaje = (n: number) => `${new Intl.NumberFormat('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n)}%`;

/** Recuadro sobre el mapa: título, manzanas y porcentaje comunal, y la explicación simple. */
export default function MapSummary({ condicion, predios }: Props) {
  const resumen = CONFIG.textos.resumenManzanas.replace('{total}', formatNumber(CONFIG.totalManzanas));
  return (
    <FloatingPanel
      className="map-summary"
      ariaLabel="Resumen de la condición"
      inicial={{ left: 10, top: 10 }}
      anchoBase={300}
      style={{ ['--accent' as string]: condicion.grupo.recuadro.acento }}
    >
      <p className="summary-group">{condicion.grupo.titulo}</p>
      <h2 className="summary-title">{condicion.nombre}</h2>
      <p className="summary-percent">{porcentaje(condicion.porcentaje)}</p>
      <p className="summary-count">
        <strong>{formatNumber(condicion.manzanas)} manzanas</strong> {resumen}
        {predios != null && <span className="summary-predios"> ({formatNumber(predios)} predios)</span>}
      </p>
      <p className="summary-text">{condicion.texto}</p>
    </FloatingPanel>
  );
}
