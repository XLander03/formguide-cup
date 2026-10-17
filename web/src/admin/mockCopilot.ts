import type { CopilotAction, CopilotResponse } from '../../../shared/forms/copilot';
import { mockAdminForms } from './mockConsole';

/**
 * Offline stand-in for /api/adminCopilot under `?mock=1`, shaped like real replies.
 * Duplicate questions (and anything unrecognised) propose retiring one older ICICI
 * draft from the mock console, so Confirm can be demoed end to end.
 */
export async function mockCopilotReply(message: string): Promise<CopilotResponse> {
  await new Promise((resolve) => setTimeout(resolve, 350));
  const text = message.toLowerCase();

  if (/mobile/.test(text)) {
    return {
      answer:
        'Every live form has a place for the mobile number, but not all of them let voice fill it.\n- **ICICI · Re-KYC** only has its own bank box for mobile, so customers type it.\n- **Axis · Account opening** and **Axis · Re-KYC** capture it by voice.',
      proposedActions: [],
      trace: [{ tool: 'form_coverage', args: { status: 'published' }, summary: '3 forms checked' }],
    };
  }

  if (/struggl|today|usage|voice|customers/.test(text)) {
    return {
      answer:
        '37 voice turns today, mostly English (25) and Hindi (9).\n- Customers struggle most with the **mobile number** (still missing after 14 turns) and **PAN** (11).\n- Names and dates of birth fill by voice easily (30 and 27 turns).',
      proposedActions: [],
      trace: [{ tool: 'usage_insights', args: { days: 1 }, summary: '37 turns over 1 day' }],
    };
  }

  const drafts = mockAdminForms().forms.filter((row) => row.bankId === 'ICICI' && row.status === 'draft');
  const trace = [{ tool: 'find_duplicates', args: {}, summary: drafts.length > 1 ? '1 group' : '0 groups' }];
  if (drafts.length < 2) {
    return { answer: 'No duplicate drafts left. Each bank and journey has at most one draft.', proposedActions: [], trace };
  }
  const older = drafts[drafts.length - 1];
  const action: CopilotAction = {
    type: 'retire',
    formId: older.formId,
    version: older.version,
    reason: 'Older duplicate upload of the same ICICI Re-KYC PDF; a newer draft and a live form remain.',
    bankId: older.bankId,
    journey: older.journey,
    from: older.status,
    to: 'retired',
  };
  return {
    answer: `**ICICI · Re-KYC** has ${drafts.length} drafts of the same PDF next to its live form.\n- I have proposed retiring an older one. Nothing changes until you confirm.`,
    proposedActions: [action],
    trace: [
      ...trace,
      {
        tool: 'propose_actions',
        args: { actions: [{ type: 'retire', formId: action.formId, version: action.version, reason: action.reason }] },
        summary: '1 proposed',
      },
    ],
  };
}
