import { JOURNEYS, type JourneyId } from '../lib/journeys';
import { BANK_VARIES_COPY, SCHEMA } from '../lib/schema';
import { useRoute } from '../routing/router';
import { useFormSession, type ShellLanguage } from '../session/FormSession';

const LANGUAGES: { id: ShellLanguage; title: string; detail: string; mic: string }[] = [
  {
    id: 'en',
    title: 'English',
    detail: 'Prompts, microphone, and read-back in English.',
    mic: 'en-IN',
  },
  {
    id: 'hi',
    title: 'हिन्दी',
    detail: 'प्रॉम्प्ट, माइक और रीड-बैक हिन्दी में।',
    mic: 'hi-IN',
  },
];

export function JourneyPage() {
  const { go } = useRoute();
  const { language, journey, selectLanguage, selectJourney } = useFormSession();
  const ready = language !== null && journey !== null;

  return (
    <section className="page">
      <header className="page-head">
        <p className="eyebrow">Step 02</p>
        <h1>Language, then the journey.</h1>
        <p className="lede">
          Hindi and English only. The journeys below are the P0 modes on schema{' '}
          <code>aof_kyc_demo_v1</code> — account opening, KYC update, and Re-KYC — each backed by
          more than one public form. {BANK_VARIES_COPY}
        </p>
      </header>

      <fieldset className="choice-block">
        <legend>Microphone and read-back language</legend>
        <div className="choice-grid langs" role="radiogroup" aria-label="Language">
          {LANGUAGES.map((item) => {
            const selected = language === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="radio"
                aria-checked={selected}
                className={selected ? 'choice on' : 'choice'}
                onClick={() => selectLanguage(item.id)}
              >
                <span className="choice-kicker">{item.mic}</span>
                <span className="choice-title">{item.title}</span>
                <span className="choice-detail">{item.detail}</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="choice-block">
        <legend>Journey</legend>
        <div className="choice-grid journeys" role="radiogroup" aria-label="Journey">
          {JOURNEYS.map((item) => {
            const selected = journey === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="radio"
                aria-checked={selected}
                className={selected ? 'choice on' : 'choice'}
                onClick={() => selectJourney(item.id as JourneyId)}
              >
                <span className="choice-kicker">{item.id}</span>
                <span className="choice-title">
                  {item.title}
                  <span className="choice-hi">{item.titleHi}</span>
                </span>
                <span className="choice-detail">{item.summary}</span>
                <span className="choice-hint">Say “{item.voiceHint}”</span>
                <ul className="corpus">
                  {item.corpus.map((sample) => (
                    <li key={`${item.id}-${sample.bank}-${sample.title}`}>
                      <strong>{sample.bank}</strong>
                      {sample.title}
                    </li>
                  ))}
                </ul>
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="page-actions">
        <button type="button" className="btn ghost" onClick={() => go('/')}>
          Back
        </button>
        <button
          type="button"
          className="btn primary lg"
          disabled={!ready}
          onClick={() => go('/speak')}
        >
          Continue to speak and fill
        </button>
      </div>
      {!ready && (
        <p className="hint action-hint">Choose a language and a journey to continue.</p>
      )}

      <footer className="hubs">
        Public hubs:{' '}
        {SCHEMA.public_hubs.map((hub, index) => (
          <span key={hub.bank}>
            {index > 0 ? ' · ' : ''}
            <a href={hub.url} target="_blank" rel="noreferrer">
              {hub.cite_as}
            </a>
          </span>
        ))}
      </footer>
    </section>
  );
}
