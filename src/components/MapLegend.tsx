import type { LayerConfig } from '../config/layers';
import { colorRelleno, type CondicionActiva } from '../config/condiciones';
import { formatNumber } from '../lib/data';
import FloatingPanel from './FloatingPanel';
import Swatch from './Swatch';

interface Props {
  condicion: CondicionActiva;
  /** Capas encendidas en el orden del panel; `null` marca la posición de la condición activa. */
  items: (LayerConfig | null)[];
  /** Valores de densidad presentes en la condición activa (solo grupo Densidad). */
  valoresClase: number[] | null;
}

const swatchPoligono = (relleno: string, contorno: string, opacidad: number, grosor: number) => ({
  type: 'polygon' as const,
  style: { color: contorno, weight: grosor, fillColor: relleno, fillOpacity: opacidad },
});

/** Leyenda dentro del mapa: la condición activa y solo las capas de referencia encendidas. */
export default function MapLegend({ condicion, items, valoresClase }: Props) {
  const s = condicion.grupo.simbologia;
  const cl = s.clasificacion;

  const entradaCondicion = cl ? (
    <li key="condicion" className="legend-main legend-classes">
      <span>
        {condicion.nombre}
        <span className="legend-sub">
          {cl.titulo} ({cl.unidad})
        </span>
      </span>
      <ul>
        {(valoresClase ?? cl.clases.map((c) => c.valor)).map((v) => (
          <li key={v}>
            <Swatch layer={swatchPoligono(colorRelleno(condicion, v), s.contorno, s.opacidadRelleno, s.grosor)} />
            <span>{v ? formatNumber(v) : cl.sinValor.etiqueta}</span>
          </li>
        ))}
      </ul>
    </li>
  ) : (
    <li key="condicion" className="legend-main">
      <Swatch layer={swatchPoligono(colorRelleno(condicion), s.contorno, s.opacidadRelleno, s.grosor)} />
      <span>{condicion.nombre}</span>
    </li>
  );

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
            entradaCondicion
          ),
        )}
      </ul>
    </FloatingPanel>
  );
}
