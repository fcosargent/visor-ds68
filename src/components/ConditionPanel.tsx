import { useEffect, useState } from 'react';
import { CONFIG, type CondicionActiva } from '../config/condiciones';

interface Props {
  activa: CondicionActiva;
  onSelect: (campo: string) => void;
}

/**
 * Condiciones en dos grupos con recuadro de color. Los planos con una sola condición se
 * seleccionan directo; los que tienen dos variantes se despliegan (acordeón).
 */
export default function ConditionPanel({ activa, onSelect }: Props) {
  const [abierto, setAbierto] = useState<string | null>(activa.plano.id);

  // Si la condición activa cambia desde fuera, mostrar su plano desplegado.
  useEffect(() => setAbierto(activa.plano.id), [activa.plano.id]);

  return (
    <div className="groups">
      {CONFIG.grupos.map((grupo) => (
        <section
          key={grupo.id}
          className="group-box"
          style={{
            ['--group-bg' as string]: grupo.recuadro.fondo,
            ['--group-border' as string]: grupo.recuadro.borde,
            ['--accent' as string]: grupo.recuadro.acento,
          }}
        >
          <h2 className="group-title">{grupo.titulo}</h2>
          <p className="group-intro">{grupo.introduccion}</p>
          <ul className="plano-list">
            {grupo.planos.map((plano) => {
              const directo = plano.condiciones.length === 1;
              const contieneActiva = plano.id === activa.plano.id;
              const expandido = !directo && abierto === plano.id;
              return (
                <li key={plano.id}>
                  <button
                    className={`plano-button${directo && contieneActiva ? ' is-active' : ''}${contieneActiva ? ' has-active' : ''}`}
                    aria-expanded={directo ? undefined : expandido}
                    aria-pressed={directo ? contieneActiva : undefined}
                    onClick={() =>
                      directo ? onSelect(plano.condiciones[0].campo) : setAbierto(expandido ? null : plano.id)
                    }
                  >
                    <span className="plano-num">{plano.id.replace('P', '')}</span>
                    <span className="plano-text">
                      {plano.titulo} <span className="plano-art">– {plano.articulo}</span>
                    </span>
                    {!directo && (
                      <span className="chevron" aria-hidden="true">
                        {expandido ? '−' : '+'}
                      </span>
                    )}
                  </button>
                  {expandido && (
                    <ul className="variant-list">
                      {plano.condiciones.map((c) => (
                        <li key={c.campo}>
                          <button
                            className={`variant-button${c.campo === activa.campo ? ' is-active' : ''}`}
                            aria-pressed={c.campo === activa.campo}
                            onClick={() => onSelect(c.campo)}
                          >
                            {c.variante}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
