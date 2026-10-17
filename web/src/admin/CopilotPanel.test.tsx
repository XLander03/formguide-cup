import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AdminFormsResponse } from '../../../shared/forms/admin';
import type { CopilotAction, CopilotRequest, CopilotResponse } from '../../../shared/forms/copilot';
import type { ConsoleApi } from './consoleClient';
import { ConsolePage } from './ConsolePage';
import { AnswerText, CopilotPanel, friendlyError, type CopilotApplyResult } from './CopilotPanel';
import { mockAdminForms, resetMockConsole } from './mockConsole';
import { mockCopilotReply } from './mockCopilot';

const RETIRE: CopilotAction = {
  type: 'retire',
  formId: 'icici_a',
  version: 'v1',
  reason: 'Older duplicate draft.',
  bankId: 'ICICI',
  journey: 'rekyc',
  from: 'draft',
  to: 'retired',
};
const UNPUBLISH: CopilotAction = { ...RETIRE, type: 'unpublish', formId: 'axis_old', bankId: 'Axis', journey: 'account_opening', from: 'published', to: 'draft', reason: 'Replaced.' };

const REPLY: CopilotResponse = {
  answer: 'Found **2** things.\n- one\n- two',
  proposedActions: [RETIRE, UNPUBLISH],
  trace: [
    { tool: 'find_duplicates', args: {}, summary: '1 group' },
    { tool: 'list_forms', args: { status: 'published' }, summary: '3 forms' },
  ],
};

function panel(
  ask: (request: CopilotRequest) => Promise<CopilotResponse> = vi.fn(async () => REPLY),
  execute: (actions: CopilotAction[]) => Promise<CopilotApplyResult | void> = vi.fn(async () => {}),
) {
  render(<CopilotPanel ask={ask} execute={execute} initialOpen />);
  return { ask, execute };
}

afterEach(() => {
  resetMockConsole();
  sessionStorage.clear();
});

