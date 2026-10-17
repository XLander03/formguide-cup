import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { FormVersion } from '../../../shared/forms/types';
import { PDF_CHOOSE, PDF_NOT_READABLE } from './pdfChecks';
import { PLACEHOLDER_FORM_ID } from './placeholderForm';
import { UploadPage } from './UploadPage';

describe('UploadPage', () => {
  it('stops a bad file with a plain reason and does not ingest', async () => {
    const ingest = vi.fn();
    render(<UploadPage mock ingest={ingest} onReady={vi.fn()} />);

    const notes = new File(['hello'], 'notes.txt', { type: 'text/plain' });
    fireEvent.change(screen.getByLabelText('PDF file'), { target: { files: [notes] } });

    expect(await screen.findByRole('alert')).toHaveTextContent(PDF_CHOOSE);
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    expect(ingest).not.toHaveBeenCalled();
  });

  it('shows pass checks for a readable PDF and blocks a file that will not parse', async () => {
    render(<UploadPage mock ingest={vi.fn()} onReady={vi.fn()} />);

    fireEvent.drop(screen.getByText('Drop a PDF here').closest('label') as HTMLElement, {
      dataTransfer: { files: [new File(['%PDF-1.7 nope'], 'bad.pdf', { type: 'application/pdf' })] },
    });
    expect(await screen.findByRole('alert')).toHaveTextContent(PDF_NOT_READABLE);
    expect(screen.getByText('Fail · Not a PDF')).toBeInTheDocument();
  });

  it('continues with placeholder fields when mock=1', async () => {
    const user = userEvent.setup();
    const onReady = vi.fn();
    render(<UploadPage mock onReady={onReady} />);

    await user.click(screen.getByRole('button', { name: 'Use a 2-page placeholder PDF' }));
    expect(await screen.findByText('Fillable')).toBeInTheDocument();
    expect(screen.getByText('Pass · 2 pages')).toBeInTheDocument();
    expect(screen.getByText('Pass · Readable')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();

    window.history.pushState({}, '', '/admin/upload?mock=1');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
    const form = onReady.mock.calls[0][0] as FormVersion;
    expect(form.formId).toBe(PLACEHOLDER_FORM_ID);
    expect(form.fields).toHaveLength(12);
    expect(form.status).toBe('draft');
    expect(onReady.mock.calls[0][1]).toHaveLength(2);
  });

  it('says the agent is checking the form while ingest runs', async () => {
    const user = userEvent.setup();
    let finish: (form: FormVersion) => void = () => undefined;
    const ingest = vi.fn(() => new Promise<FormVersion>((resolve) => {
      finish = resolve;
    }));
    const onReady = vi.fn();
    render(<UploadPage mock ingest={ingest} onReady={onReady} />);
    await user.click(screen.getByRole('button', { name: 'Use a 2-page placeholder PDF' }));
    await screen.findByText('Fillable');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByRole('button', { name: 'Reading and checking…' })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent(/an agent checks each box against the page/);
    finish({ formId: 'f', version: 'v1', bankId: 'b', journey: 'j', status: 'draft', source: 'ocr', pdfPath: 'p', fields: [] });
    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
  });
});
