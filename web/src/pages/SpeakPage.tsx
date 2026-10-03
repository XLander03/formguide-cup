import { useState } from 'react';
import { getNextAsk } from '../lib/schema';
import { useRoute } from '../routing/router';
import { useFormSession } from '../session/FormSession';
import { BTN_LG, BTN_MD, BTN_OUTLINE, BTN_PRIMARY } from '../ui/buttons';
import { FieldGroups, displayValue, draftChoiceLabel, requiredProgress } from '../ui/fields';
import { ArrowRightIcon, MicIcon, RotateIcon, StopIcon, Waveform } from '../ui/icons';
import { useMic } from '../ui/useMic';

export function SpeakPage() {
  const { go } = useRoute();
  const session = useFormSession();
  const [text, setText] = useState('');
  const [fakeBusy, setFakeBusy] = useState(false);
  const mic = useMic(session.micLang, (utterance) => {
    setText(utterance);
    void session.onSubmitUtterance(utterance);
  });
  const progress = requiredProgress(session.values);
  const ask =
    session.last?.next_ask ||
    getNextAsk(session.missing, session.values, session.readbackLang) ||
    (session.language === 'hi'
      ? 'ज़रूरी फ़ील्ड भर चुके हैं। ड्राफ्ट सुनने के लिए रिव्यू पर जाएँ।'
      : 'Required fields are in. Review the draft when you are ready.');
  const placeholder =
    session.language === 'hi' ? 'बोलना शुरू करने के लिए माइक दबाएँ…' : 'Press the mic and speak naturally…';
  const shown = mic.listening ? mic.live : text;
  const city = displayValue('addr_current_city', session.values.addr_current_city);
  const dob = displayValue('dob', session.values.dob);
  const label = draftChoiceLabel(session.journey, session.values.account_product_intent);
  const pct = progress.total === 0 ? 0 : Math.round((progress.filled / progress.total) * 100);

  return (
    <div className="grid min-h-[calc(100vh-150px)] lg:grid-cols-12">
      <section className="border-b-2 border-foreground lg:col-span-5 lg:border-b-0 lg:border-r">
        <div className="bg-foreground px-5 py-6 text-background sm:px-8">
          <div className="flex items-center justify-between text-[10px] uppercase text-background/50">
            <span>{mic.listening || fakeBusy ? 'Listening · live transcript' : 'Mic ready · demo'}</span>
            <span>{session.language === 'hi' ? 'हिन्दी' : 'English'}</span>
          </div>
          <textarea
            value={shown}
            onChange={(event) => setText(event.target.value)}
            placeholder={`“${placeholder}”`}
            aria-label="Utterance"
            className="mt-4 min-h-32 w-full resize-none bg-transparent font-display text-3xl leading-tight text-background outline-none placeholder:text-background/80"
          />
          <div className="mt-4 flex justify-center">
            <Waveform compact />
          </div>
        </div>
        <div className="px-5 py-5 sm:px-8">
          <p className="text-[10px] uppercase text-saffron">Missing required · asks next</p>
          <p className="mt-2 font-display text-2xl">“{ask}”</p>
          <p className="mt-2 text-xs text-muted-foreground">
            Only missing required details are asked. You can pause or correct anything.
          </p>
        </div>
        <div className="border-t border-foreground/15 px-5 py-5 sm:px-8">
          <p className="text-[10px] uppercase text-primary">Spoken readback</p>
          <p className="mt-2 text-sm text-foreground/70">
            “I wrote your city as{' '}
            <span className="font-semibold text-primary underline">{city === '—' ? '—' : city}</span> and date of
            birth as <span className="font-semibold text-primary underline">{dob === '—' ? '—' : dob}</span>.”
          </p>
        </div>
        <div className="border-t-2 border-foreground px-5 py-5 sm:px-8">
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className={`${BTN_PRIMARY} ${BTN_LG}`}
              disabled={fakeBusy || session.busy}
              onClick={() => {
                setFakeBusy(true);
                window.setTimeout(() => {
                  session.onPriya();
                  setText(
                    session.language === 'hi'
                      ? 'मेरा नाम प्रिया शर्मा है। यह नकली प्रीफिल है।'
                      : 'My name is Priya Sharma. This is the fake prefill.',
                  );
                  setFakeBusy(false);
                }, 700);
              }}
            >
              {fakeBusy ? <StopIcon /> : <MicIcon />}
              {fakeBusy ? 'Listening…' : 'Start fake voice demo'}
            </button>
            <button
              type="button"
              className={`${BTN_OUTLINE} ${BTN_MD}`}
              disabled={!mic.supported || session.busy}
              onClick={() => (mic.listening ? mic.stop() : mic.start())}
            >
              {mic.listening ? <StopIcon /> : <MicIcon />}
              {mic.listening ? 'Stop mic' : 'Mic'}
            </button>
            <button
              type="button"
              className={`${BTN_OUTLINE} ${BTN_MD}`}
              disabled={session.busy || !text.trim()}
              onClick={() => void session.onSubmitUtterance(text)}
            >
              Fill from text
            </button>
            <button
              type="button"
              className={`${BTN_OUTLINE} ${BTN_MD}`}
              disabled={session.busy}
              onClick={() => {
                session.onClear();
                setText('');
              }}
            >
              <RotateIcon /> Reset
            </button>
          </div>
          <p className="mt-3 text-[11px] font-semibold text-saffron">
            FAKE PREFILL DEMO · not CKYC or DigiLocker data
          </p>
        </div>
      </section>
      <section className="px-5 py-6 sm:px-8 lg:col-span-7">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase text-primary">{label}</p>
            <h1 className="mt-1 font-display text-4xl">Draft filling live</h1>
            <p className="mt-2 text-xs text-muted-foreground">
              {progress.filled} of {progress.total} required filled · about 45 fields total
            </p>
          </div>
          <span className="border-2 border-foreground bg-foreground px-3 py-2 text-xs font-semibold text-background">
            {label}
          </span>
        </div>
        <div className="mt-5 h-2 border border-foreground">
          <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-6">
          <FieldGroups values={session.values} flashIds={session.flashIds} hindi={session.language === 'hi'} />
        </div>
        <div className="mt-7 flex flex-wrap items-center justify-between gap-4 border-t-2 border-foreground pt-5">
          <p className="max-w-sm text-xs text-muted-foreground">
            Review every field and hear the draft in {session.language === 'hi' ? 'हिन्दी' : 'English'}. Nothing has
            been sent to a bank.
            {!session.canReadback ? ' Review opens when the draft is demo-ready.' : ''}
          </p>
          <button
            type="button"
            className={`${BTN_PRIMARY} ${BTN_LG}`}
            disabled={!session.canReadback}
            onClick={() => go('/review')}
          >
            Review draft <ArrowRightIcon />
          </button>
        </div>
      </section>
    </div>
  );
}
