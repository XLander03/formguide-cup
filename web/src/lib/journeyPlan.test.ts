import { describe, expect, it } from 'vitest';
import { PLAN_JOURNEY_IDS } from '../../../shared/journeyPlan';
import { HDFC_V1 } from '../forms/hdfcV1';
import type { FormVersion } from '../forms/types';
import {
  cardReasonFrom,
  carryPlanAnswers,
  parseStoredPlan,
  resolveStepForm,
  stepCardId,
  traceLabel,
} from './journeyPlan';
import { JOURNEY_IDS } from './journeys';

const AXIS_REKYC: FormVersion = {
  formId: 'form_axis',
  version: 'v1',
  bankId: 'Axis',
  journey: 'rekyc',
  status: 'published',
  source: 'ocr',
  pdfPath: 'x.pdf',
  fields: [],
};

describe('journey plan helpers', () => {
  it('plans over the same journeys the app offers', () => {
    expect([...PLAN_JOURNEY_IDS]).toEqual([...JOURNEY_IDS]);
  });

  it('carries shared answers into the next form and resets the confirm gates', () => {
    const next = carryPlanAnswers(
      {
        applicant_full_name: 'Priya Sharma',
        card_confirm_mobile: '9876543210',
        card_customer_id: 'CIF1',
        readback_confirmed: true,
        draft_only_ack: true,
        no_live_submit_ack: true,
        card_old_blocked_ack: true,
      },
      'kyc_update',
    );
    expect(next.applicant_full_name).toBe('Priya Sharma');
    expect(next.mobile_registered).toBe('9876543210');
    expect(next.customer_id_cif).toBe('CIF1');
    expect(next.readback_confirmed).toBeNull();
    expect(next.draft_only_ack).toBeNull();
    expect(next.card_old_blocked_ack).toBeNull();
  });

  it('never overwrites an answer the next form already has', () => {
    const next = carryPlanAnswers({ mobile_registered: '9000000000', card_confirm_mobile: '9876543210' }, 'kyc_update');
    expect(next.mobile_registered).toBe('9000000000');
  });

  it('copies the mobile into a card reissue and keeps what the customer said about the card', () => {
    const next = carryPlanAnswers({ mobile_registered: '9876543210' }, 'debit_reissue', 'मेरा डेबिट कार्ड चोरी हो गया');
    expect(next.card_confirm_mobile).toBe('9876543210');
    expect(next.card_reason).toBe('stolen');
    expect(cardReasonFrom('my card is damaged')).toBe('damaged');
    expect(cardReasonFrom('I lost my card')).toBe('lost_or_misplaced');
    expect(cardReasonFrom('I moved house')).toBeNull();
  });

  it('names each planner tool call in plain words', () => {
    expect(traceLabel({ tool: 'list_journeys', args: {}, summary: '4 journeys' })).toBe('Checked available journeys (4 journeys)');
    expect(traceLabel({ tool: 'list_bank_forms', args: { journey: 'rekyc' }, summary: 'HDFC, Axis' })).toBe(
      'Looked up Re-KYC forms: HDFC, Axis',
    );
    expect(traceLabel({ tool: 'submit_plan', args: { journeys: ['rekyc', 'kyc_update'] }, summary: '2 forms' })).toBe(
      'Planned 2 forms',
    );
  });

  it('picks the account product the customer named', () => {
    expect(stepCardId({ journey: 'account_opening' }, 'open a salary account')).toBe('salary_savings');
    expect(stepCardId({ journey: 'account_opening' }, 'open an account')).toBe('regular_savings');
    expect(stepCardId({ journey: 'rekyc' }, 'open a salary account')).toBe('rekyc');
  });

  it('uses the hinted bank form only while it is still published', async () => {
    const step = { journey: 'rekyc' as const, reason: 'Due.', form: { formId: 'form_axis', version: 'v1', bank: 'Axis' } };
    expect(await resolveStepForm(step, HDFC_V1, async () => [AXIS_REKYC])).toBe(AXIS_REKYC);
    expect(await resolveStepForm(step, HDFC_V1, async () => [])).toBe(HDFC_V1);
    expect(await resolveStepForm(step, HDFC_V1, async () => Promise.reject(new Error('down')))).toBe(HDFC_V1);
    // A bank form chosen for another journey is not reused for this one.
    expect(await resolveStepForm({ journey: 'kyc_update', reason: 'Moved.' }, AXIS_REKYC)).toBe(HDFC_V1);
  });

  it('drops a stored plan that does not fit', () => {
    expect(parseStoredPlan({ steps: [{ journey: 'rekyc', reason: 'x' }], step: 3, text: '' })).toBeNull();
    expect(parseStoredPlan({ steps: [{ journey: 'loan', reason: 'x' }], step: 0 })).toBeNull();
    expect(parseStoredPlan({ steps: [{ journey: 'rekyc', reason: 'x' }], step: 0, reply: 'ok', trace: [], text: 't' })).toEqual({
      plan: { steps: [{ journey: 'rekyc', reason: 'x' }], reply: 'ok', trace: [], text: 't' },
      step: 0,
    });
  });
});
