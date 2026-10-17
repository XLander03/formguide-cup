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
import { bankOnlyFields, formKey, isBundledForm, parseStoredForm } from '../forms/activeForm';
import { HDFC_V1, aadhaarPartialFieldIds } from '../forms/hdfcV1';
import type { FormVersion } from '../forms/types';
import { cardLast4, debitDefaults, isDebitJourney, redactFullCardNumbers } from '../lib/debitReissue';
import { extractFields } from '../lib/extractClient';
import { buildReadbackScript } from '../lib/heuristicExtract';
import { carryPlanAnswers, parseStoredPlan, stepCardId, type ActivePlan } from '../lib/journeyPlan';
import { isJourneyId, type JourneyId } from '../lib/journeys';
import { maskSensitiveFields, shouldRedactAadhaarQuote } from '../lib/pii';
import { speakFormFields } from '../lib/speakFormFields';
import {
  completenessLevel,
  emptyValues,
  getMissingRequired,
  getNextAsk,
  isFilled,
  priyaDemoValues,
  updateApplies,
} from '../lib/schema';
import { speak, speakForUtterance, stopSpeaking } from '../lib/tts';
import type { ExtractResponse, FormValues } from '../lib/types';
import { invalidFieldIds, normalizeInput } from '../lib/validate';
import { readbackFollowup, type UtteranceLang } from '../lib/utteranceLang';
import type { VoiceCommand, VoiceContext } from '../../../shared/voiceCommands';
import {
  hasNonLatinLetter,
  languageByBcp47,
  languageById,
  resolveReadbackVoice,
  storedLanguageName,
  type MicLang,
  type ShellLanguage,
} from '../lib/languages';

const AADHAAR_PARTIAL_IDS = aadhaarPartialFieldIds();

export type { MicLang, ShellLanguage };

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
  /** Published form being filled. Absent or invalid means the bundled HDFC v1. */
  form?: FormVersion;
  /** Multi-form plan from the journey planner, and the step being filled. */
  plan?: ActivePlan & { step: number };
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
    const language = languageById(typeof data.language === 'string' ? data.language : null)?.id ?? null;
    const journey = isJourneyId(data.journey) ? data.journey : null;
    const values =
      data.values && typeof data.values === 'object' ? (data.values as FormValues) : {};
    const stored = parseStoredPlan(data.plan);
    return {
      language,
      journey,
      values,
      confidence: parseConfidence(data.confidence),
      form: parseStoredForm(data.form) ?? HDFC_V1,
      ...(stored ? { plan: { ...stored.plan, step: stored.step } } : {}),
    };
  } catch {
    return null;
  }
}

/** A published bank form is for one journey. The bundled HDFC form covers all of them. */
function lockedJourney(form: FormVersion): JourneyId | null {
  return !isBundledForm(form) && isJourneyId(form.journey) ? form.journey : null;
}

/** Shared schema keys plus the active form's bank-only keys. */
function formValueKeys(form: FormVersion): Set<string> {
  return new Set([...Object.keys(emptyValues()), ...bankOnlyFields(form).map((field) => field.id)]);
}

function seedValues(saved: Persisted | null): FormValues {
  const base = emptyValues();
  const keys = formValueKeys(saved?.form ?? HDFC_V1);
  if (saved?.values) {
    for (const [key, value] of Object.entries(saved.values)) {
      if (keys.has(key) && value !== undefined) {
        base[key] =
          typeof value === 'string' || typeof value === 'boolean' || value === null
            ? normalizeInput(key, value)
            : value;
      }
    }
  }
  if (saved?.journey) base.journey_mode = saved.journey;
  else if (!base.journey_mode) base.journey_mode = 'account_opening';
  if (saved?.language) base.preferred_language = storedLanguageName(saved.language);
  else if (!base.preferred_language) base.preferred_language = 'English';
  if (base.journey_mode === 'account_opening' && !base.account_product_intent) {
    base.account_product_intent = 'regular_savings';
  }
  return withDebitDefaults(base);
}

