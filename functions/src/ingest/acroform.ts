import {
  PDFButton,
  PDFCheckBox,
  PDFDocument,
  PDFDropdown,
  PDFHexString,
  PDFName,
  PDFOptionList,
  PDFRadioGroup,
  PDFSignature,
  PDFString,
  PDFTextField,
  type PDFField,
  type PDFWidgetAnnotation,
} from 'pdf-lib';
import type { FieldRecord } from '../../../shared/forms/types';
import { libraryById, type LibraryField } from './fieldLibrary';
import { roundPt } from './geom';
import { customId, matchLibrary } from './match';

export type LoadedPdf = {
  doc: PDFDocument;
  pageCount: number;
  pageSize: (page: number) => { width: number; height: number };
};

export async function loadPdf(bytes: Uint8Array): Promise<LoadedPdf> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: false, updateMetadata: false });
  const pageCount = doc.getPageCount();
  return {
    doc,
    pageCount,
    pageSize(page: number) {
      const pdfPage = doc.getPage(page - 1);
      return { width: pdfPage.getWidth(), height: pdfPage.getHeight() };
    },
  };
}

type WidgetKind = 'text' | 'checkbox' | 'choice';

function widgetKind(field: PDFField): WidgetKind | 'skip' {
  if (field instanceof PDFSignature || field instanceof PDFButton) return 'skip';
  if (field instanceof PDFCheckBox) return 'checkbox';
  if (field instanceof PDFDropdown || field instanceof PDFRadioGroup || field instanceof PDFOptionList) return 'choice';
  if (field instanceof PDFTextField) return 'text';
  return 'text';
}

function userLabel(field: PDFField): string | undefined {
  const raw = field.acroField.dict.get(PDFName.of('TU'));
  if (raw instanceof PDFString || raw instanceof PDFHexString) {
    const text = raw.decodeText().trim();
    return text || undefined;
  }
  return undefined;
}

function pdfOptions(field: PDFField): string[] | undefined {
  if (field instanceof PDFDropdown || field instanceof PDFOptionList || field instanceof PDFRadioGroup) {
    const options = field.getOptions().map((option) => option.trim()).filter(Boolean);
    return options.length ? options : undefined;
  }
  return undefined;
}

function widgetPage(doc: PDFDocument, widget: PDFWidgetAnnotation): number {
  const pages = doc.getPages();
  const pageRef = widget.P();
  if (pageRef) {
    const key = pageRef.toString();
    for (let i = 0; i < pages.length; i += 1) {
      if (pages[i].ref.toString() === key) return i + 1;
    }
  }
  return 1;
}

function prettifyName(name: string): string {
  const leaf = name.split('.').pop() || name;
  if (leaf.includes('_') && !/\s/.test(leaf)) return leaf.replace(/_/g, ' ');
  return leaf;
}

function fieldType(kind: WidgetKind, entry: LibraryField | null): FieldRecord['type'] {
  if (kind === 'checkbox') return 'checkbox';
  if (kind === 'choice') return 'choice';
  return entry?.type ?? 'text';
}

/**
 * Read AcroForm names, types, and widget rectangles.
 * Returns an empty list when the PDF has no fillable data fields (flat scan).
 */
export function readAcroFormFields(doc: PDFDocument): FieldRecord[] {
  const form = doc.getForm();
  const used = new Set<string>();
  const records: FieldRecord[] = [];
  for (const field of form.getFields()) {
    const kind = widgetKind(field);
    if (kind === 'skip') continue;
    const widgets = field.acroField.getWidgets();
    if (widgets.length === 0) continue;
    const pdfName = field.getName();
    const printed = userLabel(field);
    const queries = [printed, pdfName].filter((value): value is string => Boolean(value && value.trim()));
    let best = matchLibrary(queries[0] || pdfName, used);
    for (const query of queries.slice(1)) {
      const hit = matchLibrary(query, used);
      if (hit.score > best.score) best = hit;
    }
    const entry = best.entry;
    const id = entry ? entry.id : customId(printed || pdfName, used);
    if (entry) used.add(entry.id);
    const library = entry ?? libraryById(id);
    const type = fieldType(kind, library ?? null);
    const widgetOptions = kind === 'choice' ? pdfOptions(field) : undefined;
    const options = widgetOptions ?? library?.options;
    let maxChars = library?.maxChars;
    if (field instanceof PDFTextField) {
      const pdfMax = field.getMaxLength();
      if (typeof pdfMax === 'number' && pdfMax > 0) maxChars = pdfMax;
    }
    const label = printed || library?.label || prettifyName(pdfName);
    for (const widget of widgets) {
      const rect = widget.getRectangle();
      records.push({
        id,
        label,
        type,
        ...(options && options.length ? { options: [...options] } : {}),
        ...(library?.partial ? { partial: library.partial } : {}),
        required: field.isRequired() || Boolean(library?.required),
        pii: library ? library.pii : true,
        ...(library?.section ? { section: library.section } : {}),
        order: 0,
        confidence: best.score,
        checked: false,
        page: widgetPage(doc, widget),
        box: {
          x: roundPt(rect.x),
          y: roundPt(rect.y),
          w: roundPt(rect.width),
          h: roundPt(rect.height),
        },
        pdfField: pdfName,
        ...(typeof maxChars === 'number' ? { maxChars } : {}),
      });
    }
  }
  return records;
}
