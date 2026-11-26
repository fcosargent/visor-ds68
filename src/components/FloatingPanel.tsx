import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { NO_EXPORTAR } from '../lib/exportImage';
import { esPantallaMovil } from '../lib/pantalla';

interface Props {
  className: string;
  ariaLabel: string;
  /** Posición inicial dentro del mapa, en píxeles. */
  inicial: { left: number; top?: number; bottom?: number };
  /** Ancho base: con este ancho el contenido se ve a su tamaño normal. */
  anchoBase: number;
  /** Texto de la barra cuando el cuadro está minimizado. */
  tituloBarra: string;
  /** Texto del botón para volver a mostrar el cuadro cerrado (por ejemplo, «Mostrar leyenda»). */
  etiquetaReabrir: string;
  /** Al cambiar este valor (la condición activa), un cuadro cerrado vuelve a aparecer. */
  claveReapertura: string;
  /** Parte minimizado. */
  minimizadoInicial?: boolean;
  style?: CSSProperties;
  children: ReactNode;
}

const ESCALA_MIN = 0.6;
const ESCALA_MAX = 2.2;
/** Desplazamiento (px) bajo el cual un toque en la barra minimizada cuenta como clic y no como arrastre. */
const UMBRAL_CLIC = 4;

/**
 * Recuadro sobre el mapa que se puede mover (arrastrando), agrandar o achicar (esquina
 * inferior derecha), minimizar a una barra con su título y cerrar. Todo el contenido escala
 * junto, porque sus medidas están en «em». Doble clic: vuelve a la posición y el tamaño iniciales.
 */
export default function FloatingPanel({
  className,
  ariaLabel,
  inicial,
  anchoBase,
  tituloBarra,
  etiquetaReabrir,
  claveReapertura,
  minimizadoInicial = false,
  style,
  children,
}: Props) {
  const ref = useRef<HTMLElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  // Ancho de referencia: con él la letra se ve a su tamaño normal (--k = 1).
  const [base, setBase] = useState(anchoBase);
  const [ancho, setAncho] = useState(anchoBase);
  const [minimizado, setMinimizado] = useState(minimizadoInicial);
  const [cerrado, setCerrado] = useState(false);

  // En pantallas angostas parte más angosto. La letra ya la reduce styles.css, así que el
  // ancho angosto pasa a ser la referencia y no se achica la letra por segunda vez.
  useEffect(() => {
    const padre = ref.current?.parentElement;
    if (padre && (esPantallaMovil() || padre.clientWidth < 600)) {
      const a = Math.round(Math.min(anchoBase, Math.max(180, padre.clientWidth * 0.6)));
      setBase(a);
      setAncho(a);
    }
  }, [anchoBase]);

  // Al cambiar de condición, un cuadro cerrado vuelve a aparecer (el minimizado se mantiene).
  useEffect(() => setCerrado(false), [claveReapertura]);

  const seguir =
    (alMover: (dx: number, dy: number) => void, alSoltar?: (movido: number) => void) => (e: ReactPointerEvent) => {
      e.preventDefault();
      const x0 = e.clientX;
      const y0 = e.clientY;
      let movido = 0;
      const mover = (ev: PointerEvent) => {
        const dx = ev.clientX - x0;
        const dy = ev.clientY - y0;
        movido = Math.max(movido, Math.abs(dx), Math.abs(dy));
        alMover(dx, dy);
      };
      const soltar = () => {
        window.removeEventListener('pointermove', mover);
        window.removeEventListener('pointerup', soltar);
        alSoltar?.(movido);
      };
      window.addEventListener('pointermove', mover);
      window.addEventListener('pointerup', soltar);
    };

  const iniciarArrastre = (e: ReactPointerEvent) => {
    const el = ref.current!;
    const padre = el.parentElement!.getBoundingClientRect();
    const caja = el.getBoundingClientRect();
    const x = caja.left - padre.left;
    const y = caja.top - padre.top;
    const estabaMinimizado = minimizado;
    seguir(
      (dx, dy) =>
        setPos({
          x: Math.min(Math.max(0, x + dx), padre.width - 40),
          y: Math.min(Math.max(0, y + dy), padre.height - 30),
        }),
      // En la barra minimizada, un clic (sin arrastre) vuelve a expandir el cuadro.
      (movido) => {
        if (estabaMinimizado && movido < UMBRAL_CLIC) setMinimizado(false);
      },
    )(e);
  };

  const iniciarRedimension = (e: ReactPointerEvent) => {
    e.stopPropagation();
    const a0 = ancho;
    seguir((dx) => setAncho(Math.min(Math.max(a0 + dx, base * ESCALA_MIN), base * ESCALA_MAX)))(e);
  };

  const posicionInicial: CSSProperties = { left: inicial.left, top: inicial.top, bottom: inicial.bottom };
  const posicion: CSSProperties = pos ? { left: pos.x, top: pos.y } : posicionInicial;

  if (cerrado) {
    // Botón pequeño en la posición inicial del cuadro; no aparece en la imagen exportada.
    return (
      <button type="button" className={`panel-reabrir ${NO_EXPORTAR}`} style={posicionInicial} onClick={() => setCerrado(false)}>
        {etiquetaReabrir}
      </button>
    );
  }

  // Los botones no deben iniciar el arrastre ni el restablecimiento por doble clic.
  const sinArrastre = {
    onPointerDown: (e: ReactPointerEvent) => e.stopPropagation(),
    onDoubleClick: (e: ReactMouseEvent) => e.stopPropagation(),
  };

  return (
    <section
      ref={ref}
      className={`floating-panel ${className}${minimizado ? ' is-minimized' : ''}`}
      aria-label={ariaLabel}
      title={
        minimizado
          ? 'Clic para expandir · arrastre para mover'
          : 'Arrastre para mover · esquina inferior derecha para cambiar el tamaño · doble clic para restablecer'
      }
      style={{
        ...style,
        ...posicion,
        ...(minimizado ? { width: 'auto', maxWidth: ancho } : { width: ancho }),
        ['--k' as string]: ancho / base,
      }}
      onPointerDown={iniciarArrastre}
      onDoubleClick={() => {
        setPos(null);
        setAncho(base);
      }}
    >
      <div className={`panel-buttons ${NO_EXPORTAR}`}>
        {!minimizado && (
          <button type="button" title="Minimizar" aria-label="Minimizar" onClick={() => setMinimizado(true)} {...sinArrastre}>
            <span aria-hidden="true">–</span>
          </button>
        )}
        <button
          type="button"
          title="Cerrar"
          aria-label="Cerrar"
          // Al volver a aparecer, el cuadro se muestra completo.
          onClick={() => {
            setCerrado(true);
            setMinimizado(false);
          }}
          {...sinArrastre}
        >
          <span aria-hidden="true">×</span>
        </button>
      </div>
      {minimizado ? (
        <p className="panel-bar">{tituloBarra}</p>
      ) : (
        <>
          {children}
          <span className={`resize-grip ${NO_EXPORTAR}`} onPointerDown={iniciarRedimension} aria-hidden="true" />
        </>
      )}
    </section>
  );
}
