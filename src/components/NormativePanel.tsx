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
      <p className="disclaimer">{CONFIG.ejercicio.nota}</p>
    </Dialog>
  );
}
