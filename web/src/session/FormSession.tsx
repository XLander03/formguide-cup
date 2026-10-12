import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { extractFields } from '../lib/extractClient';
import { buildReadbackScript } from '../lib/heuristicExtract';
import { isJourneyId, type JourneyId } from '../lib/journeys';
import {
  completenessLevel,
  emptyValues,
  getMissingRequired,
  getNextAsk,
  priyaDemoValues,
} from '../lib/schema';
import { speakForUtterance, stopSpeaking } from '../lib/tts';
import type { ExtractResponse, FormValues } from '../lib/types';
import { readbackFollowup, tryLiveMessage, type UtteranceLang } from '../lib/utteranceLang';

export type ShellLanguage = 'en' | 'hi';
export type MicLang = 'en-IN' | 'hi-IN';

const STORAGE_KEY = 'formguide.cup.session.v2';

/** Fields below this model confidence get a 'Check this' flag until confirmed. */
export const CONFIDENCE_FLAG_THRESHOLD = 0.75;

export interface FieldConfidence {
  confidence: number;
  reason?: string;
  confirmed: boolean;
}

interface Persisted {
  language: ShellLanguage | null;
  journey: JourneyId | null;
  values: FormValues;
  confidence?: Record<string, FieldConfidence>;
}

function loadPersisted(): Persisted | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<Persisted>;
    const language = data.language === 'hi' || data.language === 'en' ? data.language : null;
    const journey = isJourneyId(data.journey) ? data.journey : null;
    const values =
      data.values && typeof data.values === 'object' ? (data.values as FormValues) : {};
    const confidence =
      data.confidence && typeof data.confidence === 'object' ? data.confidence : {};
    return { language, journey, values, confidence };
  } catch {
    return null;
  }
}

function seedValues(saved: Persisted | null): FormValues {
  const base = emptyValues();
  if (saved?.values) {
    for (const [key, value] of Object.entries(saved.values)) {
      if (key in base && value !== undefined) base[key] = value;
    }
  }
  if (saved?.journey) base.journey_mode = saved.journey;
  else if (!base.journey_mode) base.journey_mode = 'account_opening';
  if (saved?.language) base.preferred_language = saved.language === 'hi' ? 'Hindi' : 'English';
  else if (!base.preferred_language) base.preferred_language = 'English';
  if (base.journey_mode === 'account_opening' && !base.account_product_intent) {
    base.account_product_intent = 'regular_savings';
  }
  return base;
}

export interface FormSessionValue {
  language: ShellLanguage | null;
  journey: JourneyId | null;
  micLang: MicLang;
  /** Language passed into the existing read-back script and TTS. Follows the mic. */
  readbackLang: UtteranceLang;
  detectedLang: UtteranceLang;
  values: FormValues;
  busy: boolean;
  speaking: boolean;
  /** True only while the read-back script is being spoken (not next-ask TTS). */
  readingBack: boolean;
  last: ExtractResponse | null;
  flashIds: Set<string>;
  refuseMsg: string | null;
  draftReady: boolean;
  missing: string[];
  completeness: ExtractResponse['completeness'];
  canReadback: boolean;
  confirmGatesOk: boolean;
  confidence: Record<string, FieldConfidence>;
  /** Filled fields with confidence below threshold that the user has not confirmed. */
  flaggedIds: string[];
  confirmField: (id: string) => void;
  readyForFill: boolean;
  selectLanguage: (lang: ShellLanguage) => void;
  selectJourney: (id: JourneyId) => void;
  setMicLang: (lang: MicLang) => void;
  onChange: (id: string, value: string | boolean | null) => void;
  onSubmitUtterance: (text: string) => Promise<void>;
  onSubmitSpeakClip: (wav: Blob) => Promise<{ transcript: string | null; error: string | null }>;
  /** Pass true for the demo-only low-confidence variant (DOB + mobile flagged). */
  onPriya: (withFlags?: boolean) => void;
  onClear: () => void;
  onReadback: () => Promise<void>;
  onStopReadback: () => void;
  onTryLiveSubmit: () => void;
  emitDraft: () => void;
  said: Record<string, string>;
  selectDraft: (id: JourneyId, product: string | null) => void;
}

