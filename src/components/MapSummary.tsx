import { CONFIG, type CondicionActiva } from '../config/condiciones';
import { formatNumber } from '../lib/data';

interface Props {
  condicion: CondicionActiva;
  predios: number | null;
}

const porcentaje = (n: number) => `${new Intl.NumberFormat('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n)}%`;

/** Recuadro sobre el mapa: título, manzanas y porcentaje comunal, y la explicación simple. */
export default function MapSummary({ condicion, predios }: Props) {
  const resumen = CONFIG.textos.resumenManzanas.replace('{total}', formatNumber(CONFIG.totalManzanas));
  return (
    <section
      className="map-summary"
      style={{
        ['--accent' as string]: condicion.grupo.recuadro.acento,
        ['--group-bg' as string]: condicion.grupo.recuadro.fondo,
      }}
    >
      <p className="summary-group">{condicion.grupo.titulo}</p>
      <h2 className="summary-title">{condicion.nombre}</h2>
      <div className="summary-figures">
        <span className="summary-percent">{porcentaje(condicion.porcentaje)}</span>
        <span className="summary-count">
          <strong>{formatNumber(condicion.manzanas)} manzanas</strong> {resumen}
          {predios != null && <span className="summary-predios"> ({formatNumber(predios)} predios)</span>}
        </span>
      </div>
      <p className="summary-text">{condicion.texto}</p>
    </section>
  );
}
