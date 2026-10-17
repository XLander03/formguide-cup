import type { AdminFormRow } from '../../../shared/forms/admin';
import type { CopilotAction, CopilotResponse, CopilotTraceStep } from '../../../shared/forms/copilot';
import { mockAdminForms } from './mockConsole';

/** Long enough to see the "thinking" row in a demo, short enough for tests. */
export const MOCK_COPILOT_DELAY_MS = 900;

function propose(row: AdminFormRow, type: CopilotAction['type'], to: CopilotAction['to'], reason: string): CopilotAction {
  return { type, formId: row.formId, version: row.version, reason, bankId: row.bankId, journey: row.journey, from: row.status, to };
}

function proposeStep(actions: readonly CopilotAction[]): CopilotTraceStep {
  return {
    tool: 'propose_actions',
    args: { actions: actions.map(({ type, formId, version, reason }) => ({ type, formId, version, reason })) },
    summary: `${actions.length} proposed`,
  };
}

/**
 * Offline stand-in for /api/adminCopilot under `?mock=1`, shaped like real replies:
 * several read-only tool calls, then an answer and (sometimes) proposals.
 * Duplicate questions (and anything unrecognised) propose retiring the older ICICI
 * drafts from the mock console, so Apply can be demoed end to end.
 */
export async function mockCopilotReply(message: string): Promise<CopilotResponse> {
  await new Promise((resolve) => setTimeout(resolve, MOCK_COPILOT_DELAY_MS));
  const text = message.toLowerCase();
  const rows = mockAdminForms().forms;
  const live = rows.filter((row) => row.status === 'published');
  const drafts = rows.filter((row) => row.status === 'draft');

  if (/mobile/.test(text)) {
    return {
      answer:
        'Every live form has a place for the mobile number, but not all of them let voice fill it.\n- **ICICI · Re-KYC** only has its own bank box for mobile, so customers type it.\n- **Axis · Account opening** and **Axis · Re-KYC** capture it by voice.',
      proposedActions: [],
      trace: [
        { tool: 'list_forms', args: { status: 'published' }, summary: `${live.length} live forms` },
        { tool: 'form_coverage', args: { status: 'published', field: 'mobile' }, summary: `mobile filled by voice on 2 of ${live.length}` },
      ],
    };
  }

  if (/struggl|today|usage|voice|customers/.test(text)) {
    return {
      answer:
        '37 voice turns today, mostly English (25) and Hindi (9).\n- Customers struggle most with the **mobile number** (still missing after 14 turns) and **PAN** (11).\n- Names and dates of birth fill by voice easily (30 and 27 turns).',
      proposedActions: [],
      trace: [
        { tool: 'usage_insights', args: { days: 1 }, summary: '37 anonymous turns over 1 day' },
        { tool: 'list_forms', args: { status: 'published' }, summary: `${live.length} live forms` },
      ],
    };
  }

  if (/ready|publish/.test(text)) {
    const ready = drafts.filter((row) => row.needsReview === 0);
    const trace: CopilotTraceStep[] = [
      { tool: 'list_forms', args: { status: 'draft' }, summary: `${drafts.length} drafts` },
      { tool: 'form_coverage', args: { status: 'draft' }, summary: `${ready.length} with every field checked` },
    ];
    if (ready.length === 0) {
      return { answer: 'No draft is ready yet. Each one still has low-confidence fields to check.', proposedActions: [], trace };
    }
    const actions = ready.map((row) =>
      propose(row, 'publish', 'published', `Every field is checked and ${row.sharedCount} of ${row.fieldCount} fill by voice.`),
    );
    return {
      answer: `**${ready.length} draft${ready.length === 1 ? ' is' : 's are'} ready.** Publishing replaces the live version for that bank and journey.\n- Drafts with unchecked fields need a review first.`,
      proposedActions: actions,
      trace: [...trace, proposeStep(actions)],
    };
  }

  const icici = drafts.filter((row) => row.bankId === 'ICICI');
  const trace: CopilotTraceStep[] = [
    { tool: 'list_forms', args: { status: 'draft' }, summary: `${rows.length} forms, ${drafts.length} drafts` },
    { tool: 'find_duplicates', args: {}, summary: icici.length > 1 ? `1 group: ICICI · Re-KYC × ${icici.length}` : '0 groups' },
  ];
  if (icici.length < 2) {
    return { answer: 'No duplicate drafts left. Each bank and journey has at most one draft.', proposedActions: [], trace };
  }
  const [keep, ...older] = icici;
  trace.push({
    tool: 'form_coverage',
    args: { formId: keep.formId, version: keep.version },
    summary: `same ${keep.fieldCount} fields, ${keep.sharedCount} by voice`,
  });
  const actions = older.map((row) =>
    propose(row, 'retire', 'retired', 'Older duplicate upload of the same ICICI Re-KYC PDF; a newer draft and a live form remain.'),
  );
  return {
    answer: `**ICICI · Re-KYC** has ${icici.length} drafts of the same PDF next to its live form.\n- They have the same ${keep.fieldCount} fields, so one draft is enough.\n- I suggest retiring the ${older.length} older one${older.length === 1 ? '' : 's'}. Nothing changes until you confirm.`,
    proposedActions: actions,
    trace: [...trace, proposeStep(actions)],
  };
}
