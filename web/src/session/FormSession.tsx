import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { extractFields } from '../lib/extractClient';
import { buildReadbackScript } from '../lib/heuristicExtract';
import { isJourneyId, type JourneyId } from '../lib/journeys';
import { downscaleToJpeg } from '../lib/panImage';
import {
  PAN_MISMATCH_REASON,
  decidePanApply,
  displayPanValue,
  panResultNote,
  speechAgainstPan,
  type PanDocId,
  type PanDocValues,
} from '../lib/panDocument';
import { maskSensitiveFields } from '../lib/pii';
import {
  completenessLevel,
  emptyValues,
  getMissingRequired,
  getNextAsk,
  priyaDemoValues,
} from '../lib/schema';
import { speakForUtterance, stopSpeaking } from '../lib/tts';
import type { ExtractResponse, FormValues } from '../lib/types';
import { readbackFollowup, type UtteranceLang } from '../lib/utteranceLang';

export type ShellLanguage = 'en' | 'hi';
export type MicLang = 'en-IN' | 'hi-IN';

const STORAGE_KEY = 'formguide.cup.session.v2';

/** Fields below this model confidence get a 'Check this' flag until confirmed. */
export const CONFIDENCE_FLAG_THRESHOLD = 0.75;

const DEMO_FLAG_REASON = 'Digits unclear in audio';

/** Local demo only. DOB 0.60 and mobile 0.58 stay under the 0.75 flag threshold. */
export function demoFlagConfidence(): Record<string, FieldConfidence> {
  return {
    dob: { confidence: 0.6, reason: DEMO_FLAG_REASON, confirmed: false },
    mobile_registered: { confidence: 0.58, reason: DEMO_FLAG_REASON, confirmed: false },
  };
}

/** True when this document was opened on /speak?flags=1. Latched so a later history rewrite cannot drop it. */
export function flagsDemoRequested(): boolean {
  if (typeof window === 'undefined') return false;
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  if (path !== '/speak') return false;
  return new URLSearchParams(window.location.search).get('flags') === '1' || flagsQueryLatched;
}

const flagsQueryLatched =
  typeof window !== 'undefined' &&
  (window.location.pathname.replace(/\/+$/, '') || '/') === '/speak' &&
  new URLSearchParams(window.location.search).get('flags') === '1';

const READBACK_NO_START_MS = 5000;

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

function parseConfidence(raw: unknown): Record<string, FieldConfidence> {
  const out: Record<string, FieldConfidence> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [id, entry] of Object.entries(raw as Record<string, unknown>)) {
    if (!entry || typeof entry !== 'object') continue;
    const { confidence, reason, confirmed } = entry as Record<string, unknown>;
    if (typeof confidence !== 'number' || !Number.isFinite(confidence)) continue;
    out[id] = {
      confidence: Math.max(0, Math.min(1, confidence)),
      reason: typeof reason === 'string' ? reason : undefined,
      confirmed: confirmed === true,
    };
  }
  return out;
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
    return { language, journey, values, confidence: parseConfidence(data.confidence) };
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
  /** Name, DOB, and PAN last filled from a PAN photo. Memory only — not persisted. */
  documentFieldIds: string[];
  onSubmitPanPhoto: (file: Blob) => Promise<{ error: string | null; note: string | null }>;
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
  emitDraft: () => void;
  said: Record<string, string>;
  fieldSource: Record<string, string>;
  selectDraft: (id: JourneyId, product: string | null) => void;
}

const FormSessionContext = createContext<FormSessionValue | null>(null);

