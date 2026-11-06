import type { LayerConfig } from '../config/layers';
import type { CondicionActiva } from '../config/condiciones';
import Swatch from './Swatch';

interface Props {
  condicion: CondicionActiva;
  references: LayerConfig[];
}

/** Leyenda dentro del mapa: la condición activa y solo las capas de referencia encendidas. */
export default function MapLegend({ condicion, references }: Props) {
  const s = condicion.grupo.simbologia;
  return (
    <section className="map-legend" aria-label="Leyenda">
      <h3>Leyenda</h3>
      <ul>
        <li className="legend-main">
          <Swatch
            layer={{ type: 'polygon', style: { color: s.contorno, weight: 1, fillColor: s.relleno, fillOpacity: s.opacidadRelleno } }}
          />
          <span>{condicion.nombre}</span>
        </li>
        {references.map((layer) => (
          <li key={layer.id}>
            <Swatch layer={layer} />
            <span>{layer.label}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
