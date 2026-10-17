import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AdminFormRow, AdminFormsResponse } from '../../../shared/forms/admin';
import { setViewport } from '../test/viewport';
import type { ConsoleApi } from './consoleClient';
import { ConsolePage } from './ConsolePage';

const NOW = Date.parse('2026-10-17T12:00:00Z');

function row(patch: Partial<AdminFormRow>): AdminFormRow {
  return {
    formId: 'hdfc_kyc',
    version: 'v1',
    bankId: 'HDFC',
    journey: 'kyc_update',
    status: 'draft',
    source: 'ocr',
    fieldCount: 40,
    sharedCount: 31,
    needsReview: 0,
    updatedAt: '2026-10-17T09:00:00Z',
    ...patch,
  };
}

const RESPONSE: AdminFormsResponse = {
  forms: [
    row({ formId: 'hdfc_kyc', needsReview: 3 }),
    row({ formId: 'axis_aof', bankId: 'Axis', journey: 'account_opening', source: 'acroform', needsReview: 0 }),
    row({ formId: 'icici_kyc', bankId: 'ICICI', status: 'published', updatedAt: null }),
    row({ formId: 'pnb_rekyc', bankId: 'PNB', journey: 'rekyc', status: 'retired' }),
  ],
  stats: { publishedForms: 1, draftForms: 2, fieldsAwaitingReview: 3, voiceRequests24h: null },
};

function stubApi(overrides: Partial<ConsoleApi> = {}): ConsoleApi {
  return {
    loadForms: vi.fn(async () => RESPONSE),
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

afterEach(() => setViewport(1365));

describe('ConsolePage', () => {
  it('renders stat tiles and one row per form from the loader', async () => {
    renderConsole(stubApi());

    const table = await screen.findByRole('table', { name: 'Forms' });
    const tiles = screen.getByText('Published forms').closest('div') as HTMLElement;
    expect(within(tiles).getByText('1')).toBeInTheDocument();
    expect(within(screen.getByText('Drafts awaiting review').closest('div') as HTMLElement).getByText('2')).toBeInTheDocument();
    expect(within(screen.getByText('Fields awaiting review').closest('div') as HTMLElement).getByText('3')).toBeInTheDocument();
    expect(within(screen.getByText('Voice requests (24h)').closest('div') as HTMLElement).getByText('—')).toBeInTheDocument();

    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(4);
    const axis = rows[1];
    expect(within(axis).getByText('Axis')).toBeInTheDocument();
    expect(within(axis).getByText('Account opening')).toBeInTheDocument();
    expect(within(axis).getByText('Fillable PDF')).toBeInTheDocument();
    expect(within(axis).getByText('Draft')).toBeInTheDocument();
    expect(within(axis).getByText('3 h ago')).toBeInTheDocument();
    expect(within(rows[2]).getByText('Published')).toBeInTheDocument();
    expect(within(rows[3]).getByText('Retired')).toBeInTheDocument();
    expect(within(rows[3]).getByText('Re-KYC')).toBeInTheDocument();
  });

  it('turns Publish off with a reason while fields still need review', async () => {
    const api = stubApi();
    renderConsole(api);

    const blocked = await screen.findByRole('button', { name: 'Publish HDFC · KYC update' });
    expect(blocked).toBeDisabled();
    expect(blocked).toHaveAccessibleDescription('3 fields still need review.');

    const ready = screen.getByRole('button', { name: 'Publish Axis · Account opening' });
    expect(ready).toBeEnabled();
    await userEvent.setup().click(ready);
    await waitFor(() => expect(api.publish).toHaveBeenCalledWith(RESPONSE.forms[1]));
    await waitFor(() => expect(api.loadForms).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(/Published Axis · Account opening/)).toBeInTheDocument();
  });

  it('shows the right actions for each status', async () => {
    renderConsole(stubApi());
    await screen.findByRole('table', { name: 'Forms' });

    expect(screen.getByRole('button', { name: 'Review HDFC · KYC update' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Review ICICI · KYC update' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Unpublish ICICI · KYC update' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open ICICI · KYC update in the app' })).toHaveAttribute('href', '/journey');
    expect(screen.queryByRole('link', { name: 'Open HDFC · KYC update in the app' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Retire PNB · Re-KYC' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Source PDF for PNB · Re-KYC' })).toBeInTheDocument();
  });

  it('asks before unpublishing, then sets the form back to draft and reloads', async () => {
    const user = userEvent.setup();
    const api = stubApi();
    renderConsole(api);

    await user.click(await screen.findByRole('button', { name: 'Unpublish ICICI · KYC update' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Unpublish this form?' });
    expect(dialog).toHaveTextContent('leaves the customer journey list');
    expect(api.setStatus).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(api.setStatus).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Unpublish ICICI · KYC update' }));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Unpublish' }));

    await waitFor(() =>
      expect(api.setStatus).toHaveBeenCalledWith({ formId: 'icici_kyc', version: 'v1', status: 'draft' }),
    );
    await waitFor(() => expect(api.loadForms).toHaveBeenCalledTimes(2));
    expect(screen.getByText(/Unpublished ICICI · KYC update/)).toBeInTheDocument();
  });

  it('retires only after a confirm that says it cannot be undone', async () => {
    const user = userEvent.setup();
    const api = stubApi();
    renderConsole(api);

    await user.click(await screen.findByRole('button', { name: 'Retire Axis · Account opening' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Retire this form?' });
    expect(dialog).toHaveTextContent('cannot be undone');
    await user.click(within(dialog).getByRole('button', { name: 'Retire form' }));
    await waitFor(() =>
      expect(api.setStatus).toHaveBeenCalledWith({ formId: 'axis_aof', version: 'v1', status: 'retired' }),
    );
  });

  it('opens review and upload, and shows an action error', async () => {
    const user = userEvent.setup();
    const api = stubApi({ openPdf: vi.fn(async () => Promise.reject(new Error('That form was not found.'))) });
    const { onReview, onUpload } = renderConsole(api);

    await user.click(await screen.findByRole('button', { name: 'Review HDFC · KYC update' }));
    expect(onReview).toHaveBeenCalledWith(RESPONSE.forms[0]);
    await user.click(screen.getByRole('button', { name: 'Upload a form' }));
    expect(onUpload).toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Source PDF for PNB · Re-KYC' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('That form was not found.');
    expect(api.loadForms).toHaveBeenCalledTimes(1);
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
    await screen.findByRole('table', { name: 'Forms' });
    await user.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(api.loadForms).toHaveBeenCalledTimes(2));
  });

  it('shows cards instead of a table on a phone', async () => {
    setViewport(390);
    renderConsole(stubApi());
    const list = await screen.findByRole('list', { name: 'Forms' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(4);
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByRole('button', { name: 'Publish HDFC · KYC update' })).toBeDisabled();
  });
});
