import { PDFDocument, PDFForm, StandardFonts, degrees, rgb } from 'pdf-lib';
import { planPdfOps } from './pdfPlan';
import { cardLast4, redactFullCardNumbers } from './debitReissue';
import type { FormValues } from './types';

/**
 * Fills the real HDFC Resident-Individual KYC form (from corpus/bank-forms,
 * copied into public/forms/ as a static asset) using its actual AcroForm
 * field names. We only ever write fields this app actually collects —
 * everything else on this real, complex form (income bands, business
 * nature, qualifications, bank-verification sections...) stays blank,
 * never invented. "Fields vary by bank" applies here too: this is one
 * bank's layout, used as a concrete demo artifact, not a universal form.
 */
const TEMPLATE_URL = '/forms/HDFC_KYC_Resident_Individual.pdf';
const GENDER_FIELD = 'txt_Self_Gender';
/** Printed in the top margin of every page of the filled HDFC KYC draft. */
export const HDFC_SAMPLE_LINE = "Sample based on HDFC's public KYC form · Fields vary by bank";

function safeSetText(form: PDFForm, name: string, value: string | undefined | null): void {
  if (!value) return;
  try {
    form.getTextField(name).setText(value);
  } catch {
    // Field missing or wrong widget type on this template — skip rather
    // than throw. We can't visually verify all 150+ fields on this form.
  }
}

function safeCheck(form: PDFForm, name: string | undefined): void {
  if (!name) return;
  try {
    form.getCheckBox(name).check();
  } catch {
    // Same defensive policy as safeSetText.
  }
}

function applyFieldMappings(form: PDFForm, values: FormValues, today = new Date()): void {
  for (const op of planPdfOps(values, today)) {
    if (op.op === 'check') safeCheck(form, op.name);
    else safeSetText(form, op.name, op.value);
  }
}

/**
 * `txt_Self_Gender` is the small M/F/T box (~13pt wide). The default size
 * clips "Female" to "Fer". Shrink the font until the whole word fits.
 */
async function fitGenderText(pdfDoc: PDFDocument, form: PDFForm): Promise<void> {
  let field;
  try {
    field = form.getTextField(GENDER_FIELD);
  } catch {
    return;
  }
  const value = field.getText();
  if (!value) return;
  const widget = field.acroField.getWidgets()[0];
  const inner = widget ? Math.max(1, widget.getRectangle().width - 2) : 10;
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  let size = Math.min(10, widget ? widget.getRectangle().height - 2 : 10);
  while (size > 1 && font.widthOfTextAtSize(value, size) > inner) size -= 0.25;
  field.setFontSize(Math.max(1, size));
}

export async function drawDraftWatermark(pdfDoc: PDFDocument, cardLastFour = '', sampleNote = false): Promise<void> {
  const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  for (const page of pdfDoc.getPages()) {
    const { width, height } = page.getSize();
    if (sampleNote) {
      // Top margin, clear of the form's own title and of the diagonal draft mark.
      page.drawText(HDFC_SAMPLE_LINE, {
        x: width * 0.06,
        y: height - 8,
        size: 6,
        font,
        color: rgb(0.4, 0.4, 0.4),
        opacity: 0.8,
      });
    }
    page.drawText('DRAFT - NOT SUBMITTED TO ANY BANK', {
      x: width * 0.08,
      y: height * 0.45,
      size: 22,
      font,
      color: rgb(0.8, 0.1, 0.1),
      rotate: degrees(35),
      opacity: 0.22,
    });
    page.drawText('Fields vary by bank. Prepared via FormGuide demo.', {
      x: width * 0.06,
      y: height * 0.03,
      size: 8,
      font,
      color: rgb(0.4, 0.4, 0.4),
      opacity: 0.8,
    });
    if (cardLastFour) {
      page.drawText(`Card last 4: ${cardLastFour}`, {
        x: width * 0.06,
        y: height * 0.05,
        size: 10,
        font,
        color: rgb(0.1, 0.1, 0.1),
        opacity: 0.9,
      });
    }
  }
}

/** Fills the HDFC KYC template and returns the draft PDF bytes. */
export async function fillHdfcKycPdf(template: ArrayBuffer | Uint8Array, values: FormValues): Promise<Uint8Array> {
  const safe = redactFullCardNumbers(values);
  const pdfDoc = await PDFDocument.load(template);
  const form = pdfDoc.getForm();

  applyFieldMappings(form, safe);
  await fitGenderText(pdfDoc, form);

  try {
    form.flatten();
  } catch {
    // Some widget/appearance quirk on this real-world PDF — ship the
    // filled-but-unflattened document rather than failing the download.
  }

  const last4 = typeof safe.card_last4 === 'string' ? cardLast4(safe.card_last4) : '';
  await drawDraftWatermark(pdfDoc, last4.length === 4 ? last4 : '', true);

  return pdfDoc.save();
}

export async function buildFilledKycPdf(values: FormValues): Promise<Blob> {
  const bytes = await fetch(TEMPLATE_URL).then((r) => r.arrayBuffer());
  const outBytes = await fillHdfcKycPdf(bytes, values);
  // pdf-lib's Uint8Array type doesn't line up with the stricter BlobPart
  // typing in newer TS DOM libs (SharedArrayBuffer vs ArrayBuffer) — Blob
  // accepts a Uint8Array fine at runtime, so this is a typing-only cast.
  return new Blob([outBytes as unknown as BlobPart], { type: 'application/pdf' });
}
