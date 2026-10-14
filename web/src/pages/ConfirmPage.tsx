import { BANK_VARIES_COPY, SCHEMA, isFilled } from '../lib/schema';
import { useRoute } from '../routing/router';
import { useFormSession } from '../session/FormSession';
import { BTN_LG, BTN_MD, BTN_OUTLINE, BTN_PRIMARY } from '../ui/buttons';
import { displayValue } from '../ui/fields';
import { CheckIcon, DownloadIcon, FileCheckIcon, MicIcon, RotateIcon, StopIcon } from '../ui/icons';
import { useMic } from '../ui/useMic';

const GATES = [
  ['readback_confirmed', 'I reviewed the filled details and corrections.'],
  ['draft_only_ack', 'I understand this saves a draft only.'],
  ['no_live_submit_ack', 'I understand nothing is submitted to a bank.'],
] as const;

function draftPayload(session: ReturnType<typeof useFormSession>) {
  return {
    schema_id: 'aof_kyc_demo_v1',
    demo_outcome: 'draft_ready_no_bank_submit',
    journey: session.journey,
    language: session.language,
    mic_lang: session.micLang,
    values: session.values,
  };
}

export function ConfirmPage() {
  const { go } = useRoute();
  const session = useFormSession();
  const mic = useMic(session.micLang, (utterance) => {
    void session.onSubmitUtterance(utterance);
  });
  const rows = SCHEMA.fields.filter(
    (field) => field.group !== 'confirm_gates' && isFilled(session.values[field.id]),
  );

  if (session.draftReady) {
    return (
      <div className="min-h-[calc(100vh-150px)]">
        <section className="grid border-b-2 border-foreground lg:grid-cols-12">
          <div className="flex flex-col justify-center border-b-2 border-foreground bg-primary px-5 py-10 text-primary-foreground lg:col-span-5 lg:border-b-0 lg:border-r lg:px-8">
            <FileCheckIcon className="size-10" />
            <p className="mt-5 text-[10px] uppercase text-primary-foreground/70">Draft saved on this device</p>
            <h1 className="mt-2 font-display text-6xl leading-none">Your draft is ready.</h1>
            <p className="mt-4 max-w-sm text-sm text-primary-foreground/80">
              It was not submitted to a bank. Take this receipt when checking the bank’s own form.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                className={`${BTN_MD} border-2 border-background bg-background text-foreground hover:bg-foreground hover:text-background`}
                onClick={() => {
                  const blob = new Blob([JSON.stringify(draftPayload(session), null, 2)], {
                    type: 'application/json',
                  });
                  const url = URL.createObjectURL(blob);
                  const link = document.createElement('a');
                  link.href = url;
                  link.download = 'formguide-draft.json';
                  link.click();
                  URL.revokeObjectURL(url);
                }}
              >
                <DownloadIcon /> Download draft
              </button>
              <button
                type="button"
                className={`${BTN_OUTLINE} ${BTN_MD} border-background text-background hover:bg-background hover:text-foreground`}
                onClick={() => {
                  session.onClear();
                  go('/');
                }}
              >
                <RotateIcon /> New draft
              </button>
            </div>
          </div>
          <Receipt rows={rows} session={session} />
        </section>
        {session.refuseMsg ? (
          <p className="border-b-2 border-saffron bg-saffron/10 px-5 py-4 text-sm">{session.refuseMsg}</p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="grid min-h-[calc(100vh-150px)] lg:grid-cols-12">
      <section className="border-b-2 border-foreground px-5 py-8 lg:col-span-5 lg:border-b-0 lg:border-r lg:px-8">
        <p className="text-[10px] uppercase text-primary">05 · Confirm draft</p>
        <h1 className="mt-3 max-w-[9ch] font-display text-5xl leading-none">Three gates. No bank submit.</h1>
        <p className="mt-4 max-w-md text-sm text-muted-foreground">
          Each gate must be clear before FormGuide saves anything. This action stores a draft in this demo only.
        </p>
        <div className="mt-7 space-y-3">
          {GATES.map(([id, label], index) => {
            const on = session.values[id] === true;
            return (
              <label
                key={id}
                className={`flex cursor-pointer gap-3 border-2 p-4 ${on ? 'border-primary bg-primary/10' : 'border-foreground'}`}
                onClick={() => session.onChange(id, on ? false : true)}
              >
                <span
                  role="checkbox"
                  aria-checked={on}
                  className={`mt-0.5 grid size-5 place-content-center border border-primary ${
                    on ? 'bg-primary text-primary-foreground' : ''
                  }`}
                >
                  {on ? <CheckIcon className="size-4" /> : null}
                </span>
                <span>
                  <span className="block text-[10px] uppercase text-muted-foreground">Gate 0{index + 1}</span>
                  <span className="mt-1 block font-semibold">{label}</span>
                </span>
              </label>
            );
          })}
        </div>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            className={`${BTN_OUTLINE} ${BTN_MD}`}
            disabled={!mic.supported || session.busy}
            onClick={() => (mic.listening ? mic.stop() : mic.start())}
          >
            {mic.listening ? <StopIcon /> : <MicIcon />}
            {mic.listening ? 'Listening…' : 'Or say the confirmation'}
          </button>
        </div>
        {mic.live ? <p className="mt-2 text-xs text-muted-foreground">“{mic.live}”</p> : null}
        <button
          type="button"
          className={`${BTN_PRIMARY} ${BTN_LG} mt-6 w-full`}
          disabled={!session.canReadback || !session.confirmGatesOk}
          onClick={session.emitDraft}
        >
          <CheckIcon /> Save draft only
        </button>
        <p className="mt-3 text-center text-[11px] text-saffron">
          No Aadhaar OTP · no core-banking submit · no live CKYC
        </p>
        {session.refuseMsg ? (
          <p className="mt-4 border-2 border-saffron bg-saffron/10 p-4 text-xs">{session.refuseMsg}</p>
        ) : null}
      </section>
      <Receipt rows={rows} session={session} />
    </div>
  );
}

function Receipt({
  rows,
  session,
}: {
  rows: typeof SCHEMA.fields;
  session: ReturnType<typeof useFormSession>;
}) {
  const { go } = useRoute();
  const name = String(session.values.applicant_full_name || '');
  return (
    <section className="px-5 py-8 lg:col-span-7 lg:px-8">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[10px] uppercase text-primary">Receipt preview</p>
          <h2 className="mt-2 font-display text-4xl">What was said vs filled</h2>
        </div>
        <span className="border border-foreground px-2 py-1 text-[10px]">FAKE DEMO</span>
      </div>
      <div className="mt-6 border-2 border-foreground">
        <div className="grid grid-cols-[.7fr_1.3fr_1fr] bg-foreground px-3 py-2 text-[10px] uppercase text-background">
          <span>Field</span>
          <span>Said</span>
          <span>Filled</span>
        </div>
        {rows.length === 0 ? (
          <p className="px-3 py-3 text-xs text-muted-foreground">Nothing filled yet.</p>
        ) : (
          rows.map((field) => (
            <div
              key={field.id}
              className="grid grid-cols-[.7fr_1.3fr_1fr] border-t border-foreground/20 px-3 py-3 text-xs"
            >
              <span className="font-semibold">{field.label_en}</span>
              <span className="pr-3 text-muted-foreground">“{session.said[field.id] || '—'}”</span>
              <span className="text-primary">
                {field.id === 'applicant_full_name' && name
                  ? name
                  : displayValue(field.id, session.values[field.id], session.language === 'hi')}{' '}
                ✓
              </span>
            </div>
          ))
        )}
      </div>
      <div className="mt-5 flex items-start gap-3 border-2 border-saffron bg-saffron/10 p-4 text-xs">
        <FileCheckIcon className="size-5 shrink-0 text-saffron" />
        <p>
          <strong>Draft receipt, not a bank acknowledgement.</strong>
          <br />
          {BANK_VARIES_COPY} Check the chosen bank’s latest requirements before using this draft.
        </p>
      </div>
      {session.draftReady ? (
        <pre className="mt-4 overflow-auto border-2 border-foreground p-3 text-[11px]">
          {JSON.stringify(draftPayload(session), null, 2)}
        </pre>
      ) : null}
      <button type="button" className={`${BTN_OUTLINE} ${BTN_MD} mt-5`} onClick={() => go('/review')}>
        Back to review
      </button>
    </section>
  );
}
