import { BANK_VARIES_COPY, SCHEMA } from '../lib/schema';
import { useRoute } from '../routing/router';
import { useFormSession } from '../session/FormSession';
import { Wordmark } from '../layout/Wordmark';

export function LandingPage() {
  const { go } = useRoute();
  const { readyForFill } = useFormSession();

  return (
    <div className="landing">
      <header className="topnav">
        <Wordmark onNavigate={() => go('/')} />
        <div className="topnav-meta">
          <span className="chip">aof_kyc_demo_v1</span>
          <span className="chip ok">No live bank submit</span>
        </div>
      </header>

      <section className="hero-grid">
        <div className="hero-copy">
          <p className="eyebrow">Hindi and English voice drafts</p>
          <h1>Speak the form. Leave with a draft.</h1>
          <p className="lede">
            FormGuide listens, fills account-opening and KYC fields as you talk, and reads them
            back before anything is saved. Nothing is sent to a bank.
          </p>
          <p className="varies-line">{BANK_VARIES_COPY}</p>
          <div className="hero-actions">
            <button type="button" className="btn primary lg" onClick={() => go('/journey')}>
              Start speaking
            </button>
            {readyForFill && (
              <button type="button" className="btn ghost lg" onClick={() => go('/speak')}>
                Continue your draft
              </button>
            )}
          </div>
        </div>

        <div className="hero-stage" aria-hidden="true">
          <div className="voice-card">
            <div className="wave" >
              <span /><span /><span /><span /><span /><span /><span />
            </div>
            <p className="voice-line">“My name is Ananya, born 15 August 1992…”</p>
          </div>
          <div className="paper-card">
            <div className="paper-kicker">Draft · not submitted</div>
            <div className="paper-row filled">
              <span>Full name</span>
              <strong>Ananya Reddy</strong>
            </div>
            <div className="paper-row filled">
              <span>Date of birth</span>
              <strong>15 Aug 1992</strong>
            </div>
            <div className="paper-row">
              <span>Mobile</span>
              <strong>Listening…</strong>
            </div>
            <div className="paper-row">
              <span>Journey</span>
              <strong>Account opening</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="step-strip" aria-label="What happens next">
        <article>
          <span>01</span>
          <h2>Pick a language and a journey</h2>
          <p>Hindi or English, then account opening, KYC update, or Re-KYC.</p>
        </article>
        <article>
          <span>02</span>
          <h2>Speak. Watch the fields fill.</h2>
          <p>The microphone uses en-IN or hi-IN. Missing required details are asked next.</p>
        </article>
        <article>
          <span>03</span>
          <h2>Hear it back, then keep the draft.</h2>
          <p>Confirm three gates. A live bank submit is refused. The draft stays on this device.</p>
        </article>
      </section>

      <footer className="landing-foot">
        <p>{BANK_VARIES_COPY} Public hubs only — no invented form numbers.</p>
        <p>
          {SCHEMA.public_hubs.map((hub, index) => (
            <span key={hub.bank}>
              {index > 0 ? ' · ' : ''}
              <a href={hub.url} target="_blank" rel="noreferrer">
                {hub.cite_as}
              </a>
            </span>
          ))}
        </p>
      </footer>
    </div>
  );
}
