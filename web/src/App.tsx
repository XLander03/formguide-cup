import { useCallback, useMemo, useState } from 'react';
import { DemoBar } from './components/DemoBar';
import { FormSections } from './components/FormSections';
import { extractFields } from './lib/extractClient';
import { buildReadbackScript } from './lib/heuristicExtract';
import {
  BANK_VARIES_COPY,
  completenessLevel,
  emptyValues,
  fieldLabel,
  getMissingRequired,
  getNextAsk,
  priyaDemoValues,
  SCHEMA,
} from './lib/schema';
import { speak, stopSpeaking } from './lib/tts';
import type { ExtractResponse, FormValues } from './lib/types';

export default function App() {
  const [values, setValues] = useState<FormValues>(() => emptyValues());
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<ExtractResponse | null>(null);
  const [flashIds, setFlashIds] = useState<Set<string>>(new Set());
  const [refuseMsg, setRefuseMsg] = useState<string | null>(null);
  const [draftReady, setDraftReady] = useState(false);

  const missing = useMemo(() => getMissingRequired(values), [values]);
  const completeness = useMemo(
    () => completenessLevel(values, missing),
    [values, missing],
  );
  const canReadback =
    completeness === 'demo_ready' || completeness === 'full_bank_packet';

  const flash = useCallback((ids: string[]) => {
    setFlashIds(new Set(ids));
    window.setTimeout(() => setFlashIds(new Set()), 900);
  }, []);

  const applyUpdates = useCallback(
    (updates: FormValues, response: ExtractResponse) => {
      setValues((prev) => {
        const next = { ...prev };
        for (const [k, v] of Object.entries(updates)) {
          if (v === undefined) continue;
          next[k] = v;
        }
        return next;
      });
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
    setDraftReady(false);
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
    setRefuseMsg(null);
    setDraftReady(false);
    const v = priyaDemoValues();
    setValues(v);
    flash(Object.keys(v).filter((k) => v[k] !== '' && v[k] !== null));
    const miss = getMissingRequired(v);
    const level = completenessLevel(v, miss);
    setLast({
      field_updates: v,
      missing_required: miss,
      next_ask: getNextAsk(miss, v) ||
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
    setValues(emptyValues());
    setLast(null);
    setRefuseMsg(null);
    setDraftReady(false);
  }, []);

  const onReadback = useCallback(async () => {
    const script = buildReadbackScript(values);
    setLast((prev) => ({
      field_updates: {},
      missing_required: missing,
      next_ask:
        'After listening, tick readback_confirmed, draft_only_ack, and no_live_submit_ack — or say “confirmed, draft only, no live submit”.',
      gates: prev?.gates ?? { answers: {} },
      completeness,
      refuse_live_submit: false,
      source: prev?.source ?? 'heuristic',
      assistant_message: script,
    }));
    await speak(script);
  }, [values, missing, completeness]);

  const onTryLiveSubmit = useCallback(() => {
    setRefuseMsg(
      'Refused: this demo never posts to a bank. Live bank submit is disabled. Save a draft only after confirm gates. Fields vary by bank.',
    );
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
      assistant_message:
        'Guardrail fired: noul_requests_live_bank_submit high → refuse. Draft only.',
    }));
  }, [missing, completeness]);

  const confirmGatesOk =
    values.readback_confirmed === true &&
    values.draft_only_ack === true &&
    values.no_live_submit_ack === true;

  const emitDraft = useCallback(() => {
    if (!canReadback || !confirmGatesOk) return;
    setDraftReady(true);
    setRefuseMsg(null);
  }, [canReadback, confirmGatesOk]);

  return (
    <div className="app">
      <header className="header">
        <div>
          <h1>FormGuide — AOF + KYC</h1>
          <p className="tagline">
            Builders Cup demo · English voice → draft fields · confirm-before-submit
          </p>
        </div>
        <div className="badges">
          <span className="badge accent">aof_kyc_demo_v1</span>
          <span className="badge ok">No live bank submit</span>
          <span className="badge warn">{BANK_VARIES_COPY}</span>
        </div>
      </header>

      <div className="banner">
        <strong>{BANK_VARIES_COPY}</strong> Do not invent bank form IDs — cite public hubs
        (HDFC Forms Centre, SBI KYC Documents, ICICI Form Center) by titled PDF/section only.
        Gemini structured JSON in Functions when <code>GEMINI_API_KEY</code> is set; otherwise
        local heuristic fill still works.
      </div>

      <div className="layout">
        <DemoBar
          busy={busy}
          onSubmitUtterance={onSubmitUtterance}
          onPriya={onPriya}
          onClear={onClear}
          onReadback={onReadback}
          onTryLiveSubmit={onTryLiveSubmit}
          last={last}
          missing={missing}
          completeness={completeness}
          canReadback={canReadback}
        />

        <main>
          <FormSections values={values} flashIds={flashIds} onChange={onChange} />

          <div className="footer-actions">
            <button
              className="btn primary"
              disabled={!canReadback || !confirmGatesOk}
              onClick={emitDraft}
            >
              Emit draft (local only)
            </button>
            <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
              Requires demo_ready+ and all three confirm gates.
            </span>
          </div>

          {refuseMsg && <div className="refuse-box">{refuseMsg}</div>}
          {draftReady && (
            <div className="success-box">
              Draft ready — not submitted to any bank. Key fields:{' '}
              {fieldLabel('applicant_full_name')} = {String(values.applicant_full_name)};{' '}
              mobile last-4 = {String(values.mobile_registered).slice(-4)}. {BANK_VARIES_COPY}
              <pre
                style={{
                  marginTop: '0.5rem',
                  maxHeight: 220,
                  overflow: 'auto',
                  fontSize: '0.7rem',
                  color: 'var(--muted)',
                }}
              >
                {JSON.stringify(
                  {
                    schema_id: 'aof_kyc_demo_v1',
                    demo_outcome: 'draft_ready_no_bank_submit',
                    values,
                  },
                  null,
                  2,
                )}
              </pre>
            </div>
          )}

          <div className="hubs">
            Public hubs:{' '}
            {SCHEMA.public_hubs.map((h, i) => (
              <span key={h.bank}>
                {i > 0 ? ' · ' : ''}
                <a href={h.url} target="_blank" rel="noreferrer">
                  {h.cite_as}
                </a>
              </span>
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}
