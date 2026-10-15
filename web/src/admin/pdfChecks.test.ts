import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import {
  PDF_CHOOSE,
  PDF_MAX_BYTES,
  PDF_MAX_PAGES,
  PDF_NOT_READABLE,
  PDF_TOO_LARGE,
  PDF_TOO_MANY_PAGES,
  buildPlaceholderPdf,
  inspectPdf,
} from './pdfChecks';

async function fileFrom(doc: PDFDocument, name: string): Promise<File> {
  const bytes = await doc.save();
  return new File([Uint8Array.from(bytes).buffer as ArrayBuffer], name, { type: 'application/pdf' });
}

describe('inspectPdf', () => {
  it('stops a non-PDF with a plain reason', async () => {
    const result = await inspectPdf(new File(['hello'], 'notes.txt', { type: 'text/plain' }));
    expect(result.reason).toBe(PDF_CHOOSE);
    expect(result.rows.some((row) => row.state === 'fail')).toBe(true);
  });

  it('stops a file that is too large before parsing', async () => {
    const result = await inspectPdf(
      new File([new Uint8Array(PDF_MAX_BYTES + 1)], 'big.pdf', { type: 'application/pdf' }),
    );
    expect(result.reason).toBe(PDF_TOO_LARGE);
  });

  it('stops a file that does not parse', async () => {
    const result = await inspectPdf(new File(['%PDF-1.7 nope'], 'bad.pdf', { type: 'application/pdf' }));
    expect(result.reason).toBe(PDF_NOT_READABLE);
  });

  it('stops when the page cap is exceeded', async () => {
    const doc = await PDFDocument.create();
    for (let index = 0; index < PDF_MAX_PAGES + 1; index += 1) doc.addPage([200, 200]);
    const result = await inspectPdf(await fileFrom(doc, 'long.pdf'));
    expect(result.reason).toBe(PDF_TOO_MANY_PAGES);
  });

  it('passes a flat PDF and a fillable PDF', async () => {
    const flat = await PDFDocument.create();
    flat.addPage([595, 842]);
    const flatResult = await inspectPdf(await fileFrom(flat, 'flat.pdf'));
    expect(flatResult.reason).toBeNull();
    expect(flatResult.rows.find((row) => row.id === 'fillable')?.detail).toBe('Flat');
    expect(flatResult.fillable).toBe(false);

    const sample = await inspectPdf(await buildPlaceholderPdf());
    expect(sample.reason).toBeNull();
    expect(sample.pageCount).toBe(2);
    expect(sample.rows.find((row) => row.id === 'fillable')?.detail).toBe('Fillable');
    expect(sample.rows.find((row) => row.id === 'parses')?.state).toBe('pass');
    expect(sample.rows.find((row) => row.id === 'size')?.state).toBe('pass');
  });
});
