import { useEffect, useRef, useState } from 'react';
import { CONDITIONS, PREDIO_FIELDS, type ConditionId } from '../config/layers';
import {
  CARD_LABELS,
  CARD_UI,
  GENERAL_NOTICE,
  HEIGHT_RULE,
  HISTORIC_ZONE_NOTE,
  NORMATIVE_BENEFITS,
} from '../config/normativeBenefits';
import { cumpleCondicion } from '../lib/conditions';

export interface NormativeBenefitsCardProps {
  condition: ConditionId;
  featureProperties?: Record<string, unknown>;
  isInHistoricZone?: boolean;
  onClose: () => void;
}

/** Tarjeta breve bajo el selector de condiciones. Los textos vienen de config/normativeBenefits.ts. */
export default function NormativeBenefitsCard({
  condition,
  featureProperties,
  isInHistoricZone = false,
  onClose,
}: NormativeBenefitsCardProps) {
  const [showFundament, setShowFundament] = useState(false);
  const ref = useRef<HTMLElement>(null);
  const info = NORMATIVE_BENEFITS[condition];
  const color = CONDITIONS.find((c) => c.id === condition)?.style.color;

  // Una tarjeta nueva (otra condición u otro predio) parte contraída y visible en el panel.
  useEffect(() => {
    setShowFundament(false);
    ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [condition, featureProperties]);

  // Con un predio, los beneficios solo se muestran si sus campos reales cumplen la condición.
  const identified = featureProperties ? cumpleCondicion(featureProperties, condition) : true;
  const predioId = featureProperties?.[PREDIO_FIELDS.id];

  return (
    <article ref={ref} className="benefits-card" style={{ ['--accent' as string]: color }} aria-label={info.title}>
      <header className="benefits-card-header">
        <div>
          <p className="benefits-card-kicker">{CARD_UI.cardTitle}</p>
          <h3>{info.title}</h3>
        </div>
        <button className="icon-button" onClick={onClose} aria-label="Cerrar">×</button>
      </header>

      {featureProperties && (
        <p className={`benefits-card-status${identified ? '' : ' is-negative'}`}>
          {CARD_UI.predio} {predioId == null ? '' : String(predioId)} ·{' '}
          {identified ? CARD_UI.identified : CARD_UI.notIdentified}
        </p>
      )}

      <section className="benefits-block">
        <h4>{CARD_LABELS.territorial}</h4>
        <p>{info.territorial}</p>
      </section>

      {identified && (
        <>
          <section className="benefits-block">
            <h4>{CARD_LABELS.benefits}</h4>
            {info.benefits.length > 0 ? (
              <>
                <p className="benefits-intro">{CARD_UI.benefitsIntro}</p>
                <ul className="benefits-list">
                  {info.benefits.map((b) => (
                    <li key={b.id}>
                      <strong>{b.title}</strong>
                      <span>{b.text}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <>
                <p>{info.benefitsSummary}</p>
                {info.notAccredited && <p className="benefits-muted">{info.notAccredited}</p>}
              </>
            )}
          </section>

          <section className="benefits-alert">
            {info.alert.title && <strong>{info.alert.title}</strong>}
            <p>{info.alert.text}</p>
          </section>
        </>
      )}

      <button
        className="benefits-toggle"
        aria-expanded={showFundament}
        onClick={() => setShowFundament(!showFundament)}
      >
        {showFundament ? CARD_UI.hideFundament : CARD_UI.showFundament}
      </button>

      {showFundament && (
        <div className="benefits-fundament">
          {info.requirements.length > 0 && (
            <section>
              <h4>{CARD_LABELS.requirements}</h4>
              <dl>
                {info.requirements.map((r) => (
                  <div key={r.label}>
                    <dt>{r.label}</dt>
                    <dd>{r.text}</dd>
                  </div>
                ))}
              </dl>
              {info.notes.map((n) => (
                <p key={n} className="benefits-muted">{n}</p>
              ))}
            </section>
          )}

          <section>
            <h4>{CARD_LABELS.fundament}</h4>
            <ul className="benefits-refs">
              {info.references.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </section>

          <section className="benefits-height">
            <h5>{HEIGHT_RULE.title}</h5>
            <p>{HEIGHT_RULE.text}</p>
            <ul>
              {HEIGHT_RULE.conditions.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
            <p className="benefits-muted">{HEIGHT_RULE.warning}</p>
          </section>
        </div>
      )}

      {isInHistoricZone && (
        <section className="benefits-zch">
          <strong>{HISTORIC_ZONE_NOTE.title}</strong>
          <p>{HISTORIC_ZONE_NOTE.text}</p>
          <p className="benefits-ref">{HISTORIC_ZONE_NOTE.reference}</p>
        </section>
      )}

      <p className="benefits-notice">{GENERAL_NOTICE}</p>
    </article>
  );
}
