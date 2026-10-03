import { DemoBar } from '../components/DemoBar';
import { FormSections } from '../components/FormSections';
import { NeedJourney } from '../layout/AppShell';
import { journeyById } from '../lib/journeys';
import { BANK_VARIES_COPY, FIELD_GROUPS, fieldLabel, getNextAsk } from '../lib/schema';
import { useRoute } from '../routing/router';
import { useFormSession } from '../session/FormSession';

const FILL_GROUPS = FIELD_GROUPS.map((group) => group.id).filter((id) => id !== 'confirm_gates');

export function SpeakPage() {
  return (
    <NeedJourney>
      <SpeakBody />
    </NeedJourney>
  );
}

function SpeakBody() {
  const { go } = useRoute();
  const session = useFormSession();
  const journey = session.journey ? journeyById(session.journey) : null;
  const ask =
    session.last?.next_ask ||
    getNextAsk(session.missing, session.values, session.readbackLang);

  return (
    <section className="page">
      <header className="page-head">
        <p className="eyebrow">Step 03 · {journey?.title}</p>
        <h1>{session.language === 'hi' ? 'बोलें। फ़ील्ड भरते जाएँ।' : 'Speak. Watch the fields fill.'}</h1>
        <p className="lede">
          {session.language === 'hi'
            ? 'माइक hi-IN पर है। ज़रूरी फ़ील्ड खाली रहें तो अगला सवाल यहीं आएगा।'
            : 'The microphone is on en-IN. If a required field is still empty, the next question appears here.'}{' '}
          {BANK_VARIES_COPY}
        </p>
      </header>

      <div className="ask" aria-live="polite">
        <span>{session.missing.length === 0 ? 'Required fields' : 'Still needed'}</span>
        <p>
          {ask ??
            (session.language === 'hi'
              ? 'ज़रूरी फ़ील्ड भर चुके हैं। ड्राफ्ट सुनने के लिए रिव्यू पर जाएँ।'
              : 'Required fields are in. Review the draft when you are ready.')}
        </p>
      </div>

      <div className="work">
        <div className="voice-sticky">
          <DemoBar
            heading={session.language === 'hi' ? 'बोलें या लिखें' : 'Speak or type'}
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
        </div>
        <FormSections
          values={session.values}
          flashIds={session.flashIds}
          onChange={session.onChange}
          groups={FILL_GROUPS}
        />
      </div>

      <div className="page-actions">
        <button type="button" className="btn ghost" onClick={() => go('/journey')}>
          Back
        </button>
        <button
          type="button"
          className="btn primary lg"
          disabled={!session.canReadback}
          onClick={() => go('/review')}
        >
          Review draft
        </button>
      </div>
      {!session.canReadback && (
        <p className="hint action-hint">
          {session.language === 'hi'
            ? 'ड्राफ्ट डेमो-रेडी होने तक रिव्यू बंद है।'
            : 'Review stays off until this draft is demo-ready.'}{' '}
          {session.missing.length > 0
            ? session.language === 'hi'
              ? `अभी बाकी: ${session.missing.slice(0, 4).map((id) => fieldLabel(id)).join(', ')}.`
              : `Still needed: ${session.missing.slice(0, 4).map((id) => fieldLabel(id)).join(', ')}.`
            : ''}
        </p>
      )}
    </section>
  );
}
