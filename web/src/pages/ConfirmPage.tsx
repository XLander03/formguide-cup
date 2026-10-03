import { DemoBar } from '../components/DemoBar';
import { FieldInput } from '../components/FieldInput';
import { NeedJourney } from '../layout/AppShell';
import { journeyById } from '../lib/journeys';
import { BANK_VARIES_COPY, SCHEMA, fieldLabel } from '../lib/schema';
import { useRoute } from '../routing/router';
import { useFormSession } from '../session/FormSession';

const GATES = SCHEMA.fields.filter((field) => field.group === 'confirm_gates');

export function ConfirmPage() {
  return (
    <NeedJourney>
      <ConfirmBody />
    </NeedJourney>
  );
}

function ConfirmBody() {
  const { go } = useRoute();
  const session = useFormSession();
  const journey = session.journey ? journeyById(session.journey) : null;
  const name = String(session.values.applicant_full_name || '').trim();
  const mobile = String(session.values.mobile_registered || '');
  const last4 = mobile.length >= 4 ? mobile.slice(-4) : '';

  return (
    <section className="page narrow">
      <header className="page-head">
        <p className="eyebrow">Step 05 · {journey?.title}</p>
        <h1>{session.language === 'hi' ? 'पुष्टि करें। बैंक को न भेजें।' : 'Confirm. Do not send it.'}</h1>
        <p className="lede">
          Three gates stand between this draft and a local save. Live bank submit stays refused.
          {BANK_VARIES_COPY}
        </p>
      </header>

      <dl className="confirm-summary">
        <div>
          <dt>Journey</dt>
          <dd>{journey ? `${journey.title} · ${journey.titleHi}` : '—'}</dd>
        </div>
        <div>
          <dt>{fieldLabel('applicant_full_name')}</dt>
          <dd>{name || '—'}</dd>
        </div>
        <div>
          <dt>Mobile last 4</dt>
          <dd>{last4 || '—'}</dd>
        </div>
        <div>
          <dt>Schema</dt>
          <dd>aof_kyc_demo_v1</dd>
        </div>
      </dl>

      {!session.canReadback && (
        <p className="hint action-hint">
          A local draft can be saved once the form is demo-ready. Fill the missing required fields
          first.
        </p>
      )}

      <div className="gate-list">
        {GATES.map((field) => (
          <FieldInput
            key={field.id}
            field={field}
            value={session.values[field.id]}
            values={session.values}
            onChange={session.onChange}
          />
        ))}
      </div>

      <DemoBar
        density="utterance"
        heading={session.language === 'hi' ? 'या बोलकर पुष्टि करें' : 'Or say the confirmation'}
        initialText=""
        busy={session.busy}
        onSubmitUtterance={session.onSubmitUtterance}
        onPriya={session.onPriya}
        onClear={session.onClear}
        onReadback={session.onReadback}
        onTryLiveSubmit={session.onTryLiveSubmit}
        last={session.last}
        missing={session.missing}
        completeness={session.completeness}
        canReadback={session.canReadback}
        utteranceLang={session.detectedLang}
        micLang={session.micLang}
        onMicLangChange={session.setMicLang}
        showFinalizeActions={false}
      />

      <div className="page-actions">
        <button type="button" className="btn ghost" onClick={() => go('/review')}>
          Back to review
        </button>
        <button
          type="button"
          className="btn primary lg"
          disabled={!session.canReadback || !session.confirmGatesOk}
          onClick={session.emitDraft}
        >
          Save draft on this device
        </button>
        <button
          type="button"
          className="btn danger"
          disabled={session.busy}
          onClick={session.onTryLiveSubmit}
        >
          Try live bank submit
        </button>
      </div>
      <p className="hint action-hint">
        Save needs a demo-ready draft and all three confirmations. Live submit does not call a bank.
      </p>

      {session.refuseMsg && <div className="refuse-box">{session.refuseMsg}</div>}

      {session.draftReady && (
        <div className="success-box">
          Draft ready — not submitted to any bank.
          {name ? ` ${fieldLabel('applicant_full_name')} = ${name}.` : ''}
          {last4 ? ` Mobile last-4 = ${last4}.` : ''} {BANK_VARIES_COPY}
          <pre>
            {JSON.stringify(
              {
                schema_id: 'aof_kyc_demo_v1',
                demo_outcome: 'draft_ready_no_bank_submit',
                journey: session.journey,
                language: session.language,
                mic_lang: session.micLang,
                values: session.values,
              },
              null,
              2,
            )}
          </pre>
        </div>
      )}
    </section>
  );
}
