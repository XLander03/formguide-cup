import { useEffect, useState } from 'react';
import { confidenceFlag } from '../journeys/confidence';
import { journeyPack } from '../journeys';
import { buildReadbackScript } from '../lib/heuristicExtract';
import { isFilled } from '../lib/schema';
import { useRoute } from '../routing/router';
import type { FormValues } from '../lib/types';
import { useFormSession } from '../session/FormSession';
import { BTN_LG, BTN_MD, BTN_OUTLINE, BTN_PRIMARY } from '../ui/buttons';
import { FieldGroups } from '../ui/fields';
import { ArrowRightIcon, MicIcon, PauseIcon, PencilIcon, StopIcon, VolumeIcon } from '../ui/icons';
import { useMic } from '../ui/useMic';

export function ReviewPage() {
  const { go } = useRoute();
  const session = useFormSession();
  const [editing, setEditing] = useState(false);
  const pack = journeyPack(session.journey);
  const nameField = pack?.primaryNameField ?? 'applicant_full_name';
  const [name, setName] = useState(String(session.values[nameField] || ''));
  const languageLabel = session.language === 'hi' ? 'हिन्दी' : 'English';
  const script = pack
    ? pack.readback(session.values, session.readbackLang)
    : buildReadbackScript(session.values, session.readbackLang);
  const mic = useMic(session.micLang, (utterance) => {
    void session.onSubmitUtterance(utterance);
  });

  useEffect(() => {
    setName(String(session.values[nameField] || ''));
  }, [session.values, nameField]);

  useEffect(() => {
    return () => session.onStopReadback();
  }, [session.onStopReadback]);

  return (
    <div className="grid min-h-[calc(100vh-150px)] lg:grid-cols-12">
      <section className="border-b-2 border-foreground px-5 py-7 lg:col-span-5 lg:border-b-0 lg:border-r lg:px-8">
        <p className="text-[10px] uppercase text-primary">04 · Review and correct</p>
        <h1 className="mt-3 max-w-[9ch] font-display text-5xl leading-none">Hear every detail back.</h1>
        <p className="mt-4 max-w-md text-sm text-muted-foreground">
          The draft is read in {languageLabel}. Stop it at any time and say or type a correction.
        </p>
        <div className="mt-7 bg-foreground p-5 text-background">
          <p className="text-[10px] uppercase text-background/50">Spoken readback</p>
          <p className="mt-3 font-display text-2xl leading-snug">“{script}”</p>
          <button
            type="button"
            className={`${BTN_MD} mt-5 border-2 border-background bg-background text-foreground hover:border-primary hover:bg-primary hover:text-primary-foreground`}
            disabled={!session.canReadback || session.busy}
            onClick={() => {
              if (session.speaking) session.onStopReadback();
              else void session.onReadback();
            }}
          >
            {session.speaking ? <PauseIcon /> : <VolumeIcon />}
            {session.speaking ? 'Pause readback' : `Read in ${languageLabel}`}
          </button>
        </div>
        <div className="mt-6 border-2 border-saffron bg-saffron/10 p-4">
          <p className="text-[10px] uppercase text-saffron">One correction</p>
          {editing ? (
            <div className="mt-3 flex gap-2">
              <input
                aria-label="Correct full name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="min-w-0 flex-1 border-2 border-foreground bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              />
              <button
                type="button"
                className={`${BTN_PRIMARY} ${BTN_MD}`}
                onClick={() => {
                  session.onChange(nameField, name);
                  setEditing(false);
                }}
              >
                Save
              </button>
            </div>
          ) : (
            <>
              <p className="mt-2 text-sm">Say “change my name”, or correct it here.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" className={`${BTN_OUTLINE} ${BTN_MD}`} onClick={() => setEditing(true)}>
                  <PencilIcon /> {pack ? 'Correct account holder name' : 'Correct full name'}
                </button>
                <button
                  type="button"
                  className={`${BTN_OUTLINE} ${BTN_MD}`}
                  disabled={!mic.supported || session.busy}
                  onClick={() => (mic.listening ? mic.stop() : mic.start())}
                >
                  {mic.listening ? <StopIcon /> : <MicIcon />}
                  {mic.listening ? 'Listening…' : 'Mic'}
                </button>
              </div>
              {mic.live ? <p className="mt-2 text-xs text-foreground/70">“{mic.live}”</p> : null}
            </>
          )}
        </div>
      </section>
      <section className="px-5 py-7 lg:col-span-7 lg:px-8">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[10px] uppercase text-primary">Grouped draft</p>
            <h2 className="mt-2 font-display text-4xl">Check what will be saved</h2>
          </div>
          <span className="border border-saffron px-2 py-1 text-[10px] font-semibold text-saffron">NOT SUBMITTED</span>
        </div>
        <div className="mt-6">
          {pack ? (
            <PackReview
              sections={pack.sections}
              fields={pack.speakFields()}
              values={session.values}
              confidence={session.confidence}
              flashIds={session.flashIds}
              labels={pack.enumLabels}
            />
          ) : (
            <FieldGroups values={session.values} flashIds={session.flashIds} hindi={session.language === 'hi'} />
          )}
        </div>
        <div className="mt-7 flex flex-wrap items-center justify-between gap-4 border-t-2 border-foreground pt-5">
          <p className="text-xs text-muted-foreground">
            Missing fields can stay blank in the draft. Fields vary by bank.
          </p>
          <button
            type="button"
            className={`${BTN_PRIMARY} ${BTN_LG}`}
            disabled={!session.canReadback}
            onClick={() => go('/confirm')}
          >
            Continue to gates <ArrowRightIcon />
          </button>
        </div>
      </section>
    </div>
  );
}

