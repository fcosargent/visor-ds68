import { CONFIG, type CondicionActiva } from '../config/condiciones';
import Dialog from './Dialog';

interface Props {
  activa: CondicionActiva;
  onClose: () => void;
}

/** Explicación de todas las condiciones, con los mismos textos de condiciones.json. */
export default function NormativePanel({ activa, onClose }: Props) {
  return (
    <Dialog title="Referencia normativa" onClose={onClose}>
      {CONFIG.grupos.map((grupo) => (
        <section key={grupo.id} className="norm-group" style={{ ['--accent' as string]: grupo.recuadro.acento }}>
          <h3>{grupo.titulo}</h3>
          <p>{grupo.introduccion}</p>
          {grupo.planos.flatMap((plano) =>
            plano.condiciones.map((c) => (
              <div key={c.campo} className={`norm-section${c.campo === activa.campo ? ' is-current' : ''}`}>
                <h4>{c.nombre}</h4>
                <p>{c.texto}</p>
              </div>
            )),
          )}
        </section>
      ))}
      <section className="norm-group norm-definitions">
        <h3>Definiciones</h3>
        {CONFIG.definiciones.map((d) => (
          <div key={d.titulo} className="norm-section">
            <h4>{d.titulo}</h4>
            <p>{d.texto}</p>
            {d.formula && <p className="norm-formula">{d.formula}</p>}
            <p className="norm-source">{d.fuente}</p>
          </div>
        ))}
      </section>
      <p className="disclaimer">{CONFIG.ejercicio.nota}</p>
    </Dialog>
  );
}
