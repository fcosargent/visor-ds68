import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { NO_EXPORTAR } from '../lib/exportImage';

interface Props {
  className: string;
  ariaLabel: string;
  /** Posición inicial dentro del mapa, en píxeles. */
  inicial: { left: number; top?: number; bottom?: number };
  /** Ancho base: con este ancho el contenido se ve a su tamaño normal. */
  anchoBase: number;
  style?: CSSProperties;
  children: ReactNode;
}

const ESCALA_MIN = 0.6;
const ESCALA_MAX = 2.2;

/**
 * Recuadro sobre el mapa que se puede mover (arrastrando) y agrandar o achicar (esquina
 * inferior derecha). Todo el contenido escala junto, porque sus medidas están en «em».
 * Doble clic: vuelve a la posición y el tamaño iniciales.
 */
export default function FloatingPanel({ className, ariaLabel, inicial, anchoBase, style, children }: Props) {
  const ref = useRef<HTMLElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [ancho, setAncho] = useState(anchoBase);

  // En pantallas angostas parte más pequeño.
  useEffect(() => {
    const padre = ref.current?.parentElement;
    if (padre && padre.clientWidth < 600) setAncho(Math.max(anchoBase * ESCALA_MIN, padre.clientWidth * 0.55));
  }, [anchoBase]);

  const seguir = (alMover: (dx: number, dy: number) => void) => (e: ReactPointerEvent) => {
    e.preventDefault();
    const x0 = e.clientX;
    const y0 = e.clientY;
    const mover = (ev: PointerEvent) => alMover(ev.clientX - x0, ev.clientY - y0);
    const soltar = () => {
      window.removeEventListener('pointermove', mover);
      window.removeEventListener('pointerup', soltar);
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
    seguir((dx, dy) =>
      setPos({
        x: Math.min(Math.max(0, x + dx), padre.width - 40),
        y: Math.min(Math.max(0, y + dy), padre.height - 30),
      }),
    )(e);
  };

  const iniciarRedimension = (e: ReactPointerEvent) => {
    e.stopPropagation();
    const a0 = ancho;
    seguir((dx) => setAncho(Math.min(Math.max(a0 + dx, anchoBase * ESCALA_MIN), anchoBase * ESCALA_MAX)))(e);
  };

  const posicion: CSSProperties = pos
    ? { left: pos.x, top: pos.y }
    : { left: inicial.left, top: inicial.top, bottom: inicial.bottom };

  return (
    <section
      ref={ref}
      className={`floating-panel ${className}`}
      aria-label={ariaLabel}
      title="Arrastre para mover · esquina inferior derecha para cambiar el tamaño · doble clic para restablecer"
      style={{ ...style, ...posicion, width: ancho, ['--k' as string]: ancho / anchoBase }}
      onPointerDown={iniciarArrastre}
      onDoubleClick={() => {
        setPos(null);
        setAncho(anchoBase);
      }}
    >
      {children}
      <span className={`resize-grip ${NO_EXPORTAR}`} onPointerDown={iniciarRedimension} aria-hidden="true" />
    </section>
  );
}
