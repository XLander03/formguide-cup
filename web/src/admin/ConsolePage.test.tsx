import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AdminFormRow, AdminFormsResponse } from '../../../shared/forms/admin';
import { setViewport } from '../test/viewport';
import type { ConsoleApi } from './consoleClient';
import { ConsolePage } from './ConsolePage';

const NOW = Date.parse('2026-10-17T12:00:00Z');

function row(patch: Partial<AdminFormRow>): AdminFormRow {
  return {
    formId: 'f',
    version: 'v1',
    bankId: 'ICICI',
    journey: 'rekyc',
    status: 'draft',
    source: 'ocr',
    fieldCount: 129,
    sharedCount: 41,
    needsReview: 0,
    updatedAt: null,
    ...patch,
  };
}

const AXIS_NEW = row({ formId: 'axis_new', bankId: 'Axis', journey: 'account_opening', fieldCount: 262, sharedCount: 23, updatedAt: '2026-10-17T11:55:00Z' });
const AXIS_OLD = row({ formId: 'axis_old', bankId: 'Axis', journey: 'account_opening', status: 'published', fieldCount: 248 });
const AXIS_REKYC = row({ formId: 'axis_rekyc', bankId: 'Axis', status: 'published', source: 'acroform', fieldCount: 64 });
const ICICI_A = row({ formId: 'icici_a', needsReview: 5 });
const ICICI_B = row({ formId: 'icici_b', needsReview: 5 });
const ICICI_C = row({ formId: 'icici_c', needsReview: 5 });
const ICICI_LIVE = row({ formId: 'icici_live', status: 'published' });
const PNB_GONE = row({ formId: 'pnb_gone', bankId: 'PNB', status: 'retired' });

const RESPONSE: AdminFormsResponse = {
  forms: [AXIS_NEW, AXIS_OLD, AXIS_REKYC, ICICI_A, ICICI_B, ICICI_C, ICICI_LIVE, PNB_GONE],
  stats: { publishedForms: 3, draftForms: 4, fieldsAwaitingReview: 15, voiceRequests24h: null },
};

function stubApi(overrides: Partial<ConsoleApi> = {}, response: AdminFormsResponse = RESPONSE): ConsoleApi {
  return {
    loadForms: vi.fn(async () => response),
    publish: vi.fn(async () => {}),
    setStatus: vi.fn(async () => {}),
    openPdf: vi.fn(async () => {}),
    ...overrides,
  };
}

function renderConsole(api: ConsoleApi, extra: { onReview?: () => void; onUpload?: () => void } = {}) {
  const onReview = extra.onReview ?? vi.fn();
  const onUpload = extra.onUpload ?? vi.fn();
  render(<ConsolePage api={api} onReview={onReview} onUpload={onUpload} now={NOW} />);
  return { onReview, onUpload };
}

function filterButton(name: RegExp) {
  return within(screen.getByRole('group', { name: 'Show forms' })).getByRole('button', { name });
}

function tile(name: RegExp) {
  return within(screen.getByRole('group', { name: 'Summary' })).getByRole('button', { name });
}

function card(name: string) {
  return screen.getByRole('article', { name });
}

afterEach(() => setViewport(1365));

