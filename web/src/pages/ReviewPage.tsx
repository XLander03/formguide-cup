import { useEffect } from 'react';
import { DraftSheet } from '../components/DraftSheet';
import { NeedJourney } from '../layout/AppShell';
import { journeyById } from '../lib/journeys';
import { BANK_VARIES_COPY, fieldLabel } from '../lib/schema';
import { stopSpeaking } from '../lib/tts';
import { useRoute } from '../routing/router';
import { useFormSession } from '../session/FormSession';

export function ReviewPage() {
  return (
    <NeedJourney>
      <ReviewBody />
    </NeedJourney>
  );
}

function ReviewBody() {
  const { go } = useRoute();
  const session = useFormSession();
  const journey = session.journey ? journeyById(session.journey) : null;

  useEffect(() => {
    return () => stopSpeaking();
  }, []);

  return (
    <section className="page narrow">
      <header className="page-head">
        <p className="eyebrow">Step 04 · {journey?.title}</p>
        <h1>{session.language === 'hi' ? 'ड्राफ्ट सुनें।' : 'Hear the draft.'}</h1>
        <p className="lede">
          Read-back uses the microphone language
          {session.micLang === 'hi-IN' ? ' (hi-IN).' : ' (en-IN).'} {BANK_VARIES_COPY}
        </p>
      </header>

      <div className="review-bar">
        <div>
          <span className="chip">{session.completeness.replace(/_/g, ' ')}</span>
          <span className="chip">{session.micLang}</span>
        </div>
        <div className="page-actions tight">
          {session.speaking ? (
            <button type="button" className="btn" onClick={session.onStopReadback}>
              Stop read-back
            </button>
          ) : (
            <button
              type="button"
              className="btn primary lg"
              disabled={!session.canReadback || session.busy}
              onClick={() => void session.onReadback()}
            >
              Read it back
            </button>
          )}
        </div>
      </div>

      {!session.canReadback && (
        <p className="hint action-hint">
          Read-back waits until the draft is demo-ready.
          {session.missing.length > 0
            ? ` Still needed: ${session.missing.slice(0, 4).map((id) => fieldLabel(id)).join(', ')}.`
            : ''}
        </p>
      )}

      {session.last?.assistant_message && (
        <div className="assistant script" role="status">
          <span className="label">Assistant · {session.last.source}</span>
          {session.last.assistant_message}
        </div>
      )}

      <DraftSheet values={session.values} language={session.language} />

      <p className="varies-line end">{BANK_VARIES_COPY}</p>

      <div className="page-actions">
        <button type="button" className="btn ghost" onClick={() => go('/speak')}>
          Back to speak and fill
        </button>
        <button type="button" className="btn primary lg" onClick={() => go('/confirm')}>
          Continue to confirm
        </button>
      </div>
    </section>
  );
}
