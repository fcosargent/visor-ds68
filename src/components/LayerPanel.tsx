import { useState, type ReactNode } from 'react';
import type { GrupoCapas, LayerConfig } from '../config/layers';
import { colorRelleno, type CondicionActiva } from '../config/condiciones';
import Swatch from './Swatch';

/** Elemento del panel: una capa suelta, un grupo de capas o los predios de la condición activa. */
export type ItemCapa =
  | { tipo: 'capa'; capa: LayerConfig }
  | { tipo: 'grupo'; grupo: GrupoCapas; capas: LayerConfig[] }
  | { tipo: 'condicion' };

interface Props {
  /** Elementos en el orden de dibujo (el primero queda arriba). */
  items: ItemCapa[];
  condicion: CondicionActiva;
  active: Set<string>;
  gruposActivos: Set<string>;
  onToggle: (id: string) => void;
  onToggleGrupo: (id: string) => void;
  /** Mueve una capa o grupo una posición: -1 = subir, +1 = bajar. */
  onMove: (id: string, paso: -1 | 1) => void;
}

/** Id con que la condición activa participa del orden de capas. */
export const ID_CONDICION = '__condicion';
/** Id con que un grupo participa del orden de capas. */
export const idGrupo = (grupo: string) => `__grupo:${grupo}`;

const idDe = (item: ItemCapa) =>
  item.tipo === 'condicion' ? ID_CONDICION : item.tipo === 'grupo' ? idGrupo(item.grupo.id) : item.capa.id;

export default function LayerPanel({ items, condicion, active, gruposActivos, onToggle, onToggleGrupo, onMove }: Props) {
  const [open, setOpen] = useState(true);
  const s = condicion.grupo.simbologia;

  const botonesOrden = (id: string, nombre: string, i: number) => (
    <span className="order-buttons">
      <button aria-label={`Subir ${nombre}`} disabled={i === 0} onClick={() => onMove(id, -1)}>
        ▲
      </button>
      <button aria-label={`Bajar ${nombre}`} disabled={i === items.length - 1} onClick={() => onMove(id, 1)}>
        ▼
      </button>
    </span>
  );

  const filaCapa = (capa: LayerConfig, extra?: ReactNode) => (
    <label className="toggle" title={capa.description}>
      <input type="checkbox" aria-label={capa.label} checked={active.has(capa.id)} onChange={() => onToggle(capa.id)} />
      <Swatch layer={capa} />
      <span>{capa.label}</span>
      {extra}
    </label>
  );

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
            {items.map((item, i) => {
              const id = idDe(item);
              if (item.tipo === 'condicion') {
                const nombre = 'Predios de la condición seleccionada';
                return (
                  <li key={id} className="is-condition">
                    <label className="toggle" title={condicion.nombre}>
                      <input type="checkbox" aria-label={nombre} checked disabled />
                      <Swatch
                        layer={{
                          type: 'polygon',
                          style: { color: s.contorno, weight: s.grosor, fillColor: colorRelleno(condicion), fillOpacity: s.opacidadRelleno },
                        }}
                      />
                      <span>{nombre}</span>
                    </label>
                    {botonesOrden(id, nombre, i)}
                  </li>
                );
              }
              if (item.tipo === 'grupo') {
                const encendido = gruposActivos.has(item.grupo.id);
                return (
                  <li key={id} className="layer-group">
                    <div className="layer-group-head">
                      <label className="toggle" title={item.grupo.description}>
                        <input
                          type="checkbox"
                          aria-label={item.grupo.label}
                          checked={encendido}
                          onChange={() => onToggleGrupo(item.grupo.id)}
                        />
                        <span className="layer-group-name">{item.grupo.label}</span>
                      </label>
                      {botonesOrden(id, item.grupo.label, i)}
                    </div>
                    <ul className={`layer-group-items${encendido ? '' : ' is-off'}`}>
                      {item.capas.map((capa) => (
                        <li key={capa.id}>{filaCapa(capa)}</li>
                      ))}
                    </ul>
                  </li>
                );
              }
              return (
                <li key={id}>
                  {filaCapa(item.capa)}
                  {botonesOrden(id, item.capa.label, i)}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