describe('ConsolePage', () => {
  it('opens on Needs review, with counts on every filter and older drafts collapsed', async () => {
    renderConsole(stubApi());

    const icici = await screen.findByRole('article', { name: 'ICICI · Re-KYC' });
    expect(filterButton(/^Needs review/)).toHaveAttribute('aria-pressed', 'true');
    expect(filterButton(/^Needs review/)).toHaveTextContent('1');
    expect(filterButton(/^Ready to publish/)).toHaveTextContent('1');
    expect(filterButton(/^Live/)).toHaveTextContent('3');
    expect(filterButton(/^Retired/)).toHaveTextContent('1');
    expect(filterButton(/^All/)).toHaveTextContent('3');

    expect(within(screen.getByRole('list', { name: 'Forms' })).getAllByRole('article')).toHaveLength(1);
    const versions = within(icici).getAllByRole('listitem');
    expect(versions.map((item) => item.textContent)).toEqual([
      'LiveOCR · 129 fields · 41 filled by voice',
      'DraftOCR · 129 fields · 41 filled by voice',
    ]);
    expect(icici).toHaveTextContent('2 older drafts');
    expect(within(icici).getByRole('button', { name: 'Review 5 fields' })).toBeEnabled();
  });

  it('shows stat tiles that set the filter, and "Not available" for missing voice counts', async () => {
    const user = userEvent.setup();
    renderConsole(stubApi());
    await screen.findByRole('article', { name: 'ICICI · Re-KYC' });

    const review = tile(/^Need review/);
    expect(review).toHaveTextContent('Need review15 fields');
    expect(review).toHaveAttribute('aria-pressed', 'true');
    expect(tile(/^Live forms/)).toHaveTextContent('3');
    expect(screen.getByText('Voice requests (24h)').parentElement).toHaveTextContent('Not available');
    expect(screen.queryByText('—')).toBeNull();

    await user.click(tile(/^Ready to publish/));
    expect(filterButton(/^Ready to publish/)).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('article', { name: 'Axis · Account opening' })).toBeInTheDocument();
    expect(screen.queryByRole('article', { name: 'ICICI · Re-KYC' })).toBeNull();
  });

  it('defaults to Ready to publish, then Live, when nothing needs review', async () => {
    const ready = { ...RESPONSE, forms: [AXIS_NEW, AXIS_OLD] };
    renderConsole(stubApi({}, ready));
    await screen.findByRole('article', { name: 'Axis · Account opening' });
    expect(filterButton(/^Ready to publish/)).toHaveAttribute('aria-pressed', 'true');
  });

  it('defaults to Live with only live forms, and its action opens the customer site', async () => {
    renderConsole(stubApi({}, { ...RESPONSE, forms: [AXIS_REKYC] }));
    const axis = await screen.findByRole('article', { name: 'Axis · Re-KYC' });
    expect(filterButton(/^Live/)).toHaveAttribute('aria-pressed', 'true');
    expect(within(axis).getByRole('link', { name: 'View on site' })).toHaveAttribute('href', '/journey');
    expect(axis).toHaveTextContent('Fillable PDF · 64 fields · 41 filled by voice');
  });

  it('shows retired versions only under the Retired filter', async () => {
    const user = userEvent.setup();
    renderConsole(stubApi());
    await screen.findByRole('article', { name: 'ICICI · Re-KYC' });

    await user.click(filterButton(/^All/));
    expect(screen.queryByRole('article', { name: 'PNB · Re-KYC' })).toBeNull();
    expect(screen.queryByText('Retired', { selector: 'span' })).toBeNull();

    await user.click(filterButton(/^Retired/));
    const pnb = card('PNB · Re-KYC');
    expect(within(pnb).getByText('Retired')).toBeInTheDocument();
  });

  it('opens review for the newest draft from the primary action', async () => {
    const user = userEvent.setup();
    const { onReview } = renderConsole(stubApi());
    const icici = await screen.findByRole('article', { name: 'ICICI · Re-KYC' });
    await user.click(within(icici).getByRole('button', { name: 'Review 5 fields' }));
    expect(onReview).toHaveBeenCalledWith(ICICI_A);
  });

  it('publishes a draft with no live form straight away', async () => {
    const user = userEvent.setup();
    const hdfc = row({ formId: 'hdfc', bankId: 'HDFC', journey: 'kyc_update' });
    const api = stubApi({}, { ...RESPONSE, forms: [hdfc] });
    renderConsole(api);

    const group = await screen.findByRole('article', { name: 'HDFC · KYC update' });
    await user.click(within(group).getByRole('button', { name: 'Publish' }));
    await waitFor(() => expect(api.publish).toHaveBeenCalledWith(hdfc));
    expect(api.setStatus).not.toHaveBeenCalled();
    expect(await screen.findByText(/Published HDFC · KYC update/)).toBeInTheDocument();
    expect(api.loadForms).toHaveBeenCalledTimes(2);
  });

  it('publishes and replaces: asks first, publishes the draft, then sends the old live version to draft', async () => {
    const user = userEvent.setup();
    const calls: string[] = [];
    const api = stubApi({
      publish: vi.fn(async (item: AdminFormRow) => {
        calls.push(`publish ${item.formId}`);
      }),
      setStatus: vi.fn(async (request) => {
        calls.push(`${request.status} ${request.formId}`);
      }),
    });
    renderConsole(api);
    await screen.findByRole('article', { name: 'ICICI · Re-KYC' });
    await user.click(filterButton(/^Ready to publish/));

    await user.click(within(card('Axis · Account opening')).getByRole('button', { name: 'Publish & replace live' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Publish and replace the live form?' });
    expect(dialog).toHaveTextContent('Customers will see the new version');
    expect(api.publish).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('button', { name: 'Publish & replace' }));
    await waitFor(() => expect(calls).toEqual(['publish axis_new', 'draft axis_old']));
    expect(api.setStatus).toHaveBeenCalledWith({ formId: 'axis_old', version: 'v1', status: 'draft' });
    expect(await screen.findByRole('status')).toHaveTextContent('customers see only the new one');
  });

  it('says clearly when the new form went live but the old one could not be taken down', async () => {
    const user = userEvent.setup();
    const api = stubApi({ setStatus: vi.fn(async () => Promise.reject(new Error('Network down.'))) });
    renderConsole(api);
    await screen.findByRole('article', { name: 'ICICI · Re-KYC' });
    await user.click(filterButton(/^Ready to publish/));
    await user.click(within(card('Axis · Account opening')).getByRole('button', { name: 'Publish & replace live' }));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Publish & replace' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Published the new Axis · Account opening, but could not take the old version off');
    expect(alert).toHaveTextContent('Network down.');
    expect(alert).toHaveTextContent('Both are live now');
    expect(api.loadForms).toHaveBeenCalledTimes(2);
  });

  it('clears older drafts after a confirm, retiring only the older ones', async () => {
    const user = userEvent.setup();
    const api = stubApi();
    renderConsole(api);
    const icici = await screen.findByRole('article', { name: 'ICICI · Re-KYC' });

    await user.click(within(icici).getByRole('button', { name: 'Clear older drafts' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Clear older drafts?' });
    expect(dialog).toHaveTextContent('Retires 2 older drafts');
    await user.click(within(dialog).getByRole('button', { name: 'Clear older drafts' }));

    await waitFor(() => expect(api.setStatus).toHaveBeenCalledTimes(2));
    expect(api.setStatus).toHaveBeenCalledWith({ formId: 'icici_b', version: 'v1', status: 'retired' });
    expect(api.setStatus).toHaveBeenCalledWith({ formId: 'icici_c', version: 'v1', status: 'retired' });
    expect(await screen.findByText('Cleared 2 older drafts of ICICI · Re-KYC.')).toBeInTheDocument();
  });

  it('keeps the rest in a More menu that works from the keyboard', async () => {
    const user = userEvent.setup();
    const api = stubApi();
    renderConsole(api);
    const icici = await screen.findByRole('article', { name: 'ICICI · Re-KYC' });

    const more = within(icici).getByRole('button', { name: 'More actions for ICICI · Re-KYC' });
    expect(more).toHaveAttribute('aria-expanded', 'false');
    more.focus();
    await user.keyboard('{Enter}');
    expect(more).toHaveAttribute('aria-expanded', 'true');
    const menu = screen.getByRole('menu', { name: 'More actions for ICICI · Re-KYC' });
    const items = within(menu).getAllByRole('menuitem');
    expect(items.map((item) => item.textContent)).toEqual([
      'Review live version',
      'View on site',
      'Unpublish live version',
      'Source PDF (draft)',
      'Source PDF (live)',
      'Retire draft',
      'Retire live version',
    ]);
    expect(items[0]).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(items[1]).toHaveFocus();
    await user.keyboard('{ArrowUp}{ArrowUp}');
    expect(items[items.length - 1]).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(more).toHaveAttribute('aria-expanded', 'false');
    expect(more).toHaveFocus();

    await user.click(more);
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('menu')).toBeNull();

    await user.click(more);
    await user.click(screen.getByRole('menuitem', { name: 'Source PDF (live)' }));
    await waitFor(() => expect(api.openPdf).toHaveBeenCalledWith(ICICI_LIVE));
    expect(api.loadForms).toHaveBeenCalledTimes(1);
  });

  it('unpublishes from the menu after a confirm', async () => {
    const user = userEvent.setup();
    const api = stubApi();
    renderConsole(api);
    const icici = await screen.findByRole('article', { name: 'ICICI · Re-KYC' });

    await user.click(within(icici).getByRole('button', { name: /^More actions/ }));
    await user.click(screen.getByRole('menuitem', { name: 'Unpublish live version' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Unpublish this form?' });
    await user.click(within(dialog).getByRole('button', { name: 'Unpublish' }));
    await waitFor(() =>
      expect(api.setStatus).toHaveBeenCalledWith({ formId: 'icici_live', version: 'v1', status: 'draft' }),
    );
  });

  it('shows an action error, and opens upload', async () => {
    const user = userEvent.setup();
    const api = stubApi({ openPdf: vi.fn(async () => Promise.reject(new Error('That form was not found.'))) });
    const { onUpload } = renderConsole(api);
    const icici = await screen.findByRole('article', { name: 'ICICI · Re-KYC' });

    await user.click(screen.getByRole('button', { name: 'Upload a form' }));
    expect(onUpload).toHaveBeenCalled();
    await user.click(within(icici).getByRole('button', { name: /^More actions/ }));
    await user.click(screen.getByRole('menuitem', { name: 'Source PDF (draft)' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('That form was not found.');
  });

  it('shows loading, then an error with a retry, then the empty state', async () => {
    const user = userEvent.setup();
    let fail = true;
    const loadForms = vi.fn(async () => {
      if (fail) throw new Error('Your sign-in expired — sign out and back in.');
      return { forms: [], stats: { publishedForms: 0, draftForms: 0, fieldsAwaitingReview: 0, voiceRequests24h: 7 } };
    });
    renderConsole(stubApi({ loadForms }));

    expect(screen.getByText('Loading forms…')).toBeInTheDocument();
    expect(await screen.findByRole('alert')).toHaveTextContent('Your sign-in expired');

    fail = false;
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('No forms yet.')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('refreshes on demand', async () => {
    const user = userEvent.setup();
    const api = stubApi();
    renderConsole(api);
    await screen.findByRole('article', { name: 'ICICI · Re-KYC' });
    await user.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(api.loadForms).toHaveBeenCalledTimes(2));
  });
});
