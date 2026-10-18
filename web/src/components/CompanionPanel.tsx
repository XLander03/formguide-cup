import { useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { MAX_PLAN_TEXT } from '../../../shared/journeyPlan';
import { LANGUAGES, languageById, type MicLang, type ShellLanguage } from '../lib/languages';
import { transcribeClip } from '../lib/transcribeClip';
import { ArrowRightIcon, CheckIcon, ChevronDownIcon, LanguagesIcon, MicIcon, StopIcon } from '../ui/icons';
import { useSpeakMic } from '../ui/useMic';

export type HeardSource = 'live' | 'sample' | 'typed';

export const SAMPLES = [
  'मेरा डेबिट कार्ड चोरी हो गया और मैंने घर बदल लिया है',
  'मुझे अपनी सैलरी के लिए नया अकाउंट खुलवाना है',
  'My bank sent a letter saying I need to redo my KYC',
] as const;

type Tab = 'speak' | 'type' | 'languages';
const TABS: { id: Tab; label: string }[] = [
  { id: 'speak', label: 'Speak' },
  { id: 'type', label: 'Type' },
  { id: 'languages', label: 'Languages' },
];

export interface CompanionPanelProps {
  language: ShellLanguage | null;
  micLang: string;
  selectLanguage: (id: ShellLanguage) => void;
  /** Text in the "Tell us what happened" box (also filled by the mic and samples). */
  draft: string;
  onDraftChange: (text: string) => void;
  /** Last text sent to the planner, shown under the tabs. */
  said: { text: string; source: HeardSource } | null;
  planning: boolean;
  note: string | null;
  onNote: (note: string | null) => void;
  /** `heard` is the language the speak function detected in a live clip. */
  onUtterance: (text: string, source: HeardSource, heard?: MicLang | null) => void;
}

const SOURCE_LABEL: Record<HeardSource, string> = {
  live: 'Heard',
  sample: 'Sample · not a live transcript',
  typed: 'You wrote',
};

/** Left panel of /journey: Speak / Type / Languages tabs over one shared planner path. */
export function CompanionPanel({
  language,
  micLang,
  selectLanguage,
  draft,
  onDraftChange,
  said,
  planning,
  note,
  onNote,
  onUtterance,
}: CompanionPanelProps) {
  const baseId = useId();
  const [tab, setTab] = useState<Tab>('speak');
  const [busy, setBusy] = useState(false);
  const [samplesOpen, setSamplesOpen] = useState(false);
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({ speak: null, type: null, languages: null });
  const current = languageById(language) ?? LANGUAGES[0];

  const mic = useSpeakMic(micLang, (wav) => {
    setBusy(true);
    onNote(null);
    void transcribeClip(wav, micLang).then((result) => {
      setBusy(false);
      if (result.transcript) onUtterance(result.transcript, 'live', result.detected);
      else onNote(result.error);
    });
  });

  function openTab(next: Tab, focus = false) {
    setTab(next);
    if (focus) tabRefs.current[next]?.focus();
  }

  function onTabKey(event: KeyboardEvent<HTMLButtonElement>) {
    const index = TABS.findIndex((row) => row.id === tab);
    let next = -1;
    if (event.key === 'ArrowRight') next = (index + 1) % TABS.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + TABS.length) % TABS.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = TABS.length - 1;
    if (next < 0) return;
    event.preventDefault();
    openTab(TABS[next].id, true);
  }

  function onTyped(event: FormEvent) {
    event.preventDefault();
    onUtterance(draft, 'typed');
  }

  const tabId = (id: Tab) => `${baseId}-tab-${id}`;
  const panelId = (id: Tab) => `${baseId}-panel-${id}`;
  const status = mic.listening
    ? 'Listening'
    : busy
      ? 'Choosing a form'
      : planning
        ? 'Planning your forms'
        : 'Tap · say your need';
  const showSaid = said && !(tab === 'type' && said.source === 'typed');

  return (
    <section className="border-b-2 border-foreground bg-foreground px-5 py-7 text-background lg:col-span-5 lg:border-b-0 lg:border-r-2 lg:px-8">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-primary">01 · Talk to your companion</p>
      <h1 className="mt-2 font-display text-4xl leading-[0.95] sm:text-5xl">Just tell me what you need.</h1>

      <button
        type="button"
        aria-label={`Speaking in ${current.englishName}. Change language`}
        onClick={() => openTab('languages', true)}
        className="mt-4 inline-flex max-w-full items-center gap-2 rounded-full border border-background/30 px-3 py-1.5 text-xs text-background/80 hover:border-primary"
      >
        <LanguagesIcon className="size-4 shrink-0 text-primary" />
        <span className="truncate">
          Speaking in <span className="font-semibold text-background">{current.pickerLabel}</span>
          {current.pickerLabel !== current.englishName ? ` · ${current.englishName}` : ''}
        </span>
        <span aria-hidden="true" className="text-background/40">·</span>
        <span className="font-semibold text-primary underline underline-offset-2">Change</span>
      </button>

      <div
        role="tablist"
        aria-label="How do you want to tell us?"
        className="mt-5 grid grid-cols-3 border border-background/30"
      >
        {TABS.map((row) => {
          const on = row.id === tab;
          return (
            <button
              key={row.id}
              ref={(node) => {
                tabRefs.current[row.id] = node;
              }}
              id={tabId(row.id)}
              type="button"
              role="tab"
              aria-selected={on}
              aria-controls={panelId(row.id)}
              tabIndex={on ? 0 : -1}
              onClick={() => openTab(row.id)}
              onKeyDown={onTabKey}
              className={`px-2 py-2.5 text-[11px] font-semibold uppercase tracking-wide focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-background ${
                on ? 'bg-primary text-primary-foreground' : 'text-background/70 hover:text-background'
              }`}
            >
              {row.label}
            </button>
          );
        })}
      </div>

      <div className="min-h-[19rem]">
        {tab === 'speak' ? (
          <div role="tabpanel" id={panelId('speak')} aria-labelledby={tabId('speak')} className="flex flex-col items-center pt-7">
            <button
              type="button"
              aria-label={mic.listening ? 'Stop and choose a form' : 'Tap and say what you need'}
              aria-pressed={mic.listening}
              disabled={busy && !mic.listening}
              onClick={() => {
                if (mic.listening) mic.stop();
                else if (!busy) void mic.start();
              }}
              className="grid size-32 place-items-center rounded-full bg-primary text-primary-foreground ring-8 ring-primary/15 sm:size-36"
            >
              {mic.listening ? <StopIcon className="size-10" /> : <MicIcon className="size-12" />}
            </button>
            <p className="mt-4 text-[11px] font-semibold uppercase tracking-wide" aria-live="polite">
              {status}
            </p>
            <p className="mt-1 text-center text-sm text-background/70">Speak in your language, or mix in English.</p>
            {mic.error ? <p className="mt-2 text-center text-xs text-saffron">{mic.error}</p> : null}

            <div className="mt-6 w-full border-t border-background/15 pt-3">
              <button
                type="button"
                aria-expanded={samplesOpen}
                aria-controls={`${baseId}-samples`}
                onClick={() => setSamplesOpen((open) => !open)}
                className="flex w-full items-center justify-between gap-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-background/60 hover:text-background"
              >
                No mic? Try a sample
                <ChevronDownIcon className={`size-4 transition-transform ${samplesOpen ? 'rotate-180' : ''}`} />
              </button>
              {samplesOpen ? (
                <div id={`${baseId}-samples`} className="mt-2 flex flex-col gap-2">
                  {SAMPLES.map((sample) => (
                    <button
                      key={sample}
                      type="button"
                      onClick={() => onUtterance(sample, 'sample')}
                      className="border border-background/25 px-3 py-2 text-left text-xs text-background/90 hover:border-primary"
                    >
                      ▶ {sample}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {tab === 'type' ? (
          <form
            role="tabpanel"
            id={panelId('type')}
            aria-labelledby={tabId('type')}
            className="pt-6"
            onSubmit={onTyped}
          >
            <label htmlFor={`${baseId}-what-happened`} className="flex items-baseline justify-between gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-primary">Tell us what happened</span>
              {draft && said && said.text === draft.trim() && said.source !== 'typed' ? (
                <span className="text-[10px] uppercase text-background/50">{SOURCE_LABEL[said.source]}</span>
              ) : null}
            </label>
            <textarea
              id={`${baseId}-what-happened`}
              value={draft}
              maxLength={MAX_PLAN_TEXT}
              rows={4}
              placeholder="e.g. My card was stolen and I moved house"
              onChange={(event) => onDraftChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  onUtterance(draft, 'typed');
                }
              }}
              className="mt-2 w-full resize-none border border-background/30 bg-transparent p-3 text-sm text-background placeholder:text-background/40 focus:border-primary focus:outline-none"
            />
            <p className="mt-1 text-[11px] text-background/50">Any language is fine. Press Enter to plan.</p>
            <button
              type="submit"
              disabled={planning || !draft.trim()}
              className="mt-4 flex w-full items-center justify-center gap-2 border border-primary bg-primary px-3 py-2.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
            >
              {planning ? 'Planning your forms…' : 'Plan my forms'} <ArrowRightIcon className="size-4" />
            </button>
          </form>
        ) : null}

        {tab === 'languages' ? (
          <div role="tabpanel" id={panelId('languages')} aria-labelledby={tabId('languages')} className="pt-6">
            <h2 className="text-[10px] font-semibold uppercase tracking-wide text-primary">Supported languages</h2>
            <p className="mt-1 text-sm text-background/70">Pick the one you speak. You can always mix in English.</p>
            <ul className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3" aria-label="Supported languages">
              {LANGUAGES.map((option) => {
                const on = option.id === current.id;
                return (
                  <li key={option.id}>
                    <button
                      type="button"
                      aria-pressed={on}
                      onClick={() => {
                        selectLanguage(option.id);
                        openTab('speak', true);
                      }}
                      className={`flex w-full items-center justify-between gap-2 border px-3 py-2 text-left ${
                        on
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-background/25 text-background hover:border-primary'
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-sm font-semibold">{option.pickerLabel}</span>
                          {option.beta ? (
                            <span
                              className={`shrink-0 border px-1.5 text-[10px] font-semibold uppercase ${
                                on ? 'border-primary-foreground text-primary-foreground' : 'border-primary text-primary'
                              }`}
                            >
                              Beta
                            </span>
                          ) : null}
                        </span>
                        <span className={`block text-[10px] uppercase tracking-wide ${on ? 'text-primary-foreground/75' : 'text-background/55'}`}>
                          {option.englishName}
                        </span>
                      </span>
                      {on ? <CheckIcon className="size-4 shrink-0" /> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </div>

      {note ? <p className="mt-4 text-xs text-saffron">{note}</p> : null}
      {showSaid ? (
        <figure className="mt-4 border-l-2 border-primary pl-3">
          <figcaption className="text-[10px] font-semibold uppercase tracking-wide text-background/50">
            {SOURCE_LABEL[said.source]}
          </figcaption>
          <blockquote className="mt-1 text-sm text-background/90">{said.text}</blockquote>
        </figure>
      ) : null}
    </section>
  );
}
