import { maskSensitive } from './mask';
import { SFE_FIELDS, sfeGetMissingRequired, sfeIsFilled, type SfeFormValues } from './schema';

export interface SfeGateAnswers {
  reviewed_corrections: boolean;
  draft_only_ack: boolean;
  no_live_submit_ack: boolean;
}

export interface SfeReceiptLine {
  field: string;
  label: string;
  said: string | null;
  filled: string | null;
  masked: boolean;
  status: 'confirmed' | 'awaiting';
}

export interface SfeConfirmResult {
  ok: boolean;
  draft_id: string | null;
  created_at: string | null;
  schema_id: 'speak_form_ease_v1';
  status: 'draft_saved_no_bank_submit' | 'gates_incomplete';
  receipt: SfeReceiptLine[] | null;
  refuse_live_submit: true; // always — this demo never submits to a bank
  message: string;
}

/**
 * Validates the three confirm gates and, if all are true, builds the
 * "said vs filled" draft receipt. Never writes to a bank and never marks
 * anything as live-submitted — gates_incomplete is returned otherwise.
 */
export function sfeConfirmDraft(
  values: SfeFormValues,
  said: Record<string, string>,
  gates: SfeGateAnswers,
): SfeConfirmResult {
  if (!gates.reviewed_corrections || !gates.draft_only_ack || !gates.no_live_submit_ack) {
    return {
      ok: false,
      draft_id: null,
      created_at: null,
      schema_id: 'speak_form_ease_v1',
      status: 'gates_incomplete',
      receipt: null,
      refuse_live_submit: true,
      message: 'All three gates must be acknowledged before a draft can be saved.',
    };
  }

  const missing = sfeGetMissingRequired(values);
  const receipt: SfeReceiptLine[] = SFE_FIELDS.filter((f) => sfeIsFilled(values[f.id]) || missing.includes(f.id)).map(
    (f) => {
      const filledRaw = values[f.id];
      const filled = sfeIsFilled(filledRaw) ? String(filledRaw) : null;
      return {
        field: f.id,
        label: f.label,
        said: said[f.id] ?? null,
        filled: filled && f.sensitive ? maskSensitive(filled) : filled,
        masked: Boolean(filled) && Boolean(f.sensitive),
        status: filled ? 'confirmed' : 'awaiting',
      };
    },
  );

  const draftId = `sfe_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  return {
    ok: true,
    draft_id: draftId,
    created_at: new Date().toISOString(),
    schema_id: 'speak_form_ease_v1',
    status: 'draft_saved_no_bank_submit',
    receipt,
    refuse_live_submit: true,
    message: missing.length
      ? `Draft saved with ${missing.length} field(s) still missing. Not submitted to a bank.`
      : 'Draft saved. Not submitted to a bank.',
  };
}
