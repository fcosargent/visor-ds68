import { METADATA } from '../config/metadata';
import Dialog from './Dialog';

export default function SourcesPanel({ onClose }: { onClose: () => void }) {
  return (
    <Dialog title="Fuentes" onClose={onClose}>
      <p>{METADATA.fuente}</p>
      <dl className="meta">
        <dt>Fecha cartográfica</dt>
        <dd>{METADATA.fechaCartografia}</dd>
        <dt>Base predial</dt>
        <dd>{METADATA.basePredial}</dd>
      </dl>
      <p className="warning">{METADATA.avisoReferencial}</p>
    </Dialog>
  );
}