describe('CopilotPanel', () => {
  it('starts collapsed when asked to and opens on click, remembering it for the session', async () => {
    render(<CopilotPanel ask={vi.fn()} execute={vi.fn()} initialOpen={false} />);
    const toggle = screen.getByRole('button', { name: /Forms copilot/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(/Read-only/)).toBeNull();
    expect(screen.queryByRole('group', { name: 'Suggested questions' })).toBeNull();
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(sessionStorage.getItem('formguide.copilot.open')).toBe('1');
  });

  it('follows the remembered choice over the desktop default', () => {
    sessionStorage.setItem('formguide.copilot.open', '0');
    render(<CopilotPanel ask={vi.fn()} execute={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Forms copilot/ })).toHaveAttribute('aria-expanded', 'false');
  });

  it('opens on desktop to just a question box and three suggestion links, no steps or cards', () => {
    render(<CopilotPanel ask={vi.fn()} execute={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Forms copilot/ })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByLabelText('Question')).toHaveAttribute('placeholder', 'Ask about your forms…');
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    const links = within(screen.getByRole('group', { name: 'Suggested questions' })).getAllByRole('button');
    expect(links.map((link) => link.textContent)).toEqual(['Forms missing mobile', 'Where customers struggle', 'Duplicate drafts']);
    expect(screen.queryByRole('list', { name: 'How the copilot works' })).toBeNull();
    expect(screen.queryByText('Ask a question')).toBeNull();
    expect(screen.queryByText(/Enter to send/)).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('log')).toHaveAttribute('aria-live', 'polite');
  });

  it('a suggestion link asks its full question and shows the bubble, the answer and the proposals, all checked', async () => {
    const { ask } = panel();
    await userEvent.click(screen.getByRole('button', { name: 'Duplicate drafts' }));
    expect(ask).toHaveBeenCalledWith({ message: 'Find duplicate drafts', history: [] });
    expect(await screen.findByText('2')).toBeInTheDocument();
    const log = screen.getByRole('log');
    expect(within(log).getByText('Find duplicate drafts')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Suggested questions' })).toBeNull();
    expect(screen.getByText('one')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Suggested changes — nothing happens until you apply/ })).toBeInTheDocument();
    expect(screen.getByText('Retire · ICICI · Re-KYC draft v1 (icici_a)')).toBeInTheDocument();
    expect(screen.getByText('Unpublish · Axis · Account opening live v1 (axis_old)')).toBeInTheDocument();
    expect(screen.getByText(/Older duplicate draft\. · Draft → Retired/)).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox').every((box) => (box as HTMLInputElement).checked)).toBe(true);
    expect(screen.getByRole('button', { name: 'Apply 2' })).toBeEnabled();
  });

  it('keeps the tool steps behind one quiet line that expands on click', async () => {
    panel();
    await userEvent.click(screen.getByRole('button', { name: 'Duplicate drafts' }));
    const line = await screen.findByRole('button', { name: 'Checked 2 things' });
    expect(line).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('list', { name: 'Steps the copilot took' })).toBeNull();
    await userEvent.click(line);
    expect(line).toHaveAttribute('aria-expanded', 'true');
    const steps = within(screen.getByRole('list', { name: 'Steps the copilot took' })).getAllByRole('listitem');
    expect(steps.map((step) => step.textContent)).toEqual(['Looked for duplicates · 1 group', 'Listed forms · 3 forms']);
    await userEvent.click(line);
    expect(screen.queryByRole('list', { name: 'Steps the copilot took' })).toBeNull();
  });

  it('explains itself in a "How it works" dialog that Escape closes, returning focus', async () => {
    panel();
    const trigger = screen.getByRole('button', { name: 'How it works' });
    await userEvent.click(trigger);
    const dialog = screen.getByRole('dialog', { name: 'How the copilot works' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveTextContent(/Ask in your own words.*Gemini looks things up.*suggest.*Nothing changes until you press Apply/);
    expect(dialog).toHaveTextContent(/never changes anything on its own/);
    expect(within(dialog).getByRole('button', { name: 'Close' })).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    await userEvent.tab();
    expect(within(dialog).getByRole('button', { name: 'Close' })).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it('closes the dialog on a backdrop click', async () => {
    panel();
    await userEvent.click(screen.getByRole('button', { name: 'How it works' }));
    await userEvent.click(screen.getByTestId('copilot-guide-backdrop'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('asks an example question from the dialog, opening a folded panel', async () => {
    const ask = vi.fn(async () => REPLY);
    render(<CopilotPanel ask={ask} execute={vi.fn()} initialOpen={false} />);
    await userEvent.click(screen.getByRole('button', { name: 'How it works' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Which drafts are ready to publish?' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(ask).toHaveBeenCalledWith({ message: 'Which drafts are ready to publish?', history: [] });
    expect(screen.getByRole('button', { name: /Forms copilot/ })).toHaveAttribute('aria-expanded', 'true');
    expect(await screen.findByText('one')).toBeInTheDocument();
  });

  it('shows a thinking row while waiting and keeps the send button disabled', async () => {
    let resolve: (reply: CopilotResponse) => void = () => {};
    const ask = vi.fn(() => new Promise<CopilotResponse>((done) => (resolve = done)));
    panel(ask);
    await userEvent.type(screen.getByLabelText('Question'), 'hello{Enter}');
    expect(screen.getByRole('status')).toHaveTextContent(/Thinking.*Looking at your forms/);
    await userEvent.type(screen.getByLabelText('Question'), 'again');
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    resolve({ answer: 'Hi.', proposedActions: [], trace: [] });
    expect(await screen.findByText('Hi.')).toBeInTheDocument();
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Checked/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled();
  });

  it('Shift+Enter adds a new line instead of sending', async () => {
    const { ask } = panel();
    const input = screen.getByLabelText('Question');
    await userEvent.type(input, 'line one{Shift>}{Enter}{/Shift}line two');
    expect(ask).not.toHaveBeenCalled();
    expect(input).toHaveValue('line one\nline two');
    await userEvent.type(input, '{Enter}');
    expect(ask).toHaveBeenCalledWith({ message: 'line one\nline two', history: [] });
  });

  it('applies only the checked actions, then shows the result row', async () => {
    const execute = vi.fn(async (actions: CopilotAction[]) => ({ done: actions, failed: [] }));
    panel(undefined, execute);
    await userEvent.type(screen.getByLabelText('Question'), 'clean up{Enter}');
    await screen.findByText('Retire · ICICI · Re-KYC draft v1 (icici_a)');
    await userEvent.click(screen.getAllByRole('checkbox')[1]);
    await userEvent.click(screen.getByRole('button', { name: 'Apply 1' }));
    expect(execute).toHaveBeenCalledWith([RETIRE]);
    expect(await screen.findByText('Retired 1 draft')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Apply/ })).toBeNull();
    expect(screen.queryByText(/nothing happens until you apply/i)).toBeNull();
  });

  it('shows per-item errors after applying', async () => {
    const execute = vi.fn(async () => ({ done: [RETIRE], failed: [{ action: UNPUBLISH, error: 'That form was not found.' }] }));
    panel(undefined, execute);
    await userEvent.click(screen.getByRole('button', { name: 'Duplicate drafts' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Apply 2' }));
    expect(await screen.findByText('Retired 1 draft')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(
      /One change did not go through.*Unpublish Axis · Account opening · live v1: That form was not found\./,
    );
  });

  it('dismiss drops the proposals without running anything', async () => {
    const { execute } = panel();
    await userEvent.click(screen.getByRole('button', { name: 'Duplicate drafts' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Dismiss' }));
    expect(execute).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /Apply/ })).toBeNull();
    expect(screen.getByText(/Suggestions dismissed/)).toBeInTheDocument();
    expect(screen.getByText('one')).toBeInTheDocument();
  });

  it('sends earlier turns as history, shows errors as a friendly message, and retries', async () => {
    const ask = vi
      .fn<(request: CopilotRequest) => Promise<CopilotResponse>>()
      .mockResolvedValueOnce({ answer: 'First.', proposedActions: [], trace: [] })
      .mockRejectedValueOnce(new Error('The forms assistant is not available right now. (copilot_unavailable)'))
      .mockResolvedValueOnce({ answer: 'Second.', proposedActions: [], trace: [] });
    panel(ask);
    await userEvent.type(screen.getByLabelText('Question'), 'one{Enter}');
    await screen.findByText('First.');
    await userEvent.type(screen.getByLabelText('Question'), 'two{Enter}');
    expect(await screen.findByText('I could not answer that.')).toBeInTheDocument();
    expect(screen.getByText(/Gemini could not answer just now/)).toBeInTheDocument();
    expect(screen.queryByText(/copilot_unavailable/)).toBeNull();
    expect(ask.mock.calls[1][0].history).toEqual([
      { role: 'user', text: 'one' },
      { role: 'model', text: 'First.' },
    ]);
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Second.')).toBeInTheDocument();
    expect(ask.mock.calls[2][0].message).toBe('two');
    expect(screen.queryByText('I could not answer that.')).toBeNull();
    expect(within(screen.getByRole('log')).getAllByText('two')).toHaveLength(1);
  });

  it('new conversation clears the thread and the history', async () => {
    const ask = vi.fn(async () => ({ answer: 'First.', proposedActions: [], trace: [] }));
    panel(ask);
    await userEvent.type(screen.getByLabelText('Question'), 'one{Enter}');
    await screen.findByText('First.');
    await userEvent.click(screen.getByRole('button', { name: 'New conversation' }));
    expect(screen.queryByText('First.')).toBeNull();
    expect(screen.getByRole('group', { name: 'Suggested questions' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New conversation' })).toBeNull();
    await userEvent.type(screen.getByLabelText('Question'), 'again{Enter}');
    await waitFor(() => expect(ask).toHaveBeenCalledTimes(2));
    expect(ask).toHaveBeenLastCalledWith({ message: 'again', history: [] });
  });

  it('maps rate limits and network failures to plain words', () => {
    expect(friendlyError('The forms assistant is not available right now. (rate_limited)')).toMatch(/lot of questions/);
    expect(friendlyError('Failed to fetch')).toMatch(/reach the server/);
    expect(friendlyError('Sign in as the Cup admin first.')).toBe('Sign in as the Cup admin first.');
  });

  it('renders markdown-lite as text, never as HTML', () => {
    render(<AnswerText text={'<img src=x onerror=alert(1)> **bold**\n- item'} />);
    expect(document.querySelector('img')).toBeNull();
    expect(screen.getByText('bold').tagName).toBe('STRONG');
    expect(screen.getByRole('listitem')).toHaveTextContent('item');
  });
});

describe('Console with the assistant', () => {
  const RESPONSE: AdminFormsResponse = {
    forms: [
      { formId: 'icici_a', version: 'v1', bankId: 'ICICI', journey: 'rekyc', status: 'draft', source: 'ocr', fieldCount: 10, sharedCount: 4, needsReview: 0, updatedAt: null },
      { formId: 'axis_old', version: 'v1', bankId: 'Axis', journey: 'account_opening', status: 'published', source: 'ocr', fieldCount: 10, sharedCount: 4, needsReview: 0, updatedAt: null },
    ],
    stats: { publishedForms: 1, draftForms: 1, fieldsAwaitingReview: 0, voiceRequests24h: null },
  };

  function api(overrides: Partial<ConsoleApi> = {}): ConsoleApi {
    return {
      loadForms: vi.fn(async () => RESPONSE),
      publish: vi.fn(async () => {}),
      setStatus: vi.fn(async () => {}),
      openPdf: vi.fn(async () => {}),
      askCopilot: vi.fn(async () => REPLY),
      ...overrides,
    };
  }

  it('hides the panel when the api has no assistant', async () => {
    const { askCopilot: _unused, ...plain } = api();
    render(<ConsolePage api={plain} onReview={vi.fn()} onUpload={vi.fn()} />);
    await screen.findByRole('article', { name: 'ICICI · Re-KYC' });
    expect(screen.queryByRole('region', { name: 'Ask about your forms' })).toBeNull();
  });

  it('runs applied proposals through the console actions, reports them in the thread and reloads', async () => {
    const stub = api();
    render(<ConsolePage api={stub} onReview={vi.fn()} onUpload={vi.fn()} />);
    await screen.findByRole('article', { name: 'ICICI · Re-KYC' });
    await userEvent.click(screen.getByRole('button', { name: 'Duplicate drafts' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Apply 2' }));
    await waitFor(() => expect(stub.setStatus).toHaveBeenCalledTimes(2));
    expect(stub.setStatus).toHaveBeenNthCalledWith(1, { formId: 'icici_a', version: 'v1', status: 'retired' });
    expect(stub.setStatus).toHaveBeenNthCalledWith(2, { formId: 'axis_old', version: 'v1', status: 'draft' });
    expect(await screen.findByText('Retired 1 draft · Unpublished 1 live form')).toBeInTheDocument();
    expect(stub.loadForms).toHaveBeenCalledTimes(2);
  });

  it('publishes through the publish flow and reports a failure per item', async () => {
    const publish: CopilotAction = { ...RETIRE, type: 'publish', to: 'published' };
    const stub = api({
      askCopilot: vi.fn(async () => ({ ...REPLY, proposedActions: [publish] })),
      publish: vi.fn(async () => {
        throw new Error('Check every low-confidence field before publishing.');
      }),
    });
    render(<ConsolePage api={stub} onReview={vi.fn()} onUpload={vi.fn()} />);
    await screen.findByRole('article', { name: 'ICICI · Re-KYC' });
    await userEvent.click(screen.getByRole('button', { name: 'Duplicate drafts' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Apply 1' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Publish ICICI · Re-KYC · draft v1: Check every low-confidence field/);
    expect(stub.publish).toHaveBeenCalledWith(expect.objectContaining({ formId: 'icici_a', version: 'v1' }));
    expect(stub.setStatus).not.toHaveBeenCalled();
  });
});

describe('mock copilot', () => {
  it('proposes retiring the older ICICI drafts after several tool calls', async () => {
    const reply = await mockCopilotReply('Find duplicate drafts');
    expect(reply.trace.map((step) => step.tool)).toEqual(['list_forms', 'find_duplicates', 'form_coverage', 'propose_actions']);
    expect(reply.proposedActions).toHaveLength(2);
    for (const action of reply.proposedActions) {
      expect(action.type).toBe('retire');
      const row = mockAdminForms().forms.find((item) => item.formId === action.formId);
      expect(row?.status).toBe('draft');
      expect(row?.bankId).toBe('ICICI');
    }
  });

  it('answers the other prompts, proposing only publishes of fully checked drafts', async () => {
    expect((await mockCopilotReply("Which live forms don't capture mobile?")).proposedActions).toEqual([]);
    expect((await mockCopilotReply('What did customers struggle with today?')).proposedActions).toEqual([]);
    const ready = await mockCopilotReply('Which drafts are ready to publish?');
    expect(ready.proposedActions.map((action) => [action.type, action.formId])).toEqual([['publish', 'form_axis_aof_new']]);
  });
});
