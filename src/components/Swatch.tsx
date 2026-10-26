import type { LayerConfig } from '../config/layers';

/** Muestra de simbología a partir del estilo declarado en layers.ts. */
export default function Swatch({ layer }: { layer: Pick<LayerConfig, 'type' | 'style'> }) {
  const { type, style } = layer;
  if (type === 'label') {
    return (
      <svg className="swatch" viewBox="0 0 18 14" aria-hidden="true">
        <text x="9" y="11" textAnchor="middle" fontSize="10" fontWeight="600" fill={style.color}>Aa</text>
      </svg>
    );
  }
  if (type === 'point') {
    return (
      <svg className="swatch" viewBox="0 0 18 14" aria-hidden="true">
        <circle cx="9" cy="7" r="4.5" fill={style.fillColor} stroke={style.color} strokeWidth={style.weight} />
      </svg>
    );
  }
  if (type === 'line') {
    return (
      <svg className="swatch" viewBox="0 0 18 14" aria-hidden="true">
        <line x1="1" y1="7" x2="17" y2="7" stroke={style.color} strokeWidth={style.weight} strokeOpacity={style.opacity ?? 1} />
      </svg>
    );
  }
  return (
    <svg className="swatch" viewBox="0 0 18 14" aria-hidden="true">
      <rect
        x="1.5"
        y="1.5"
        width="15"
        height="11"
        fill={style.fillColor ?? 'none'}
        fillOpacity={style.fillOpacity ?? 0}
        stroke={style.color}
        strokeWidth={Math.max(style.weight, 1)}
        strokeOpacity={style.opacity ?? 1}
        strokeDasharray={style.dashArray}
      />
    </svg>
  );
}
