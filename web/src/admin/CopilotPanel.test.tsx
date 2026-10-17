import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AdminFormsResponse } from '../../../shared/forms/admin';
import type { CopilotAction, CopilotResponse } from '../../../shared/forms/copilot';
import type { ConsoleApi } from './consoleClient';
import { ConsolePage } from './ConsolePage';
import { AnswerText, CopilotPanel } from './CopilotPanel';
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

function panel(ask = vi.fn(async () => REPLY), execute = vi.fn(async () => {})) {
  render(<CopilotPanel ask={ask} execute={execute} initialOpen />);
  return { ask, execute };
}

afterEach(() => resetMockConsole());

describe('CopilotPanel', () => {
  it('starts collapsed and opens on click', async () => {
    render(<CopilotPanel ask={vi.fn()} execute={vi.fn()} />);
    const toggle = screen.getByRole('button', { name: /Ask about your forms/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('group', { name: 'Suggested questions' })).toBeNull();
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(within(screen.getByRole('group', { name: 'Suggested questions' })).getAllByRole('button')).toHaveLength(3);
  });

  it('asks a suggestion and shows the answer, the trace and the proposals, all checked', async () => {
    const { ask } = panel();
    await userEvent.click(screen.getByRole('button', { name: 'Find duplicate drafts' }));
    expect(ask).toHaveBeenCalledWith({ message: 'Find duplicate drafts', history: [] });
    expect(await screen.findByText('2')).toBeInTheDocument();
    expect(screen.getByText('one')).toBeInTheDocument();
    expect(screen.getByText(/How I got this \(2 steps\)/)).toBeInTheDocument();
    expect(screen.getByText(/list_forms\(\{"status":"published"\}\)/)).toBeInTheDocument();
    expect(screen.getByText(/nothing has changed yet/i)).toBeInTheDocument();
    expect(screen.getByText('Retire ICICI · Re-KYC · draft')).toBeInTheDocument();
    expect(screen.getByText(/can never be published again/)).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox').every((box) => (box as HTMLInputElement).checked)).toBe(true);
    expect(screen.getByRole('button', { name: 'Confirm 2 changes' })).toBeEnabled();
  });

  it('confirms only the checked actions, then clears them', async () => {
    const { execute } = panel();
    await userEvent.type(screen.getByLabelText('Question'), 'clean up{Enter}');
    await screen.findByText('Retire ICICI · Re-KYC · draft');
    await userEvent.click(screen.getAllByRole('checkbox')[1]);
    await userEvent.click(screen.getByRole('button', { name: 'Confirm 1 change' }));
    expect(execute).toHaveBeenCalledWith([RETIRE]);
    await waitFor(() => expect(screen.queryByText('Retire ICICI · Re-KYC · draft')).toBeNull());
  });

  it('dismiss drops the proposals without running anything', async () => {
    const { execute } = panel();
    await userEvent.click(screen.getByRole('button', { name: 'Find duplicate drafts' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Dismiss' }));
    expect(execute).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /Confirm/ })).toBeNull();
    expect(screen.getByText('one')).toBeInTheDocument();
  });

  it('sends earlier turns as history and shows errors', async () => {
    const ask = vi
      .fn<(request: { message: string; history?: unknown[] }) => Promise<CopilotResponse>>()
      .mockResolvedValueOnce({ answer: 'First.', proposedActions: [], trace: [] })
      .mockRejectedValueOnce(new Error('The forms assistant is not available right now.'));
    panel(ask as never);
    await userEvent.type(screen.getByLabelText('Question'), 'one{Enter}');
    await screen.findByText('First.');
    await userEvent.type(screen.getByLabelText('Question'), 'two{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent('not available');
    expect(ask.mock.calls[1][0].history).toEqual([
      { role: 'user', text: 'one' },
      { role: 'model', text: 'First.' },
    ]);
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

  it('runs confirmed proposals through the console actions and reloads', async () => {
    const stub = api();
    render(<ConsolePage api={stub} onReview={vi.fn()} onUpload={vi.fn()} />);
    await screen.findByRole('article', { name: 'ICICI · Re-KYC' });
    await userEvent.click(screen.getByRole('button', { name: /Ask about your forms/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Find duplicate drafts' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Confirm 2 changes' }));
    await waitFor(() => expect(stub.setStatus).toHaveBeenCalledTimes(2));
    expect(stub.setStatus).toHaveBeenNthCalledWith(1, { formId: 'icici_a', version: 'v1', status: 'retired' });
    expect(stub.setStatus).toHaveBeenNthCalledWith(2, { formId: 'axis_old', version: 'v1', status: 'draft' });
    expect(await screen.findByText(/^Done: Retire ICICI/)).toBeInTheDocument();
    expect(stub.loadForms).toHaveBeenCalledTimes(2);
  });

  it('publishes through the publish flow and reports a failure', async () => {
    const publish: CopilotAction = { ...RETIRE, type: 'publish', to: 'published' };
    const stub = api({
      askCopilot: vi.fn(async () => ({ ...REPLY, proposedActions: [publish] })),
      publish: vi.fn(async () => {
        throw new Error('Check every low-confidence field before publishing.');
      }),
    });
    render(<ConsolePage api={stub} onReview={vi.fn()} onUpload={vi.fn()} />);
    await screen.findByRole('article', { name: 'ICICI · Re-KYC' });
    await userEvent.click(screen.getByRole('button', { name: /Ask about your forms/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Find duplicate drafts' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Confirm 1 change' }));
    expect(await screen.findByText(/Did 0 of 1 changes/)).toBeInTheDocument();
    expect(stub.publish).toHaveBeenCalledWith(expect.objectContaining({ formId: 'icici_a', version: 'v1' }));
    expect(stub.setStatus).not.toHaveBeenCalled();
  });
});

describe('mock copilot', () => {
  it('proposes retiring one older ICICI draft that is still a draft', async () => {
    const reply = await mockCopilotReply('Find duplicate drafts');
    expect(reply.proposedActions).toHaveLength(1);
    const [action] = reply.proposedActions;
    expect(action.type).toBe('retire');
    const row = mockAdminForms().forms.find((item) => item.formId === action.formId);
    expect(row?.status).toBe('draft');
    expect(row?.bankId).toBe('ICICI');
  });

  it('answers the other suggestions without proposals', async () => {
    expect((await mockCopilotReply("Which live forms don't capture mobile?")).proposedActions).toEqual([]);
    expect((await mockCopilotReply('What did customers struggle with today?')).proposedActions).toEqual([]);
  });
});
