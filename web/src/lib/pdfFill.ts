import { PDFDocument, PDFForm, StandardFonts, degrees, rgb } from 'pdf-lib';
import { planPdfOps } from './pdfPlan';
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

export async function drawDraftWatermark(pdfDoc: PDFDocument): Promise<void> {
  const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  for (const page of pdfDoc.getPages()) {
    const { width, height } = page.getSize();
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
  }
}

export async function buildFilledKycPdf(values: FormValues): Promise<Blob> {
  const bytes = await fetch(TEMPLATE_URL).then((r) => r.arrayBuffer());
  const pdfDoc = await PDFDocument.load(bytes);
  const form = pdfDoc.getForm();

  applyFieldMappings(form, values);

  try {
    form.flatten();
  } catch {
    // Some widget/appearance quirk on this real-world PDF — ship the
    // filled-but-unflattened document rather than failing the download.
  }

  await drawDraftWatermark(pdfDoc);

  const outBytes = await pdfDoc.save();
  // pdf-lib's Uint8Array type doesn't line up with the stricter BlobPart
  // typing in newer TS DOM libs (SharedArrayBuffer vs ArrayBuffer) — Blob
  // accepts a Uint8Array fine at runtime, so this is a typing-only cast.
  return new Blob([outBytes as unknown as BlobPart], { type: 'application/pdf' });
}
