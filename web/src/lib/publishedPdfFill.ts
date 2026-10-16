import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFForm } from 'pdf-lib';
import { isBundledForm } from '../forms/activeForm';
import type { FieldRecord, FormVersion, PdfBox } from '../forms/types';
import { buildFilledKycPdf, drawDraftWatermark } from './pdfFill';
import type { FormValues } from './types';

/**
 * Fills a published Firestore form on the bank's own PDF. OCR forms have no widgets,
 * so each value is drawn inside the field box the admin reviewed. AcroForm fields with
 * a widget name are set on the widget, and fall back to the box if the widget is missing.
 */

export type BoxWrite =
  | { id: string; page: number; box: PdfBox; pdfField?: string; kind: 'text'; text: string }
  | { id: string; page: number; box: PdfBox; pdfField?: string; kind: 'check' };

function isoToDmy(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

function boxText(value: FormValues[string]): string {
  if (value === true) return 'Yes';
  if (value === false) return 'No';
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  // Schema enum values (passport, regular_savings) print as words.
  if (/^[a-z][a-z0-9]*(_[a-z0-9]+)+$/.test(trimmed)) return trimmed.replace(/_/g, ' ');
  return isoToDmy(trimmed);
}

function hasBox(field: FieldRecord): boolean {
  return field.page >= 1 && field.box.w > 0 && field.box.h > 0;
}

/** Writes implied by the current values. A checkbox is only ever ticked, never written into. */
export function planBoxWrites(form: FormVersion, values: FormValues): BoxWrite[] {
  const writes: BoxWrite[] = [];
  for (const field of form.fields) {
    if (!hasBox(field) && !field.pdfField) continue;
    const value = values[field.id];
    const base = { id: field.id, page: field.page, box: field.box, pdfField: field.pdfField };
    if (field.type === 'checkbox') {
      if (value === true) writes.push({ ...base, kind: 'check' });
      continue;
    }
    const text = boxText(value);
    if (text) writes.push({ ...base, kind: 'text', text });
  }
  return writes;
}

function fitSize(font: PDFFont, text: string, box: PdfBox): number {
  let size = Math.max(5, Math.min(10, box.h * 0.75));
  while (size > 5 && font.widthOfTextAtSize(text, size) > box.w - 3) size -= 0.5;
  return size;
}

function trySetWidget(form: PDFForm, write: BoxWrite): boolean {
  if (!write.pdfField) return false;
  try {
    if (write.kind === 'check') form.getCheckBox(write.pdfField).check();
    else form.getTextField(write.pdfField).setText(write.text);
    return true;
  } catch {
    return false;
  }
}

export async function fillPublishedPdf(bytes: ArrayBuffer, form: FormVersion, values: FormValues): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const pages = pdfDoc.getPages();
  const acro = pdfDoc.getForm();
  const ink = rgb(0.05, 0.1, 0.45);
  for (const write of planBoxWrites(form, values)) {
    if (trySetWidget(acro, write)) continue;
    const page = pages[write.page - 1];
    if (!page || write.box.w <= 0) continue;
    const { x, y, w, h } = write.box;
    if (write.kind === 'check') {
      const size = Math.max(6, Math.min(12, Math.min(w, h)));
      const markWidth = font.widthOfTextAtSize('X', size);
      page.drawText('X', { x: x + (w - markWidth) / 2, y: y + (h - size * 0.7) / 2, size, font, color: ink });
      continue;
    }
    const size = fitSize(font, write.text, write.box);
    page.drawText(write.text, { x: x + 2, y: y + Math.max(1, (h - size * 0.7) / 2), size, font, color: ink });
  }
  try {
    acro.flatten();
  } catch {
    // Same policy as the HDFC template: ship unflattened rather than fail the download.
  }
  await drawDraftWatermark(pdfDoc);
  return pdfDoc.save();
}

export function publishedPdfUrl(form: Pick<FormVersion, 'formId' | 'version'>): string {
  const query = new URLSearchParams({ formId: form.formId, version: form.version });
  return `/api/publishedFormPdf?${query.toString()}`;
}

/** Draft PDF for whichever form the session fills. */
export async function buildDraftPdf(form: FormVersion, values: FormValues): Promise<Blob> {
  if (isBundledForm(form)) return buildFilledKycPdf(values);
  const res = await fetch(publishedPdfUrl(form));
  if (!res.ok) throw new Error(`published_pdf_${res.status}`);
  const out = await fillPublishedPdf(await res.arrayBuffer(), form, values);
  return new Blob([out as unknown as BlobPart], { type: 'application/pdf' });
}
