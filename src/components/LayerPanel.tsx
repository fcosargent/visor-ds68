import { useState } from 'react';
import type { LayerConfig } from '../config/layers';
import type { CondicionActiva } from '../config/condiciones';
import Swatch from './Swatch';

interface Props {
  /** Capas en el orden de dibujo (la primera queda arriba); `null` es la condición activa. */
  items: (LayerConfig | null)[];
  condicion: CondicionActiva;
  active: Set<string>;
  onToggle: (id: string) => void;
  /** Mueve una capa una posición: -1 = subir, +1 = bajar. */
  onMove: (id: string, paso: -1 | 1) => void;
}

/** Id con que la condición activa participa del orden de capas. */
export const ID_CONDICION = '__condicion';

export default function LayerPanel({ items, condicion, active, onToggle, onMove }: Props) {
  const [open, setOpen] = useState(true);
  const s = condicion.grupo.simbologia;

  return (
    <section className="block">
      <button className="block-title collapsible" aria-expanded={open} onClick={() => setOpen(!open)}>
        Capas de referencia
        <span className="chevron" aria-hidden="true">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <>
          <p className="layer-hint">Las capas de más arriba se dibujan encima. Use ▲ ▼ para cambiar el orden.</p>
          <ul className="layer-list">
            {items.map((layer, i) => {
              const id = layer?.id ?? ID_CONDICION;
              const nombre = layer?.label ?? 'Predios de la condición seleccionada';
              return (
                <li key={id} className={layer ? '' : 'is-condition'}>
                  <label className="toggle" title={layer?.description ?? condicion.nombre}>
                    {layer ? (
                      <input
                        type="checkbox"
                        aria-label={layer.label}
                        checked={active.has(layer.id)}
                        onChange={() => onToggle(layer.id)}
                      />
                    ) : (
                      <input type="checkbox" aria-label={nombre} checked disabled />
                    )}
                    <Swatch
                      layer={
                        layer ?? {
                          type: 'polygon',
                          style: { color: s.contorno, weight: 1, fillColor: s.relleno, fillOpacity: s.opacidadRelleno },
                        }
                      }
                    />
                    <span>{nombre}</span>
                  </label>
                  <span className="order-buttons">
                    <button aria-label={`Subir ${nombre}`} disabled={i === 0} onClick={() => onMove(id, -1)}>
                      ▲
                    </button>
                    <button aria-label={`Bajar ${nombre}`} disabled={i === items.length - 1} onClick={() => onMove(id, 1)}>
                      ▼
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
