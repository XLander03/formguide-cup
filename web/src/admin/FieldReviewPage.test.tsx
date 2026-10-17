import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FormVersion } from '../../../shared/forms/types';
import { saveAdminDraft } from './draftStore';
import { FieldReviewPage, type ReviewLoaders } from './FieldReviewPage';
import type { PdfInspection } from './pdfChecks';
import { placeholderFormVersion } from './placeholderForm';

const pages = [
  { width: 595, height: 842 },
  { width: 595, height: 842 },
];

function storedForm(): FormVersion {
  return {
    ...placeholderFormVersion({ bankId: 'Axis', journey: 'account_opening', fillable: true }),
    formId: 'axis_aof',
    version: 'v3',
  };
}

function stubLoaders(overrides: Partial<ReviewLoaders> = {}): ReviewLoaders {
  const bytes = new Uint8Array([37, 80, 68, 70]);
  return {
    loadForm: vi.fn(async () => storedForm()),
    loadPdf: vi.fn(async () => new Blob([bytes], { type: 'application/pdf' })),
    inspect: vi.fn(async (): Promise<PdfInspection> => ({
      rows: [],
      reason: null,
      pageCount: 2,
      pages,
      fillable: true,
      bytes,
    })),
    render: vi.fn(async () => ['data:image/png;base64,AAAA', 'data:image/png;base64,BBBB']),
    publish: vi.fn(async () => {}),
    ...overrides,
  };
}

beforeEach(() => sessionStorage.clear());
afterEach(() => sessionStorage.clear());

describe('FieldReviewPage', () => {
  it('loads the form and its source PDF from the server when this tab has no draft', async () => {
    const loaders = stubLoaders();
    render(<FieldReviewPage formId="axis_aof" version="v3" onConsole={vi.fn()} loaders={loaders} />);

    expect(screen.getByRole('status')).toHaveTextContent('Loading the form');
    expect(await screen.findByRole('heading', { name: 'Axis · Account opening' })).toBeInTheDocument();
    expect(loaders.loadForm).toHaveBeenCalledWith('axis_aof', 'v3');
    expect(loaders.loadPdf).toHaveBeenCalledWith('axis_aof', 'v3');
    expect(loaders.inspect).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(loaders.render).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: 'Publish' })).toBeInTheDocument();
    expect(screen.getByText('axis_aof · v3')).toBeInTheDocument();
  });

  it('uses the in-tab draft without calling the server', async () => {
    const form = storedForm();
    saveAdminDraft({ form, pages });
    const loaders = stubLoaders();
    render(<FieldReviewPage formId="axis_aof" version="v3" onConsole={vi.fn()} loaders={loaders} />);

    expect(screen.getByRole('heading', { name: 'Axis · Account opening' })).toBeInTheDocument();
    expect(loaders.loadForm).not.toHaveBeenCalled();
    expect(loaders.loadPdf).not.toHaveBeenCalled();
  });

  it('goes to the server when the in-tab draft is a different version', async () => {
    saveAdminDraft({ form: { ...storedForm(), version: 'v2' }, pages });
    const loaders = stubLoaders();
    render(<FieldReviewPage formId="axis_aof" version="v3" onConsole={vi.fn()} loaders={loaders} />);
    await screen.findByText('axis_aof · v3');
    expect(loaders.loadForm).toHaveBeenCalledWith('axis_aof', 'v3');
  });

  it('shows the reason and a way back when the form cannot be loaded', async () => {
    const user = userEvent.setup();
    const onConsole = vi.fn();
    const loaders = stubLoaders({ loadForm: vi.fn(async () => Promise.reject(new Error('That form was not found.'))) });
    render(<FieldReviewPage formId="gone" onConsole={onConsole} loaders={loaders} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('That form was not found.');
    await user.click(screen.getByRole('button', { name: 'Back to console' }));
    expect(onConsole).toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(loaders.loadForm).toHaveBeenCalledTimes(2));
  });

  it('hands the published form back after publish', async () => {
    const user = userEvent.setup();
    const onPublished = vi.fn();
    const form = storedForm();
    const ready = { ...form, fields: form.fields.map((field) => ({ ...field, checked: true })) };
    const loaders = stubLoaders({ loadForm: vi.fn(async () => ready) });
    render(<FieldReviewPage formId="axis_aof" version="v3" onConsole={vi.fn()} onPublished={onPublished} loaders={loaders} />);

    await user.click(await screen.findByRole('button', { name: 'Publish' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(dialog.querySelectorAll('button')[1] as HTMLButtonElement);
    await waitFor(() => expect(onPublished).toHaveBeenCalledTimes(1));
    expect(loaders.publish).toHaveBeenCalledTimes(1);
    expect((onPublished.mock.calls[0][0] as FormVersion).formId).toBe('axis_aof');
  });
});
