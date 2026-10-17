import { AUTO_ACCEPT_ABOVE, withAutoAccept } from '../../../shared/forms/review';
import type { FieldRecord, FormVersion } from '../../../shared/forms/types';
import { readAcroFormFields, loadPdf } from './acroform';
import { IngestError, MAX_PDF_BYTES, MAX_PDF_PAGES } from './errors';
import type { OcrField, OcrPageInput } from './geminiOcr';
import { assignOrder, normalisedTopLeftToPdfBox, roundPt } from './geom';
import { customId, matchLibrary, roundScore } from './match';
import { renderPdfPages, type RenderedPage } from './render';
import { placePageFields } from './snap';
import type { PageText } from './textLayer';

export type OcrPageFn = (input: OcrPageInput) => Promise<OcrField[]>;

export type IngestDraft = {
  source: FormVersion['source'];
  fields: FieldRecord[];
  pageCount: number;
  pages: RenderedPage[];
};

function clampConfidence(value: number): number {
  return roundScore(value);
}

function recordsFromOcr(
  found: OcrField[],
  page: number,
  pageWidth: number,
  pageHeight: number,
  used: Set<string>,
  text?: PageText,
): FieldRecord[] {
  const records: FieldRecord[] = [];
  // Snapped to the page's own text layer when it has one (see snap.ts).
  const placements = placePageFields(found, text);
  for (const [index, raw] of found.entries()) {
    const placed = placements[index];
    if (!placed) continue;
    const box = normalisedTopLeftToPdfBox(placed.box, pageWidth, pageHeight);
    if (!box) continue;
    const hit = matchLibrary(raw.label, used);
    const entry = hit.entry;
    const id = entry ? entry.id : customId(raw.label, used);
    if (entry) used.add(entry.id);
    const modelType = raw.type;
    const type = entry
      ? (modelType === 'checkbox' || modelType === 'choice' ? modelType : entry.type)
      : modelType;
    const options = type === 'choice' ? (raw.options?.length ? raw.options : entry?.options) : entry?.options;
    records.push({
      id,
      label: raw.label,
      type,
      ...(options && options.length ? { options: [...options] } : {}),
      ...(entry?.partial ? { partial: entry.partial } : raw.partial ? { partial: raw.partial } : {}),
      required: entry ? entry.required : raw.required,
      pii: entry ? entry.pii : true,
      ...(entry?.section ? { section: entry.section } : raw.section ? { section: raw.section } : {}),
      order: 0,
      // A doubtful placement never auto-accepts: it waits at or below the review line.
      confidence: clampConfidence(placed.doubtful ? Math.min(raw.confidence, AUTO_ACCEPT_ABOVE) : raw.confidence),
      checked: false,
      page,
      box: {
        x: roundPt(box.x),
        y: roundPt(box.y),
        w: roundPt(box.w),
        h: roundPt(box.h),
      },
      ...(typeof entry?.maxChars === 'number' ? { maxChars: entry.maxChars } : {}),
    });
  }
  return records;
}

/**
 * Parse a PDF and produce draft fields. Fields above AUTO_ACCEPT_ABOVE come back checked. AcroForm PDFs never call `ocrPage`.
 * Flat PDFs call it once per page, in order.
 */
export async function draftFromPdf(bytes: Uint8Array, ocrPage: OcrPageFn): Promise<IngestDraft> {
  if (bytes.byteLength === 0) throw new IngestError('pdf_empty', 400);
  if (bytes.byteLength > MAX_PDF_BYTES) throw new IngestError('pdf_too_large', 400);
  let loaded: Awaited<ReturnType<typeof loadPdf>>;
  try {
    loaded = await loadPdf(bytes);
  } catch {
    throw new IngestError('pdf_unreadable', 400);
  }
  if (loaded.pageCount < 1) throw new IngestError('pdf_empty', 400);
  if (loaded.pageCount > MAX_PDF_PAGES) throw new IngestError('pdf_too_many_pages', 400);

  const acro = readAcroFormFields(loaded.doc);
  let pages: RenderedPage[];
  try {
    pages = await renderPdfPages(bytes);
  } catch {
    throw new IngestError('pdf_render_failed', 400);
  }
  if (pages.length !== loaded.pageCount) throw new IngestError('pdf_render_failed', 400);

  if (acro.length > 0) {
    return {
      source: 'acroform',
      fields: withAutoAccept(assignOrder(acro)),
      pageCount: loaded.pageCount,
      pages,
    };
  }

  const used = new Set<string>();
  const fields: FieldRecord[] = [];
  for (const page of pages) {
    const size = loaded.pageSize(page.page);
    const found = await ocrPage({
      png: page.png,
      page: page.page,
      pageCount: loaded.pageCount,
      width: page.width,
      height: page.height,
    });
    fields.push(...recordsFromOcr(found, page.page, size.width, size.height, used, page.text));
  }
  return {
    source: 'ocr',
    fields: withAutoAccept(assignOrder(fields)),
    pageCount: loaded.pageCount,
    pages,
  };
}

export function buildFormVersion(input: {
  formId: string;
  version: string;
  bankId: string;
  journey: string;
  source: FormVersion['source'];
  pdfPath: string;
  fields: FieldRecord[];
}): FormVersion {
  return {
    formId: input.formId,
    version: input.version,
    bankId: input.bankId,
    journey: input.journey,
    status: 'draft',
    source: input.source,
    pdfPath: input.pdfPath,
    fields: input.fields,
  };
}