const FormSessionContext = createContext<FormSessionValue | null>(null);

export function FormSessionProvider({ children }: { children: ReactNode }) {
  const saved = useMemo(() => loadPersisted(), []);
  const [language, setLanguage] = useState<ShellLanguage | null>(saved?.language ?? 'en');
  const [journey, setJourney] = useState<JourneyId | null>(saved?.journey ?? 'account_opening');
  const [micLang, setMicLangState] = useState<MicLang>(saved?.language === 'hi' ? 'hi-IN' : 'en-IN');
  const [values, setValues] = useState<FormValues>(() => seedValues(saved));
  const [busy, setBusy] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [readingBack, setReadingBack] = useState(false);
  const [last, setLast] = useState<ExtractResponse | null>(null);
  const [flashIds, setFlashIds] = useState<Set<string>>(new Set());
  const [refuseMsg, setRefuseMsg] = useState<string | null>(null);
  const [draftReady, setDraftReady] = useState(false);
  const [said, setSaid] = useState<Record<string, string>>({});
  const [confidence, setConfidence] = useState<Record<string, FieldConfidence>>(
    () => saved?.confidence ?? {},
  );

  const readbackLang: UtteranceLang = micLang === 'hi-IN' ? 'hi' : 'en';
  const detectedLang: UtteranceLang = last?.reply_lang ?? readbackLang;

  const missing = useMemo(() => getMissingRequired(values), [values]);
  const completeness = useMemo(
    () => completenessLevel(values, missing),
    [values, missing],
  );
  const flaggedIds = useMemo(
    () =>
      Object.entries(confidence)
        .filter(([id, c]) => {
          const v = values[id];
          const filled = typeof v === 'boolean' || (typeof v === 'string' && v.trim() !== '');
          return filled && !c.confirmed && c.confidence < CONFIDENCE_FLAG_THRESHOLD;
        })
        .map(([id]) => id),
    [confidence, values],
  );
  const canReadback =
    (completeness === 'demo_ready' || completeness === 'full_bank_packet') && flaggedIds.length === 0;
  const confirmGatesOk =
    flaggedIds.length === 0 &&
    values.readback_confirmed === true &&
    values.draft_only_ack === true &&
    values.no_live_submit_ack === true;
  const readyForFill = language !== null && journey !== null;

  useEffect(() => {
    const payload: Persisted = { language, journey, values, confidence };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, [language, journey, values, confidence]);

  useEffect(() => {
    document.documentElement.lang = language === 'hi' ? 'hi-IN' : 'en-IN';
  }, [language]);

  const applyShellLanguage = useCallback((lang: ShellLanguage) => {
    setLanguage(lang);
    setMicLangState(lang === 'hi' ? 'hi-IN' : 'en-IN');
    setValues((prev) => ({
      ...prev,
      preferred_language: lang === 'hi' ? 'Hindi' : 'English',
    }));
    setDraftReady(false);
  }, []);

  const selectLanguage = useCallback(
    (lang: ShellLanguage) => {
      applyShellLanguage(lang);
    },
    [applyShellLanguage],
  );

  const selectJourney = useCallback((id: JourneyId) => {
    setJourney(id);
    setValues((prev) => ({ ...prev, journey_mode: id }));
    setDraftReady(false);
  }, []);

  const selectDraft = useCallback((id: JourneyId, product: string | null) => {
    setJourney(id);
    setValues((prev) => ({
      ...prev,
      journey_mode: id,
      account_product_intent: product ?? '',
    }));
    setDraftReady(false);
  }, []);

  const setMicLang = useCallback(
    (lang: MicLang) => {
      applyShellLanguage(lang === 'hi-IN' ? 'hi' : 'en');
    },
    [applyShellLanguage],
  );

  const flash = useCallback((ids: string[]) => {
    setFlashIds(new Set(ids));
    window.setTimeout(() => setFlashIds(new Set()), 900);
  }, []);

  const applyUpdates = useCallback(
    (updates: FormValues, response: ExtractResponse, utterance?: string) => {
      setValues((prev) => {
        const next = { ...prev };
        for (const [key, value] of Object.entries(updates)) {
          if (value === undefined) continue;
          // Merge only provided keys; do not clear an already-filled value with empty/null.
          if ((value === null || value === '') && prev[key] !== undefined && prev[key] !== null && prev[key] !== '') {
            continue;
          }
          next[key] = value;
        }
        return next;
      });
      if (utterance?.trim()) {
        const clip = utterance.trim().replace(/\s+/g, ' ');
        setSaid((prev) => {
          const next = { ...prev };
          for (const [key, value] of Object.entries(updates)) {
            if (value !== undefined) next[key] = clip;
          }
          return next;
        });
      }
      setConfidence((prev) => {
        const next = { ...prev };
        const conf = response.field_confidence ?? {};
        for (const [key, value] of Object.entries(updates)) {
          if (value === undefined || value === null || value === '') continue;
          const c = conf[key];
          const score = c && typeof c.confidence === 'number' ? c.confidence : 1;
          next[key] = { confidence: score, reason: c?.reason, confirmed: false };
        }
        return next;
      });
      if (isJourneyId(updates.journey_mode)) setJourney(updates.journey_mode);
      flash(Object.keys(updates));
      setLast(response);
      if (response.refuse_live_submit) {
        setRefuseMsg(
          response.refuse_message ||
            'Refusing live bank submit. Draft only — Fields vary by bank.',
        );
      }
    },
    [flash],
  );

  const onChange = useCallback((id: string, value: string | boolean | null) => {
    setValues((prev) => ({ ...prev, [id]: value }));
    // Typed / edited by the user → confirmed.
    setConfidence((prev) => (prev[id] ? { ...prev, [id]: { ...prev[id], confirmed: true } } : prev));
    setDraftReady(false);
    if (id === 'journey_mode' && isJourneyId(value)) setJourney(value);
  }, []);

  const confirmField = useCallback((id: string) => {
    setConfidence((prev) => ({
      ...prev,
      [id]: { confidence: prev[id]?.confidence ?? 1, reason: prev[id]?.reason, confirmed: true },
    }));
    setDraftReady(false);
  }, []);

  const onSubmitUtterance = useCallback(
    async (text: string) => {
      setBusy(true);
      setRefuseMsg(null);
      setDraftReady(false);
      try {
        const res = await extractFields(text, values);
        applyUpdates(res.field_updates, res, text);
      } finally {
        setBusy(false);
      }
    },
    [values, applyUpdates],
  );


  const onSubmitSpeakClip = useCallback(
    async (wav: Blob): Promise<{ transcript: string | null; error: string | null }> => {
      setBusy(true);
      setRefuseMsg(null);
      setDraftReady(false);
      const body = new FormData();
      body.append('language', micLang);
      body.append('current_values', JSON.stringify(values));
      body.append('audio', wav, 'clip.wav');
      const ctrl = new AbortController();
      const timer = window.setTimeout(() => ctrl.abort(), 70000);
      try {
        const res = await fetch('/api/speak', { method: 'POST', body, signal: ctrl.signal });
        const data = (await res.json()) as ExtractResponse & { transcript?: string; error?: string };
        if (!res.ok) {
          return {
            transcript: typeof data?.transcript === 'string' ? data.transcript : null,
            error: typeof data?.error === 'string' ? data.error : `speak_${res.status}`,
          };
        }
        if (!data || !data.field_updates || typeof data.transcript !== 'string') {
          return { transcript: null, error: 'bad_response' };
        }
        applyUpdates(data.field_updates, data, data.transcript);
        const ask = data.next_ask?.trim() || '';
        const hindi = data.reply_lang === 'hi' || /[\u0900-\u097F]/.test(data.transcript);
        if (ask) {
          setSpeaking(true);
          await speakForUtterance(ask, hindi ? 'hi' : 'en');
        }
        return { transcript: data.transcript, error: null };
      } catch {
        return { transcript: null, error: 'network_error' };
      } finally {
        window.clearTimeout(timer);
        setSpeaking(false);
        setBusy(false);
      }
    },
    [micLang, values, applyUpdates],
  );

  const onPriya = useCallback((withFlags?: boolean) => {
    stopSpeaking();
    setSpeaking(false);
    setReadingBack(false);
    setRefuseMsg(null);
    setDraftReady(false);
    const persona = priyaDemoValues();
    setValues(persona);
    // Demo-only: strict === true so a click event passed as arg never triggers flags.
    setConfidence(
      withFlags === true
        ? {
            dob: { confidence: 0.6, reason: 'Digits unclear in audio', confirmed: false },
            mobile_registered: { confidence: 0.58, reason: 'Digits unclear in audio', confirmed: false },
          }
        : {},
    );
    if (isJourneyId(persona.journey_mode)) setJourney(persona.journey_mode);
    flash(Object.keys(persona).filter((key) => persona[key] !== '' && persona[key] !== null));
    const miss = getMissingRequired(persona);
    const level = completenessLevel(persona, miss);
    const clip = 'Fake prefill demo';
    setSaid(() => {
      const next: Record<string, string> = {};
      for (const [key, value] of Object.entries(persona)) {
        if (value !== undefined && value !== '' && value !== null) next[key] = clip;
      }
      return next;
    });
    setLast({
      field_updates: persona,
      missing_required: miss,
      next_ask:
        getNextAsk(miss, persona, language === 'hi' ? 'hi' : 'en') ||
        (miss.length === 0
          ? language === 'hi'
            ? 'डेमो प्रीफ़िल पूरा। रीड-बैक सुनें, फिर तीन गेट कन्फ़र्म करें। Fields vary by bank.'
            : 'Demo persona loaded (synthetic PAN/mobile). Tap TTS read-back, then confirm the three gates. Fields vary by bank.'
          : null),
      gates: {
        answers: {
          journey_type: {
            type: 'choice',
            choice: 'account_opening',
            confidence: 0.86,
          },
          score_completeness: {
            type: 'score',
            score: 3,
            levels: ['empty', 'partial_core', 'demo_ready', 'full_bank_packet'],
            confidence: 0.78,
          },
          noul_ready_for_readback: { type: 'noul', noul: 0.94 },
          noul_requests_live_bank_submit: { type: 'noul', noul: 0.04 },
        },
      },
      completeness: level,
      refuse_live_submit: false,
      source: 'priya_demo',
      assistant_message:
        'Filled Priya Sharma dry-run (synthetic PAN ABCPS1234D / mobile 9876543210). Confirm gates left for you after TTS. Fields vary by bank.',
    });
  }, [flash, language]);

  const onClear = useCallback(() => {
    stopSpeaking();
    setSpeaking(false);
    setReadingBack(false);
    const next = emptyValues();
    if (journey) next.journey_mode = journey;
    if (language) next.preferred_language = language === 'hi' ? 'Hindi' : 'English';
    setValues(next);
    setConfidence({});
    setLast(null);
    setSaid({});
    setRefuseMsg(null);
    setDraftReady(false);
  }, [journey, language]);

  const readbackWatch = useRef<{ poll: number; cap: number; finish: () => void } | null>(null);
  const clearReadbackWatch = useCallback(() => {
    const w = readbackWatch.current;
    if (w) {
      window.clearInterval(w.poll);
      window.clearTimeout(w.cap);
      readbackWatch.current = null;
    }
  }, []);
  useEffect(() => clearReadbackWatch, [clearReadbackWatch]);

  /**
   * Resolves when speech ends, OR when a watchdog decides it is done: speechSynthesis.speaking
   * went false after starting, never started within 1.5s, or a hard cap of
   * max(4s, chars*90ms)+2s elapsed. Covers devices with no audio where onend/onerror never fire.
   */
  const watchReadback = useCallback(
    (text: string, speech: Promise<void>): Promise<void> => {
      clearReadbackWatch();
      return new Promise<void>((resolve) => {
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          clearReadbackWatch();
          resolve();
        };
        const synth = 'speechSynthesis' in window ? window.speechSynthesis : null;
        const startedAt = Date.now();
        let started = false;
        const poll = window.setInterval(() => {
          const active = Boolean(synth && (synth.speaking || synth.pending));
          if (active) started = true;
          else if (started || Date.now() - startedAt >= 1500) finish();
        }, 500);
        const cap = window.setTimeout(finish, Math.max(4000, text.length * 90) + 2000);
        readbackWatch.current = { poll, cap, finish };
        speech.then(finish, finish);
      });
    },
    [clearReadbackWatch],
  );

  const onReadback = useCallback(async () => {
    const script = buildReadbackScript(values, readbackLang);
    setLast((prev) => ({
      field_updates: {},
      missing_required: missing,
      next_ask: readbackFollowup(readbackLang),
      reply_lang: readbackLang,
      gates: prev?.gates ?? { answers: {} },
      completeness,
      refuse_live_submit: false,
      source: prev?.source ?? 'heuristic',
      assistant_message: script,
    }));
    setSpeaking(true);
    setReadingBack(true);
    try {
      await watchReadback(script, speakForUtterance(script, readbackLang));
    } finally {
      setSpeaking(false);
      setReadingBack(false);
    }
  }, [values, missing, completeness, readbackLang, watchReadback]);

  const onStopReadback = useCallback(() => {
    stopSpeaking();
    // Resolve the pending watcher so onReadback's finally runs.
    if (readbackWatch.current) readbackWatch.current.finish();
    else clearReadbackWatch();
    setSpeaking(false);
    setReadingBack(false);
  }, [clearReadbackWatch]);

  const onTryLiveSubmit = useCallback(() => {
    setRefuseMsg(tryLiveMessage(readbackLang));
    setDraftReady(false);
    setLast((prev) => ({
      field_updates: {},
      missing_required: missing,
      next_ask: 'Acknowledge draft-only and no-live-submit, then emit draft JSON locally.',
      gates: {
        answers: {
          ...(prev?.gates.answers ?? {}),
          noul_requests_live_bank_submit: { type: 'noul', noul: 0.97 },
        },
      },
      completeness,
      refuse_live_submit: true,
      refuse_message: 'Live bank submit refused.',
      source: prev?.source ?? 'heuristic',
      reply_lang: readbackLang,
      assistant_message:
        readbackLang === 'en'
          ? 'Guardrail fired: noul_requests_live_bank_submit high → refuse. Draft only.'
          : 'गार्डरेल: लाइव बैंक जमा मना। केवल ड्राफ्ट। Fields vary by bank.',
    }));
  }, [missing, completeness, readbackLang]);

  const emitDraft = useCallback(() => {
    if (!canReadback || !confirmGatesOk) return;
    setDraftReady(true);
    setRefuseMsg(null);
  }, [canReadback, confirmGatesOk]);

  const value: FormSessionValue = {
    language,
    journey,
    micLang,
    readbackLang,
    detectedLang,
    values,
    busy,
    speaking,
    readingBack,
    last,
    flashIds,
    refuseMsg,
    draftReady,
    missing,
    completeness,
    canReadback,
    confirmGatesOk,
    confidence,
    flaggedIds,
    confirmField,
    readyForFill,
    selectLanguage,
    selectJourney,
    setMicLang,
    onChange,
    onSubmitUtterance,
    onSubmitSpeakClip,
    onPriya,
    onClear,
    onReadback,
    onStopReadback,
    onTryLiveSubmit,
    emitDraft,
    said,
    selectDraft,
  };

  return <FormSessionContext.Provider value={value}>{children}</FormSessionContext.Provider>;
}

export function useFormSession(): FormSessionValue {
  const ctx = useContext(FormSessionContext);
  if (!ctx) throw new Error('useFormSession must be used within FormSessionProvider');
  return ctx;
}
