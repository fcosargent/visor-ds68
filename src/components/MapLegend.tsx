import type { LayerConfig } from '../config/layers';
import type { CondicionActiva } from '../config/condiciones';
import FloatingPanel from './FloatingPanel';
import Swatch from './Swatch';

interface Props {
  condicion: CondicionActiva;
  /** Capas encendidas en el orden del panel; `null` marca la posición de la condición activa. */
  items: (LayerConfig | null)[];
}

/** Leyenda dentro del mapa: la condición activa y solo las capas de referencia encendidas. */
export default function MapLegend({ condicion, items }: Props) {
  const s = condicion.grupo.simbologia;
  return (
    <FloatingPanel className="map-legend" ariaLabel="Leyenda" inicial={{ left: 10, bottom: 24 }} anchoBase={270}>
      <h3>Leyenda</h3>
      <ul>
        {items.map((layer) =>
          layer ? (
            <li key={layer.id}>
              <Swatch layer={layer} />
              <span>{layer.label}</span>
            </li>
          ) : (
            <li key="condicion" className="legend-main">
              <Swatch
                layer={{
                  type: 'polygon',
                  style: { color: s.contorno, weight: 1, fillColor: s.relleno, fillOpacity: s.opacidadRelleno },
                }}
              />
              <span>{condicion.nombre}</span>
            </li>
          ),
        )}
      </ul>
    </FloatingPanel>
  );
}
