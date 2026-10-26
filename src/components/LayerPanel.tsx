import { useState } from 'react';
import type { LayerConfig } from '../config/layers';
import Swatch from './Swatch';

interface Props {
  layers: LayerConfig[];
  active: Set<string>;
  onToggle: (id: string) => void;
}

export default function LayerPanel({ layers, active, onToggle }: Props) {
  const [open, setOpen] = useState(true);

  return (
    <section className="block">
      <button className="block-title collapsible" aria-expanded={open} onClick={() => setOpen(!open)}>
        Capas de referencia
        <span className="chevron" aria-hidden="true">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <ul className="layer-list">
          {layers.map((layer) => (
            <li key={layer.id}>
              <label className="toggle" title={layer.description}>
                <input
                  type="checkbox"
                  aria-label={layer.label}
                  checked={active.has(layer.id)}
                  onChange={() => onToggle(layer.id)}
                />
                <Swatch layer={layer} />
                <span>{layer.label}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
