import { useEffect, useState } from 'react';
import { BankFields } from '../components/BankFields';
import { buildReadbackScript } from '../lib/heuristicExtract';
import { languageLabel } from '../lib/languages';
import { fieldLabel } from '../lib/schema';
import { useRoute } from '../routing/router';
import { useFormSession } from '../session/FormSession';
import { BTN, BTN_LG, BTN_MD, BTN_OUTLINE, BTN_PRIMARY } from '../ui/buttons';
import { FieldGroups } from '../ui/fields';
import { ArrowRightIcon, MicIcon, PauseIcon, PencilIcon, StopIcon, VolumeIcon } from '../ui/icons';
import { useMic } from '../ui/useMic';

function listLabels(ids: string[]): string {
  const names = ids.slice(0, 3).map(fieldLabel);
  return ids.length > 3 ? `${names.join(', ')} and ${ids.length - 3} more` : names.join(', ');
}

/** Why read-back and the gates are locked, or null when they are open. */
export function readbackBlocker(session: {
  canReadback: boolean;
  busy: boolean;
  missing: string[];
  flaggedIds: string[];
  invalidIds: string[];
}): string | null {
  if (session.canReadback && !session.busy) return null;
  if (session.busy) return 'Still filling from your last answer…';
  const parts: string[] = [];
  if (session.missing.length > 0) parts.push(`Still empty: ${listLabels(session.missing)}.`);
  if (session.invalidIds.length > 0) parts.push(`Fix the format of: ${listLabels(session.invalidIds)}.`);
  if (session.flaggedIds.length > 0) parts.push(`Confirm with “Check this”: ${listLabels(session.flaggedIds)}.`);
  return parts.length > 0 ? parts.join(' ') : 'Fill the required details first.';
}

export function ReviewPage() {
  const { go } = useRoute();
  const session = useFormSession();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(String(session.values.applicant_full_name || ''));
  const spokenLanguage = languageLabel(session.language);
  const script = buildReadbackScript(session.values, session.readbackLang);
  const blocker = readbackBlocker(session);
  const mic = useMic(session.micLang, (utterance) => {
    void session.onSubmitUtterance(utterance);
  });

  useEffect(() => {
    setName(String(session.values.applicant_full_name || ''));
  }, [session.values.applicant_full_name]);

  useEffect(() => {
    return () => session.onStopReadback();
  }, [session.onStopReadback]);

  return (
    <div className="grid min-h-[calc(100vh-150px)] lg:grid-cols-12">
      <section className="border-b-2 border-foreground px-5 py-7 lg:col-span-5 lg:border-b-0 lg:border-r lg:px-8">
        <p className="text-[10px] uppercase text-primary">04 · Review and correct</p>
        <h1 className="mt-3 max-w-[9ch] font-display text-5xl leading-none">Hear every detail back.</h1>
        <p className="mt-4 max-w-md text-sm text-muted-foreground">
          The draft is read in {spokenLanguage}. Stop it at any time and say or type a correction.
        </p>
        <div className="mt-7 bg-foreground p-5 text-background">
          <p className="text-[10px] uppercase text-background/50">Spoken readback</p>
          <p className="mt-3 font-display text-2xl leading-snug">“{script}”</p>
          <button
            type="button"
            className={`${BTN} ${BTN_MD} mt-5 border-2 border-background bg-background text-foreground hover:border-primary hover:bg-primary hover:text-primary-foreground`}
            disabled={!session.canReadback || session.busy}
            onClick={() => {
              if (session.speaking) session.onStopReadback();
              else void session.onReadback();
            }}
          >
            {session.speaking ? <PauseIcon /> : <VolumeIcon />}
            {session.speaking ? 'Pause readback' : `Read in ${spokenLanguage}`}
          </button>
          {blocker ? (
            <div className="mt-3 text-xs">
              <p className="text-saffron">Read-back unlocks once the draft is complete. {blocker}</p>
              {!session.busy ? (
                <button
                  type="button"
                  className="mt-2 font-semibold text-background underline underline-offset-2 hover:text-primary"
                  onClick={() => go('/speak')}
                >
                  Finish on Speak &amp; fill
                </button>
              ) : null}
            </div>
          ) : null}
          {session.speaking && session.readbackInEnglish ? (
            <p className="mt-2 text-[11px] text-background/60">Read-back in English on this device</p>
          ) : null}
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
                  session.onChange('applicant_full_name', name);
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
                  <PencilIcon /> Correct full name
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
            <p className="text-[10px] uppercase text-primary">Grouped draft · {session.form.bankId} form</p>
            <h2 className="mt-2 font-display text-4xl">Check what will be saved</h2>
          </div>
          <span className="border border-saffron px-2 py-1 text-[10px] font-semibold text-saffron">NOT SUBMITTED</span>
        </div>
        <div className="mt-6">
          <FieldGroups values={session.values} flashIds={session.flashIds} hindi={session.language === 'hi'} />
          <BankFields form={session.form} values={session.values} onChange={session.onChange} />
        </div>
        <div className="mt-7 flex flex-wrap items-center justify-between gap-4 border-t-2 border-foreground pt-5">
          <p className={`max-w-md text-xs ${blocker ? 'text-destructive' : 'text-muted-foreground'}`}>
            {blocker ? `${blocker} Fields vary by bank.` : 'Ready for the gates. Fields vary by bank.'}
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