export function FormSessionProvider({ children }: { children: ReactNode }) {
  const saved = useMemo(() => loadPersisted(), []);
  // Captured once: a saved complete draft must not keep Read back enabled on /speak?flags=1.
  const bootFlags = useRef(flagsDemoRequested());
  const [language, setLanguage] = useState<ShellLanguage | null>(saved?.language ?? 'en');
  const [journey, setJourney] = useState<JourneyId | null>(() => {
    if (!bootFlags.current) return saved?.journey ?? 'account_opening';
    const persona = priyaDemoValues();
    return isJourneyId(persona.journey_mode) ? persona.journey_mode : (saved?.journey ?? 'account_opening');
  });
  const [micLang, setMicLangState] = useState<MicLang>(saved?.language === 'hi' ? 'hi-IN' : 'en-IN');
  const [values, setValues] = useState<FormValues>(() =>
    bootFlags.current ? priyaDemoValues() : seedValues(saved),
  );
  const [busy, setBusy] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [readingBack, setReadingBack] = useState(false);
  const [last, setLast] = useState<ExtractResponse | null>(null);
  const [flashIds, setFlashIds] = useState<Set<string>>(new Set());
  const [refuseMsg, setRefuseMsg] = useState<string | null>(null);
  const [draftReady, setDraftReady] = useState(false);
  const [said, setSaid] = useState<Record<string, string>>({});
  const [confidence, setConfidence] = useState<Record<string, FieldConfidence>>(() =>
    bootFlags.current ? demoFlagConfidence() : (saved?.confidence ?? {}),
  );
  const [fieldSource, setFieldSource] = useState<Record<string, string>>({});
  // PAN photo bytes are never kept. These two track the read for this page load only.
  const [fromDocument, setFromDocument] = useState<Set<string>>(() => new Set());
  const fromDocumentRef = useRef<Set<string>>(new Set());
  const panSnapshotRef = useRef<PanDocValues>({});
  const documentFieldIds = useMemo(() => [...fromDocument], [fromDocument]);

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
    // Photo bytes and the PAN snapshot stay in memory only — never this payload.
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
        // Aadhaar must never land in state (and therefore sessionStorage,
        // the screen, or a downloaded draft) unmasked, regardless of
        // whether it came from speak, extract, or the heuristic fallback.
        maskSensitiveFields(next);
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
        // A spoken value that arrives after the PAN fill is checked here too.
        if (utterance?.trim()) {
          const judged = speechAgainstPan(updates, panSnapshotRef.current);
          for (const id of judged.matches) {
            next[id] = { confidence: 1, confirmed: true };
          }
          for (const id of judged.conflicts) {
            next[id] = { confidence: 0.4, reason: PAN_MISMATCH_REASON, confirmed: false };
          }
        }
        return next;
      });
      setFieldSource((prev) => {
        const next = { ...prev };
        for (const [key, value] of Object.entries(updates)) {
          if (value !== undefined) next[key] = response.source;
        }
        return next;
      });
      if (utterance?.trim()) {
        const judged = speechAgainstPan(updates, panSnapshotRef.current);
        if (judged.matches.length || judged.conflicts.length) {
          const next = new Set(fromDocumentRef.current);
          for (const id of judged.matches) next.delete(id);
          for (const id of judged.conflicts) next.delete(id);
          fromDocumentRef.current = next;
          setFromDocument(next);
        }
      }
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
    setValues((prev) => {
      const next = { ...prev, [id]: value };
      // Mask once a full Aadhaar-length number has been typed, so manual
      // edits on the Review page can't leave a full number sitting in
      // state. Only triggers at 12 digits so it doesn't fight live typing
      // of shorter document numbers.
      if ((id === 'ovd_poi_number' || id === 'ovd_poa_number') && typeof value === 'string') {
        const digits = value.replace(/\D/g, '');
        if (digits.length >= 12) maskSensitiveFields(next);
      }
      return next;
    });
    // Typed / edited by the user → confirmed, which clears a Check-this flag.
    setConfidence((prev) => (prev[id] ? { ...prev, [id]: { ...prev[id], confirmed: true } } : prev));
    setFieldSource((prev) => ({ ...prev, [id]: 'manual' }));
    if (fromDocumentRef.current.has(id)) {
      const next = new Set(fromDocumentRef.current);
      next.delete(id);
      fromDocumentRef.current = next;
      setFromDocument(next);
    }
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

  const onSubmitPanPhoto = useCallback(
    async (file: Blob): Promise<{ error: string | null; note: string | null }> => {
      setBusy(true);
      setRefuseMsg(null);
      setDraftReady(false);
      const fail = "Could not read that photo. Nothing was filled.";
      try {
        let jpeg: Blob;
        try {
          jpeg = await downscaleToJpeg(file);
        } catch (err) {
          const tooBig = err instanceof Error && err.message === 'too_large';
          return {
            error: tooBig ? 'That photo is too large. Nothing was filled.' : fail,
            note: null,
          };
        }
        const body = new FormData();
        body.append('mode', 'pan');
        body.append('image', jpeg, 'pan.jpg');
        const ctrl = new AbortController();
        const timer = window.setTimeout(() => ctrl.abort(), 70000);
        try {
          const res = await fetch('/api/speak', { method: 'POST', body, signal: ctrl.signal });
          const data = (await res.json()) as {
            mode?: string;
            field_updates?: PanDocValues;
            message?: string;
          };
          if (!res.ok || data.mode !== 'pan' || !data.field_updates || typeof data.field_updates !== 'object') {
            const message = typeof data?.message === 'string' && data.message.trim() ? data.message : fail;
            return { error: message, note: null };
          }
          const extracted: PanDocValues = {};
          for (const id of ['applicant_full_name', 'dob', 'pan_number'] as const) {
            const value = data.field_updates[id];
            if (typeof value === 'string' && value.trim()) extracted[id] = value;
          }
          if (!extracted.applicant_full_name && !extracted.dob && !extracted.pan_number) {
            return {
              error: "That photo isn't a readable PAN card. Nothing was filled.",
              note: null,
            };
          }
          const decision = decidePanApply(values, extracted, fromDocumentRef.current);
          const snap: PanDocValues = {};
          for (const id of Object.keys(extracted) as PanDocId[]) {
            const raw = extracted[id];
            if (raw) snap[id] = displayPanValue(id, raw);
          }
          panSnapshotRef.current = snap;
          const nextDoc = new Set(fromDocumentRef.current);
          for (const id of decision.conflicts) nextDoc.delete(id);
          for (const id of decision.matches) nextDoc.delete(id);
          for (const id of decision.fromDocument) nextDoc.add(id);
          fromDocumentRef.current = nextDoc;
          setFromDocument(nextDoc);
          if (Object.keys(decision.fill).length) {
            setValues((prev) => ({ ...prev, ...decision.fill }));
            flash(Object.keys(decision.fill));
          }
          setConfidence((prev) => {
            const next = { ...prev };
            for (const id of decision.fromDocument) {
              next[id] = { confidence: 1, confirmed: true };
            }
            for (const id of decision.matches) {
              next[id] = { confidence: 1, confirmed: true };
            }
            for (const id of decision.conflicts) {
              next[id] = { confidence: 0.4, reason: PAN_MISMATCH_REASON, confirmed: false };
            }
            return next;
          });
          const merged = { ...values, ...decision.fill };
          const miss = getMissingRequired(merged);
          const level = completenessLevel(merged, miss);
          const note = panResultNote(decision, language === 'hi');
          setLast((prev) => ({
            field_updates: decision.fill,
            missing_required: miss,
            next_ask: getNextAsk(miss, merged, readbackLang),
            gates: prev?.gates ?? { answers: {} },
            completeness: level,
            refuse_live_submit: false,
            source: 'gemini',
            reply_lang: readbackLang,
            assistant_message: note,
          }));
          return { error: null, note };
        } catch {
          return { error: fail, note: null };
        } finally {
          window.clearTimeout(timer);
        }
      } finally {
        setBusy(false);
      }
    },
    [values, flash, language, readbackLang],
  );

  const onPriya = useCallback((withFlags?: boolean) => {
    stopSpeaking();
    setSpeaking(false);
    setReadingBack(false);
    setRefuseMsg(null);
    setDraftReady(false);
    const persona = priyaDemoValues();
    maskSensitiveFields(persona);
    setValues(persona);
    // Demo-only: strict === true so a click event passed as arg never triggers flags.
    setConfidence(withFlags === true ? demoFlagConfidence() : {});
    panSnapshotRef.current = {};
    fromDocumentRef.current = new Set();
    setFromDocument(new Set());
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
    setFieldSource(() => {
      const next: Record<string, string> = {};
      for (const [key, value] of Object.entries(persona)) {
        if (value !== undefined && value !== '' && value !== null) next[key] = 'priya_demo';
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

  const flagsBooted = useRef(false);
  useLayoutEffect(() => {
    // Same local persona as Shift/Alt-click. No extract or Gemini call.
    if (!bootFlags.current || flagsBooted.current) return;
    flagsBooted.current = true;
    onPriya(true);
  }, [onPriya]);

  const onClear = useCallback(() => {
    stopSpeaking();
    setSpeaking(false);
    setReadingBack(false);
    const next = emptyValues();
    if (journey) next.journey_mode = journey;
    if (language) next.preferred_language = language === 'hi' ? 'Hindi' : 'English';
    setValues(next);
    setConfidence({});
    panSnapshotRef.current = {};
    fromDocumentRef.current = new Set();
    setFromDocument(new Set());
    setLast(null);
    setSaid({});
    setFieldSource({});
    setRefuseMsg(null);
    setDraftReady(false);
  }, [journey, language]);

  const readbackRun = useRef<{ id: number; finish: () => void; startedAt: number } | null>(null);
  const readbackSeq = useRef(0);
  useEffect(
    () => () => {
      if (readbackRun.current) {
        stopSpeaking();
        readbackRun.current.finish();
      }
    },
    [],
  );

  /**
   * Speaks the read-back and resolves on end/error, OR when a watchdog decides it is done:
   * - no onstart within READBACK_NO_START_MS → cancel and finish (no-audio boxes can report
   *   speechSynthesis.speaking=true with nothing playing; voices can take seconds to load on
   *   first use, so the wait is deliberately generous);
   * - after onstart, speechSynthesis.speaking and .pending both go false → finish;
   * - safety cap well past the expected spoken length → cancel speech and finish, so the UI
   *   never reports "done" while audio is still playing.
   * Each run owns its timers; finishing one run never touches another run's timers.
   */
  const watchReadback = useCallback(
    (id: number, text: string, lang: UtteranceLang): Promise<void> =>
      new Promise<void>((resolve) => {
        let settled = false;
        let started = false;
        const synth = 'speechSynthesis' in window ? window.speechSynthesis : null;
        const startedAt = Date.now();
        const log = (msg: string, ...rest: unknown[]) =>
          console.info(`[readback #${id}] +${Date.now() - startedAt}ms ${msg}`, ...rest);
        const capMs = Math.max(20000, text.length * 150) + 10000;
        let poll = 0;
        let cap = 0;
        const finish = () => {
          if (settled) return;
          settled = true;
          window.clearInterval(poll);
          window.clearTimeout(cap);
          if (readbackRun.current?.id === id) readbackRun.current = null;
          resolve();
        };
        poll = window.setInterval(() => {
          if (!started) {
            if (Date.now() - startedAt < READBACK_NO_START_MS) return;
            log(`no-start timeout (no onstart within ${READBACK_NO_START_MS}ms) → cancel`);
            stopSpeaking();
            finish();
          } else if (!synth || (!synth.speaking && !synth.pending)) {
            log('poll: speaking/pending false', { speaking: synth?.speaking, pending: synth?.pending });
            finish();
          }
        }, 500);
        cap = window.setTimeout(() => {
          log(`safety cap fired (capMs=${capMs}) → cancel`);
          stopSpeaking();
          finish();
        }, capMs);
        readbackRun.current = { id, finish, startedAt };
        log(`speak called (chars=${text.length}, capMs=${capMs}, lang=${lang})`);
        speakForUtterance(text, lang, {
          onStart: () => {
            started = true;
            log('onstart');
          },
          onEnd: () => log('onend'),
          onError: (error) => log('onerror', error),
        }).then(finish, finish);
      }),
    [],
  );

  const onReadback = useCallback(async () => {
    // Flagged fields block read-back until each one is confirmed (threshold 0.75).
    if (!canReadback) return;
    if (readbackRun.current) {
      stopSpeaking();
      readbackRun.current.finish();
    }
    const id = ++readbackSeq.current;
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
      await watchReadback(id, script, readbackLang);
    } finally {
      // A newer read-back owns the speaking state once it has started.
      if (readbackSeq.current === id) {
        setSpeaking(false);
        setReadingBack(false);
      }
    }
  }, [values, missing, completeness, readbackLang, watchReadback, canReadback]);

  const onStopReadback = useCallback(() => {
    stopSpeaking();
    const run = readbackRun.current;
    if (run) {
      console.info(`[readback #${run.id}] +${Date.now() - run.startedAt}ms manual stop`);
      run.finish();
    }
    setSpeaking(false);
    setReadingBack(false);
  }, []);

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
    documentFieldIds,
    onSubmitPanPhoto,
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
    emitDraft,
    said,
    fieldSource,
    selectDraft,
  };

  return <FormSessionContext.Provider value={value}>{children}</FormSessionContext.Provider>;
}

export function useFormSession(): FormSessionValue {
  const ctx = useContext(FormSessionContext);
  if (!ctx) throw new Error('useFormSession must be used within FormSessionProvider');
  return ctx;
}