function shown(value: FormValues[string], labels: Record<string, string>): string {
  if (value === true) return 'Yes';
  if (value === false) return 'No';
  if (typeof value !== 'string' || !value.trim()) return '—';
  return labels[value] ?? value.replace(/_/g, ' ');
}

function PackReview({
  sections,
  fields,
  values,
  confidence,
  flashIds,
  labels,
}: {
  sections: readonly string[];
  fields: { id: string; label: string; section: string }[];
  values: FormValues;
  confidence: Record<string, { confidence: number; reason?: string; confirmed?: boolean }>;
  flashIds: Set<string>;
  labels: Record<string, string>;
}) {
  return (
    <div className="space-y-5">
      {sections.map((section, index) => {
        const rows = fields.filter((field) => field.section === section);
        const confirmed = rows.filter((row) => isFilled(values[row.id]) && !flashIds.has(row.id)).length;
        return (
          <section key={section} className="fg-rise" style={{ animationDelay: `${index * 80}ms` }}>
            <div className="mb-2 flex items-center justify-between text-[10px] uppercase text-muted-foreground">
              <h3>
                Group {String.fromCharCode(65 + index)} · {section}
              </h3>
              <span>
                {confirmed}/{rows.length}
              </span>
            </div>
            <div className={`border-l-2 pl-3 ${index === 0 ? 'border-primary' : 'border-foreground/25'}`}>
              {rows.map((row) => {
                const filled = isFilled(values[row.id]);
                const filling = flashIds.has(row.id) && filled;
                const state = filling ? 'filling' : filled ? 'confirmed' : 'missing';
                const flag = confidenceFlag(confidence[row.id]);
                return (
                  <div key={row.id} className="grid grid-cols-[1fr_auto] gap-3 border-b border-foreground/15 py-2.5">
                    <div>
                      <p className="font-semibold">{row.label}</p>
                      <p className={state === 'missing' ? 'text-muted-foreground' : 'text-foreground/70'}>
                        {shown(values[row.id], labels)}
                      </p>
                      {flag ? (
                        <p className={`text-[10px] ${flag.low ? 'text-saffron' : 'text-primary'}`}>{flag.text}</p>
                      ) : null}
                    </div>
                    <span
                      className={`self-start text-[11px] ${
                        state === 'confirmed' ? 'text-primary' : state === 'filling' ? 'text-saffron' : 'text-muted-foreground'
                      }`}
                    >
                      {state === 'confirmed' ? '✓ confirmed' : state === 'filling' ? '✎ filling' : '— awaiting'}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
