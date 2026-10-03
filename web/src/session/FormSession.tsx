import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { extractFields } from '../lib/extractClient';
import { buildReadbackScript } from '../lib/heuristicExtract';
import { acceptPersonName } from '../lib/personName';
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

const STORAGE_KEY = 'formguide.cup.session.v1';

interface Persisted {
  language: ShellLanguage | null;
  journey: JourneyId | null;
  values: FormValues;
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
    return { language, journey, values };
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
  if (saved?.language) base.preferred_language = saved.language === 'hi' ? 'Hindi' : 'English';
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
  last: ExtractResponse | null;
  flashIds: Set<string>;
  refuseMsg: string | null;
  draftReady: boolean;
  missing: string[];
  completeness: ExtractResponse['completeness'];
  canReadback: boolean;
  confirmGatesOk: boolean;
  readyForFill: boolean;
  selectLanguage: (lang: ShellLanguage) => void;
  selectJourney: (id: JourneyId) => void;
  setMicLang: (lang: MicLang) => void;
  onChange: (id: string, value: string | boolean | null) => void;
  onSubmitUtterance: (text: string) => Promise<void>;
  onPriya: () => void;
  onClear: () => void;
  onReadback: () => Promise<void>;
  onStopReadback: () => void;
  onTryLiveSubmit: () => void;
  emitDraft: () => void;
}

const FormSessionContext = createContext<FormSessionValue | null>(null);

export function FormSessionProvider({ children }: { children: ReactNode }) {
  const saved = useMemo(() => loadPersisted(), []);
  const [language, setLanguage] = useState<ShellLanguage | null>(saved?.language ?? null);
  const [journey, setJourney] = useState<JourneyId | null>(saved?.journey ?? null);
  const [micLang, setMicLangState] = useState<MicLang>(saved?.language === 'hi' ? 'hi-IN' : 'en-IN');
  const [values, setValues] = useState<FormValues>(() => seedValues(saved));
  const [busy, setBusy] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [last, setLast] = useState<ExtractResponse | null>(null);
  const [flashIds, setFlashIds] = useState<Set<string>>(new Set());
  const [refuseMsg, setRefuseMsg] = useState<string | null>(null);
  const [draftReady, setDraftReady] = useState(false);

  const readbackLang: UtteranceLang = micLang === 'hi-IN' ? 'hi' : 'en';
  const detectedLang: UtteranceLang = last?.reply_lang ?? readbackLang;

  const missing = useMemo(() => getMissingRequired(values), [values]);
  const completeness = useMemo(
    () => completenessLevel(values, missing),
    [values, missing],
  );
  const canReadback = completeness === 'demo_ready' || completeness === 'full_bank_packet';
  const confirmGatesOk =
    values.readback_confirmed === true &&
    values.draft_only_ack === true &&
    values.no_live_submit_ack === true;
  const readyForFill = language !== null && journey !== null;

  useEffect(() => {
    const payload: Persisted = { language, journey, values };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, [language, journey, values]);

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
    (updates: FormValues, response: ExtractResponse) => {
      const safeUpdates = { ...updates };
      if (typeof safeUpdates.applicant_full_name === 'string') {
        const accepted = acceptPersonName(safeUpdates.applicant_full_name);
        if (accepted) safeUpdates.applicant_full_name = accepted;
        else delete safeUpdates.applicant_full_name;
      }
      setValues((prev) => {
        const next = { ...prev };
        for (const [key, value] of Object.entries(safeUpdates)) {
          if (value === undefined) continue;
          next[key] = value;
        }
        return next;
      });
      if (isJourneyId(safeUpdates.journey_mode)) setJourney(safeUpdates.journey_mode);
      flash(Object.keys(safeUpdates));
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
    setDraftReady(false);
    if (id === 'journey_mode' && isJourneyId(value)) setJourney(value);
  }, []);

  const onSubmitUtterance = useCallback(
    async (text: string) => {
      setBusy(true);
      setRefuseMsg(null);
      setDraftReady(false);
      try {
        const res = await extractFields(text, values);
        applyUpdates(res.field_updates, res);
      } finally {
        setBusy(false);
      }
    },
    [values, applyUpdates],
  );

  const onPriya = useCallback(() => {
    stopSpeaking();
    setSpeaking(false);
    setRefuseMsg(null);
    setDraftReady(false);
    const persona = priyaDemoValues();
    setValues(persona);
    if (isJourneyId(persona.journey_mode)) setJourney(persona.journey_mode);
    flash(Object.keys(persona).filter((key) => persona[key] !== '' && persona[key] !== null));
    const miss = getMissingRequired(persona);
    const level = completenessLevel(persona, miss);
    setLast({
      field_updates: persona,
      missing_required: miss,
      next_ask:
        getNextAsk(miss, persona) ||
        'Demo persona loaded (synthetic PAN/mobile). Tap TTS read-back, then confirm the three gates. Fields vary by bank.',
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
  }, [flash]);

  const onClear = useCallback(() => {
    stopSpeaking();
    setSpeaking(false);
    const next = emptyValues();
    if (journey) next.journey_mode = journey;
    if (language) next.preferred_language = language === 'hi' ? 'Hindi' : 'English';
    setValues(next);
    setLast(null);
    setRefuseMsg(null);
    setDraftReady(false);
  }, [journey, language]);

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
    try {
      await speakForUtterance(script, readbackLang);
    } finally {
      setSpeaking(false);
    }
  }, [values, missing, completeness, readbackLang]);

  const onStopReadback = useCallback(() => {
    stopSpeaking();
    setSpeaking(false);
  }, []);

  const onTryLiveSubmit = useCallback(() => {
    if (!canReadback) return;
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
  }, [missing, completeness, readbackLang, canReadback]);

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
    last,
    flashIds,
    refuseMsg,
    draftReady,
    missing,
    completeness,
    canReadback,
    confirmGatesOk,
    readyForFill,
    selectLanguage,
    selectJourney,
    setMicLang,
    onChange,
    onSubmitUtterance,
    onPriya,
    onClear,
    onReadback,
    onStopReadback,
    onTryLiveSubmit,
    emitDraft,
  };

  return <FormSessionContext.Provider value={value}>{children}</FormSessionContext.Provider>;
}

export function useFormSession(): FormSessionValue {
  const ctx = useContext(FormSessionContext);
  if (!ctx) throw new Error('useFormSession must be used within FormSessionProvider');
  return ctx;
}
