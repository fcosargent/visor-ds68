import { CONDITIONS, type ConditionId } from '../config/layers';
import {
  CARD_LABELS,
  CARD_UI,
  GENERAL_NOTICE,
  HEIGHT_RULE,
  HISTORIC_ZONE_NOTE,
  NORMATIVE_BENEFITS,
} from '../config/normativeBenefits';
import Dialog from './Dialog';

interface Props {
  current: ConditionId;
  onClose: () => void;
}

/** Referencia normativa completa. Usa los mismos textos que NormativeBenefitsCard. */
export default function NormativePanel({ current, onClose }: Props) {
  return (
    <Dialog title="Referencia normativa" onClose={onClose}>
      {CONDITIONS.map(({ id }) => {
        const info = NORMATIVE_BENEFITS[id];
        return (
          <section key={id} className={`norm-section${current === id ? ' is-current' : ''}`}>
            <h3>{info.title}</h3>

            <h4>{CARD_LABELS.territorial}</h4>
            <p>{info.territorial}</p>

            <h4>{CARD_LABELS.benefits}</h4>
            {info.benefits.length > 0 ? (
              <>
                <p className="ref">{CARD_UI.benefitsIntro}</p>
                <ul>
                  {info.benefits.map((b) => (
                    <li key={b.id}>
                      <strong>{b.title}.</strong> {b.text}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <>
                <p>{info.benefitsSummary}</p>
                {info.notAccredited && <p className="ref">{info.notAccredited}</p>}
              </>
            )}

            {info.requirements.length > 0 && (
              <>
                <h4>{CARD_LABELS.requirements}</h4>
                <ul>
                  {info.requirements.map((r) => (
                    <li key={r.label}>
                      <strong>{r.label}.</strong> {r.text}
                    </li>
                  ))}
                </ul>
              </>
            )}
            {info.notes.map((n) => (
              <p key={n}>{n}</p>
            ))}

            <h4>{CARD_LABELS.fundament}</h4>
            <ul>
              {info.references.map((r) => (
                <li key={r} className="ref">{r}</li>
              ))}
            </ul>

            <p className="warning">
              {info.alert.title && <strong>{info.alert.title}. </strong>}
              {info.alert.text}
            </p>
          </section>
        );
      })}

      <section className="norm-section">
        <h3>{HEIGHT_RULE.title}</h3>
        <p>{HEIGHT_RULE.text}</p>
        <ul>
          {HEIGHT_RULE.conditions.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <p className="warning">{HEIGHT_RULE.warning}</p>
      </section>

      <section className="norm-section">
        <h3>{HISTORIC_ZONE_NOTE.title}</h3>
        <p>{HISTORIC_ZONE_NOTE.text}</p>
        <p className="ref">{HISTORIC_ZONE_NOTE.reference}</p>
      </section>

      <p className="disclaimer">{GENERAL_NOTICE}</p>
    </Dialog>
  );
}