const GATE_IDS = ['card_old_blocked_ack', 'readback_confirmed', 'draft_only_ack', 'no_live_submit_ack'];

/** Fill debit card defaults (reissue yes, charges to the same account) where still empty. */
function withDebitDefaults(values: FormValues): FormValues {
  if (!isDebitJourney(values.journey_mode)) return values;
  const next = { ...values };
  for (const [key, value] of Object.entries(debitDefaults())) {
    if (!isFilled(next[key])) next[key] = value;
  }
  return next;
}

/**
 * Point the draft at a journey. AOF/KYC and debit card reissue share no fields
 * past the name, so their values sit side by side and each journey shows only
 * its own. Crossing between them clears the gates so a read-back confirmed for
 * one never carries over to the other.
 */
function withJourney(prev: FormValues, id: JourneyId): FormValues {
  const next: FormValues = { ...prev, journey_mode: id };
  if (isDebitJourney(id) !== isDebitJourney(prev.journey_mode)) {
    for (const gate of GATE_IDS) next[gate] = null;
  }
  return withDebitDefaults(next);
}

/** Card fields keep digits only, and a full card number is cut to its last 4. */
function normalizeCardInput(id: string, value: string | boolean | null): string | boolean | null {
  if (typeof value !== 'string') return value;
  if (id === 'card_last4') return cardLast4(value);
  if (id === 'card_account_number') return value.replace(/\D/g, '').slice(0, 18);
  if (id === 'card_confirm_mobile') {
    const digits = value.replace(/\D/g, '');
    return digits.length > 10 ? digits.slice(-10) : digits;
  }
  return value;
}

