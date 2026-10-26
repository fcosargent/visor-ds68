import type { ConditionConfig, LayerConfig } from '../config/layers';
import Swatch from './Swatch';

interface Props {
  condition: ConditionConfig;
  references: LayerConfig[];
}

export default function Legend({ condition, references }: Props) {
  return (
    <section className="block">
      <h2 className="block-title">Leyenda</h2>
      <ul className="legend">
        <li className="legend-main">
          <Swatch layer={condition} />
          <span>{condition.label}</span>
        </li>
        {references.map((layer) => (
          <li key={layer.id}>
            <Swatch layer={layer} />
            <span>{layer.label}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