/** One voice turn through the speak function, as the pages need it. */
export interface VoiceTurnResult {
  transcript: string | null;
  error: string | null;
  /** The field model failed and the transcript was filled locally instead. */
  fallback?: boolean;
  intent?: ExtractResponse['intent'];
  command?: VoiceCommand | null;
  /** What to say back: the reply (answer or change), then the next question. Empty when nothing. */
  spoken: string;
  replyLang: 'en' | 'hi';
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
  /** Beta language had no Web Speech voice, so this read-back is spoken in English. */
  readbackInEnglish: boolean;
  last: ExtractResponse | null;
  flashIds: Set<string>;
  refuseMsg: string | null;
  draftReady: boolean;
  missing: string[];
  completeness: ExtractResponse['completeness'];
  canReadback: boolean;
  confirmGatesOk: boolean;
  /** Filled fields whose value does not match the schema format. PAN must be capitals. */
  invalidIds: string[];
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
  /** `fallback` means the field model failed and the transcript was filled locally instead. */
  onSubmitSpeakClip: (
    wav: Blob,
  ) => Promise<{ transcript: string | null; error: string | null; fallback?: boolean }>;
  /** One voice turn (fill, read-back, review or confirm). Fills fields; never speaks. */
  voiceTurn: (wav: Blob, context: VoiceContext) => Promise<VoiceTurnResult>;
  /** Speaks one line and resolves when it has finished. */
  say: (text: string, lang?: UtteranceLang) => Promise<void>;
  /** FormGuide asks each question aloud and listens by itself, on Speak, Review and Confirm. */
  handsFree: boolean;
  setHandsFree: (on: boolean) => void;
  /** A spoken "yes" at the read-back: ticks the read-back, draft-only and no-live-submit gates. */
  confirmGates: () => void;
  /** Pass true for the demo-only low-confidence variant (DOB + mobile flagged). */
  onPriya: (withFlags?: boolean) => void;
  onClear: () => void;
  onReadback: () => Promise<void>;
  onStopReadback: () => void;
  emitDraft: () => void;
  said: Record<string, string>;
  fieldSource: Record<string, string>;
  selectDraft: (id: JourneyId, product: string | null) => void;
  /** Bundled HDFC v1, or a published form from Firestore. */
  form: FormVersion;
  /** Switching forms drops the previous form's bank-only answers. Shared answers stay. */
  selectForm: (form: FormVersion) => void;
  /** Ordered forms from the journey planner, or null when the customer picked one form by hand. */
  plan: ActivePlan | null;
  /** Index into `plan.steps` of the form being filled. */
  planStep: number;
  /**
   * Fill step `index` of `plan` on `form`. Shared answers (name, DOB, mobile, address…) carry over;
   * the confirm gates reset so a read-back confirmed for one form never counts for the next.
   */
  beginPlanStep: (plan: ActivePlan, index: number, form: FormVersion) => void;
  clearPlan: () => void;
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
  const [form, setForm] = useState<FormVersion>(saved?.form ?? HDFC_V1);
  const [plan, setPlan] = useState<ActivePlan | null>(() => {
    if (!saved?.plan) return null;
    const { steps, reply, trace, text } = saved.plan;
    return { steps, reply, trace, text };
  });
  const [planStep, setPlanStep] = useState(saved?.plan?.step ?? 0);
  // applyUpdates is memoized without the plan; read the planned journey here.
  const planJourneyRef = useRef<JourneyId | null>(null);
  planJourneyRef.current = plan?.steps[planStep]?.journey ?? null;
  // applyUpdates and onPriya are memoized without `form`; read the current one here.
  const formRef = useRef(form);
  formRef.current = form;
  // applyUpdates is memoized without `journey`; read the current one here.
  const journeyRef = useRef(journey);
  journeyRef.current = journey;
  const [micLang, setMicLangState] = useState<MicLang>(languageById(saved?.language)?.bcp47 ?? 'en-IN');
  const [values, setValues] = useState<FormValues>(() =>
    bootFlags.current ? priyaDemoValues() : seedValues(saved),
  );
  const [busy, setBusy] = useState(false);
  const [handsFree, setHandsFree] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [readingBack, setReadingBack] = useState(false);
  const [readbackInEnglish, setReadbackInEnglish] = useState(false);
  const [last, setLast] = useState<ExtractResponse | null>(null);
  const [flashIds, setFlashIds] = useState<Set<string>>(new Set());
  const [refuseMsg, setRefuseMsg] = useState<string | null>(null);
  const [draftReady, setDraftReady] = useState(false);
  const [said, setSaid] = useState<Record<string, string>>({});
  const [confidence, setConfidence] = useState<Record<string, FieldConfidence>>(() =>
    bootFlags.current ? demoFlagConfidence() : (saved?.confidence ?? {}),
  );
  /** Per-field provenance ('gemini' | 'heuristic' | 'manual' | 'priya_demo' |
   * 'heuristic-dev') — drives the confidence badge in the bank-handoff
   * preview and rides along in the exported JSON. Distinct from
   * `confidence` above: that's a numeric model-sourced score that gates
   * the readback flow; this is a categorical label for display/export. */
  const [fieldSource, setFieldSource] = useState<Record<string, string>>({});

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
          return filled && !c.confirmed && c.confidence < CONFIDENCE_FLAG_THRESHOLD && updateApplies(id, values);
        })
        .map(([id]) => id),
    [confidence, values],
  );
  // A field from the other journey is off screen, so it must not block this one.
  const invalidIds = useMemo(
    () => invalidFieldIds(values).filter((id) => updateApplies(id, values)),
    [values],
  );
  const oldCardBlockedOk = !isDebitJourney(values.journey_mode) || values.card_old_blocked_ack === true;
  const canReadback =
    (completeness === 'demo_ready' || completeness === 'full_bank_packet') &&
    flaggedIds.length === 0 &&
    invalidIds.length === 0 &&
    oldCardBlockedOk;
  const confirmGatesOk =
    flaggedIds.length === 0 &&
    invalidIds.length === 0 &&
    oldCardBlockedOk &&
    values.readback_confirmed === true &&
    values.draft_only_ack === true &&
    values.no_live_submit_ack === true;
  const readyForFill = language !== null && journey !== null;

  // journey_mode / preferred_language / account_product_intent are always
  // pre-seeded on a fresh session (see seedValues) — excluding them is what
  // separates "nothing entered yet" from "there's real progress to lose."
  const hasProgress = useMemo(
    () =>
      Object.entries(values).some(
        ([id, v]) =>
          id !== 'journey_mode' && id !== 'preferred_language' && id !== 'account_product_intent' && isFilled(v),
      ),
    [values],
  );

  useEffect(() => {
    const payload: Persisted = {
      language,
      journey,
      values,
      confidence,
      form,
      ...(plan ? { plan: { ...plan, step: planStep } } : {}),
    };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, [language, journey, values, confidence, form, plan, planStep]);

  useEffect(() => {
    // Browsers show their own fixed confirmation text on refresh/close —
    // custom messages have been ignored by every major browser since
    // ~2011 (anti-abuse measure), so this can't say the specific wording
    // asked for, only trigger the native "leave site?" prompt.
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!hasProgress) return;
      e.preventDefault();
      e.returnValue = '';
    };
    // Fires only once the page actually unloads — i.e. the user confirmed
    // "Leave" (or there was nothing to warn about). Never fires on Cancel,
    // so the draft stays intact until a refresh/close is actually confirmed.
    const handlePageHide = () => {
      sessionStorage.removeItem(STORAGE_KEY);
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handlePageHide);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [hasProgress]);

  useEffect(() => {
    document.documentElement.lang = languageById(language)?.bcp47 ?? 'en-IN';
  }, [language]);

  const applyShellLanguage = useCallback((lang: ShellLanguage) => {
    const option = languageById(lang);
    if (!option) return;
    setLanguage(option.id);
    setMicLangState(option.bcp47);
    setValues((prev) => ({
      ...prev,
      preferred_language: option.englishName,
    }));
    setReadbackInEnglish(false);
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
    setValues((prev) => withJourney(prev, id));
    setDraftReady(false);
  }, []);

  const selectDraft = useCallback((id: JourneyId, product: string | null) => {
    setJourney(id);
    setValues((prev) => ({ ...withJourney(prev, id), account_product_intent: product ?? '' }));
    setDraftReady(false);
  }, []);

  const selectForm = useCallback(
    (next: FormVersion) => {
      if (formKey(next) === formKey(form)) return;
      const keep = formValueKeys(next);
      const shared = new Set(Object.keys(emptyValues()));
      const dropped = (id: string) => !shared.has(id);
      setForm(next);
      setValues((prev) => {
        const out: FormValues = {};
        for (const [key, value] of Object.entries(prev)) if (shared.has(key)) out[key] = value;
        for (const key of keep) if (!(key in out)) out[key] = '';
        return out;
      });
      const prune = <T,>(prev: Record<string, T>) =>
        Object.fromEntries(Object.entries(prev).filter(([id]) => !dropped(id)));
      setConfidence(prune);
      setSaid(prune);
      setFieldSource(prune);
      setDraftReady(false);
    },
    [form],
  );

  const beginPlanStep = useCallback(
    (next: ActivePlan, index: number, nextForm: FormVersion) => {
      const step = next.steps[index];
      if (!step) return;
      stopSpeaking();
      setSpeaking(false);
      setReadingBack(false);
      setPlan(next);
      setPlanStep(index);
      // Drops only the previous bank form's own boxes; shared answers stay.
      selectForm(nextForm);
      const product = step.journey === 'account_opening' ? stepCardId(step, next.text) : null;
      setJourney(step.journey);
      setValues((prev) => {
        const carried = withJourney(carryPlanAnswers(prev, step.journey, next.text), step.journey);
        return product ? { ...carried, account_product_intent: product } : carried;
      });
      setLast(null);
      setRefuseMsg(null);
      setDraftReady(false);
    },
    [selectForm],
  );

  const clearPlan = useCallback(() => {
    setPlan(null);
    setPlanStep(0);
  }, []);

  const setMicLang = useCallback(
    (lang: MicLang) => {
      const option = languageByBcp47(lang);
      if (option) applyShellLanguage(option.id);
    },
    [applyShellLanguage],
  );

  const flash = useCallback((ids: string[]) => {
    setFlashIds(new Set(ids));
    window.setTimeout(() => setFlashIds(new Set()), 900);
  }, []);

  const applyUpdates = useCallback(
    (incoming: FormValues, response: ExtractResponse, utterance?: string) => {
      // "Open an account" said while filling a bank's Re-KYC form must not retarget the draft.
      // While a planner step is open, the draft also stays on that step's journey.
      const locked = lockedJourney(formRef.current) ?? planJourneyRef.current;
      const updates =
        locked && incoming.journey_mode !== undefined && incoming.journey_mode !== locked
          ? Object.fromEntries(Object.entries(incoming).filter(([key]) => key !== 'journey_mode'))
          : incoming;
      // `applyUpdates` is memoized on [flash, language], not `values` — a
      // `values` closure read here would be stale. Capture the resolved type from inside the setValues
      // updater instead, which always runs against the current `prev`.
      let resolvedPoiType: FormValues['ovd_poi_type'];
      let resolvedPoaType: FormValues['ovd_poa_type'];
      const beta = languageById(language)?.beta === true;
      const stored: FormValues = {};
      for (const [key, value] of Object.entries(updates)) {
        // The language picker owns preferred_language. Extraction guesses it from the
        // utterance's script ("Hindi+English" for any mixed sentence), which overwrote the pick.
        if (key === 'preferred_language') continue;
        if (typeof value === 'string' && beta && hasNonLatinLetter(value)) continue;
        stored[key] = value;
      }
      // Keep only what belongs to the journey this clip lands on: no DOB on a card reissue.
      const target = isJourneyId(stored.journey_mode) ? stored.journey_mode : journeyRef.current;
      const probe: FormValues = { journey_mode: target ?? 'account_opening' };
      for (const key of Object.keys(stored)) {
        if (!updateApplies(key, probe)) delete stored[key];
      }
      setValues((prev) => {
        let next = { ...prev };
        if (isJourneyId(stored.journey_mode) && stored.journey_mode !== prev.journey_mode) {
          next = withJourney(next, stored.journey_mode);
        }
        for (const [key, value] of Object.entries(stored)) {
          if (value === undefined) continue;
          // Merge only provided keys; do not clear an already-filled value with empty/null.
          if ((value === null || value === '') && prev[key] !== undefined && prev[key] !== null && prev[key] !== '') {
            continue;
          }
          next[key] =
            typeof value === 'string' || typeof value === 'boolean' || value === null
              ? normalizeInput(key, normalizeCardInput(key, value))
              : value;
        }
        next = redactFullCardNumbers(next);
        // Aadhaar must never land in state (and therefore sessionStorage,
        // the screen, or a downloaded draft) unmasked, regardless of
        // whether it came from speak, extract, or the heuristic fallback.
        maskSensitiveFields(next, next, AADHAAR_PARTIAL_IDS);
        resolvedPoiType = next.ovd_poi_type;
        resolvedPoaType = next.ovd_poa_type;
        return next;
      });
      if (utterance?.trim()) {
        const clip = utterance.trim().replace(/\s+/g, ' ');
        setSaid((prev) => {
          const next = { ...prev };
          for (const [key, value] of Object.entries(stored)) {
            if (value === undefined) continue;
            // The masked *value* is useless if the full Aadhaar number is
            // still sitting unmasked in the quoted "said" transcript right
            // next to it — redact the quote itself for this field too.
            // A bank box the server masked (an Aadhaar-like number) gets the same treatment.
            const maskedBankBox = key.startsWith('custom_') && typeof value === 'string' && value.includes('••••');
            if (maskedBankBox || shouldRedactAadhaarQuote(key, resolvedPoiType, resolvedPoaType, AADHAAR_PARTIAL_IDS)) {
              next[key] = 'Aadhaar number redacted from transcript.';
              continue;
            }
            next[key] = clip;
          }
          return next;
        });
      }
      setConfidence((prev) => {
        const next = { ...prev };
        const conf = response.field_confidence ?? {};
        for (const [key, value] of Object.entries(stored)) {
          if (value === undefined || value === null || value === '') continue;
          const c = conf[key];
          const score = c && typeof c.confidence === 'number' ? c.confidence : 1;
          next[key] = { confidence: score, reason: c?.reason, confirmed: false };
        }
        return next;
      });
      setFieldSource((prev) => {
        const next = { ...prev };
        for (const [key, value] of Object.entries(stored)) {
          if (value !== undefined) next[key] = response.source;
        }
        return next;
      });
      if (isJourneyId(stored.journey_mode)) setJourney(stored.journey_mode);
      flash(Object.keys(stored));
      setLast(response);
      if (response.refuse_live_submit) {
        setRefuseMsg(
          response.refuse_message ||
            'Refusing live bank submit. Draft only — Fields vary by bank.',
        );
      }
    },
    [flash, language],
  );

  const onChange = useCallback((id: string, value: string | boolean | null) => {
    const stored = normalizeInput(id, normalizeCardInput(id, value));
    setValues((prev) => {
      const next =
        id === 'journey_mode' && isJourneyId(stored)
          ? withJourney(prev, stored)
          : redactFullCardNumbers({ ...prev, [id]: stored });
      // Mask once a full Aadhaar-length number has been typed, so manual
      // edits on the Review page can't leave a full number sitting in
      // state. Only triggers at 12 digits so it doesn't fight live typing
      // of shorter document numbers.
      if (AADHAAR_PARTIAL_IDS.includes(id) && typeof stored === 'string') {
        const digits = stored.replace(/\D/g, '');
        if (digits.length >= 12) maskSensitiveFields(next, next, AADHAAR_PARTIAL_IDS);
      }
      return next;
    });
    // Typed / edited by the user → confirmed.
    setConfidence((prev) => (prev[id] ? { ...prev, [id]: { ...prev[id], confirmed: true } } : prev));
    setFieldSource((prev) => ({ ...prev, [id]: 'manual' }));
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


  const voiceTurn = useCallback(
    async (wav: Blob, context: VoiceContext): Promise<VoiceTurnResult> => {
      setBusy(true);
      setRefuseMsg(null);
      setDraftReady(false);
      const fallbackLang: 'en' | 'hi' = micLang === 'hi-IN' ? 'hi' : 'en';
      const body = new FormData();
      body.append('language', micLang);
      body.append('current_values', JSON.stringify(values));
      body.append('context', context);
      // A published bank form also lets voice fill its own customer boxes. Never sent for HDFC v1.
      const formFields = speakFormFields(formRef.current);
      if (formFields) {
        body.append('form_fields', JSON.stringify(formFields));
        // Lets the anonymous usage counts say which published form customers struggle with.
        body.append('form_id', formRef.current.formId);
      }
      body.append('audio', wav, 'clip.wav');
      const ctrl = new AbortController();
      const timer = window.setTimeout(() => ctrl.abort(), 70000);
      try {
        const res = await fetch('/api/speak', { method: 'POST', body, signal: ctrl.signal });
        const data = (await res.json()) as ExtractResponse & { transcript?: string; error?: string };
        if (!res.ok) {
          const transcript = typeof data?.transcript === 'string' ? data.transcript : null;
          const error = typeof data?.error === 'string' ? data.error : `speak_${res.status}`;
          // Transcription worked but the field model did not (usually 503 high demand).
          // Fill from the transcript with the local extractor rather than dropping what was said.
          if (transcript?.trim() && error.startsWith('fields_')) {
            const local = await extractFields(transcript, values);
            applyUpdates(local.field_updates, local, transcript);
            return { transcript, error: null, fallback: true, intent: 'answer', spoken: '', replyLang: fallbackLang };
          }
          return { transcript, error, spoken: '', replyLang: fallbackLang };
        }
        if (!data || !data.field_updates || typeof data.transcript !== 'string') {
          return { transcript: null, error: 'bad_response', spoken: '', replyLang: fallbackLang };
        }
        const replyLang: 'en' | 'hi' =
          data.reply_lang === 'hi' || /[\u0900-\u097F]/.test(data.transcript) ? 'hi' : 'en';
        if (data.intent === 'command') {
          return {
            transcript: data.transcript,
            error: null,
            intent: 'command',
            command: data.command ?? null,
            spoken: '',
            replyLang,
          };
        }
        applyUpdates(data.field_updates, data, data.transcript);
        const spoken = [data.reply?.trim(), data.next_ask?.trim()].filter(Boolean).join(' ');
        return { transcript: data.transcript, error: null, intent: data.intent ?? 'answer', spoken, replyLang };
      } catch {
        return { transcript: null, error: 'network_error', spoken: '', replyLang: fallbackLang };
      } finally {
        window.clearTimeout(timer);
        setBusy(false);
      }
    },
    [micLang, values, applyUpdates],
  );

  /**
   * Hands-free waits on this before listening, so it must always finish: some devices never
   * start or never end an utterance. Same no-start wait as the read-back, plus a length cap.
   */
  const say = useCallback(
    async (text: string, lang?: UtteranceLang) => {
      if (!text.trim()) return;
      setSpeaking(true);
      let noStart = 0;
      let cap = 0;
      try {
        await new Promise<void>((resolve) => {
          const give = () => {
            stopSpeaking();
            resolve();
          };
          noStart = window.setTimeout(give, READBACK_NO_START_MS);
          cap = window.setTimeout(give, Math.max(8000, text.length * 120) + READBACK_NO_START_MS);
          speakForUtterance(text, lang ?? readbackLang, {
            onStart: () => window.clearTimeout(noStart),
          }).then(resolve, resolve);
        });
      } finally {
        window.clearTimeout(noStart);
        window.clearTimeout(cap);
        setSpeaking(false);
      }
    },
    [readbackLang],
  );

  const onSubmitSpeakClip = useCallback(
    async (wav: Blob): Promise<{ transcript: string | null; error: string | null; fallback?: boolean }> => {
      const result = await voiceTurn(wav, 'fill');
      if (result.spoken) {
        // Busy through the spoken reply too, so the mic cannot record over it.
        setBusy(true);
        try {
          await say(result.spoken, result.replyLang);
        } finally {
          setBusy(false);
        }
      }
      return { transcript: result.transcript, error: result.error, fallback: result.fallback };
    },
    [voiceTurn, say],
  );

  const confirmGates = useCallback(() => {
    setValues((prev) => ({ ...prev, readback_confirmed: true, draft_only_ack: true, no_live_submit_ack: true }));
    setFieldSource((prev) => ({
      ...prev,
      readback_confirmed: 'manual',
      draft_only_ack: 'manual',
      no_live_submit_ack: 'manual',
    }));
  }, []);

  const onPriya = useCallback((withFlags?: boolean) => {
    stopSpeaking();
    setSpeaking(false);
    setReadingBack(false);
    setReadbackInEnglish(false);
    setRefuseMsg(null);
    setDraftReady(false);
    if (isDebitJourney(journeyRef.current)) {
      const persona = withJourney(
        {
          ...emptyValues(),
          preferred_language: storedLanguageName(language ?? 'en'),
          applicant_full_name: 'Priya Sharma',
          card_customer_id: 'CIF102938',
          card_account_number: '501002223334',
          card_last4: '4417',
          card_reason: 'stolen',
          card_reissue_new: true,
          card_charges_account: 'same account',
          card_confirm_mobile: '9876543210',
        },
        'debit_reissue',
      );
      const filledIds = Object.keys(persona).filter((key) => isFilled(persona[key]) && key !== 'journey_mode');
      setValues(persona);
      setConfidence(
        withFlags === true
          ? { card_last4: { confidence: 0.6, reason: 'Digits unclear in audio', confirmed: false } }
          : {},
      );
      flash(filledIds);
      setSaid(Object.fromEntries(filledIds.map((key) => [key, 'Sample draft'])));
      setFieldSource(Object.fromEntries(filledIds.map((key) => [key, 'priya_demo'])));
      const miss = getMissingRequired(persona);
      setLast({
        field_updates: persona,
        missing_required: miss,
        next_ask:
          getNextAsk(miss, persona, language === 'hi' ? 'hi' : 'en') ||
          'Demo debit card reissue loaded. Tick that the old card is blocked, then read it back. Fields vary by bank.',
        gates: { answers: {} },
        completeness: completenessLevel(persona, miss),
        refuse_live_submit: false,
        source: 'priya_demo',
        assistant_message: 'Filled a synthetic debit card reissue. Last 4 only. No PIN. Fields vary by bank.',
      });
      return;
    }
    const persona = priyaDemoValues();
    const locked = lockedJourney(formRef.current);
    if (locked && persona.journey_mode !== locked) {
      persona.journey_mode = locked;
      if (locked !== 'account_opening') persona.account_product_intent = '';
    }
    maskSensitiveFields(persona, persona, AADHAAR_PARTIAL_IDS);
    setValues(persona);
    // Demo-only: strict === true so a click event passed as arg never triggers flags.
    setConfidence(withFlags === true ? demoFlagConfidence() : {});
    if (isJourneyId(persona.journey_mode)) setJourney(persona.journey_mode);
    flash(Object.keys(persona).filter((key) => persona[key] !== '' && persona[key] !== null));
    const miss = getMissingRequired(persona);
    const level = completenessLevel(persona, miss);
    const clip = 'Sample draft';
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
    setReadbackInEnglish(false);
    const next = emptyValues();
    if (journey) next.journey_mode = journey;
    if (language) next.preferred_language = storedLanguageName(language);
    setValues(withDebitDefaults(next));
    setConfidence({});
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
    (
      id: number,
      text: string,
      lang: UtteranceLang,
      speech?: { lang: string; voice: SpeechSynthesisVoice },
    ): Promise<void> =>
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
        log(`speak called (chars=${text.length}, capMs=${capMs}, lang=${speech?.lang ?? lang})`);
        const hooks = {
          onStart: () => {
            started = true;
            log('onstart');
          },
          onEnd: () => log('onend'),
          onError: (error: string) => log('onerror', error),
        };
        const spoken = speech
          ? speak(text, speech.lang, hooks, speech.voice)
          : speakForUtterance(text, lang, hooks);
        spoken.then(finish, finish);
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
    const plan = await resolveReadbackVoice(micLang);
    if (readbackSeq.current !== id) return;
    setReadbackInEnglish(plan.fellBackToEnglish);
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
      await watchReadback(id, script, readbackLang, plan.speech);
    } finally {
      // A newer read-back owns the speaking state once it has started.
      if (readbackSeq.current === id) {
        setSpeaking(false);
        setReadingBack(false);
        setReadbackInEnglish(false);
      }
    }
  }, [values, missing, completeness, readbackLang, micLang, watchReadback, canReadback]);

  const onStopReadback = useCallback(() => {
    readbackSeq.current += 1;
    stopSpeaking();
    const run = readbackRun.current;
    if (run) {
      console.info(`[readback #${run.id}] +${Date.now() - run.startedAt}ms manual stop`);
      run.finish();
    }
    setSpeaking(false);
    setReadingBack(false);
    setReadbackInEnglish(false);
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
    readbackInEnglish,
    last,
    flashIds,
    refuseMsg,
    draftReady,
    missing,
    completeness,
    canReadback,
    confirmGatesOk,
    invalidIds,
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
    voiceTurn,
    say,
    handsFree,
    setHandsFree,
    confirmGates,
    onPriya,
    onClear,
    onReadback,
    onStopReadback,
    emitDraft,
    said,
    fieldSource,
    selectDraft,
    form,
    selectForm,
    plan,
    planStep,
    beginPlanStep,
    clearPlan,
  };

  return <FormSessionContext.Provider value={value}>{children}</FormSessionContext.Provider>;
}

export function useFormSession(): FormSessionValue {
  const ctx = useContext(FormSessionContext);
  if (!ctx) throw new Error('useFormSession must be used within FormSessionProvider');
  return ctx;
}
