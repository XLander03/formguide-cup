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
import { customId, matchLibrary, type LibraryMatch } from './match';
import { findPrintedLabels } from './printedLabel';
import type { PageText, UnitBox } from './textLayer';

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

const compact = (value: string) => value.toLowerCase().replace(/\[\d+\]/g, '').replace(/[^a-z0-9]/g, '');

function userLabel(field: PDFField): string | undefined {
  const raw = field.acroField.dict.get(PDFName.of('TU'));
  if (raw instanceof PDFString || raw instanceof PDFHexString) {
    const text = raw.decodeText().trim();
    return text || undefined;
  }
  return undefined;
}

/**
 * Designer tools often copy the field name into /TU ("per_in_cust_mobile"); such a
 * tooltip says no more than the name, so the printed label is preferred over it.
 */
function nameLike(tooltip: string, pdfName: string): boolean {
  const leaf = pdfName.split('.').pop() || '';
  return compact(tooltip) === compact(leaf) || /^\S*_\S*$/.test(tooltip);
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

/** Widget rectangle as a unit box, top-left origin, in the frame of the page's text layer. */
function unitBox(doc: PDFDocument, page: number, widget: PDFWidgetAnnotation): UnitBox | null {
  const pdfPage = doc.getPage(page - 1);
  // A rotated page's text layer is in another frame; its labels are not read.
  if (pdfPage.getRotation().angle % 360 !== 0) return null;
  const crop = pdfPage.getCropBox();
  if (crop.width <= 0 || crop.height <= 0) return null;
  const rect = widget.getRectangle();
  return {
    x: (rect.x - crop.x) / crop.width,
    y: (crop.y + crop.height - (rect.y + rect.height)) / crop.height,
    w: rect.width / crop.width,
    h: rect.height / crop.height,
  };
}

/** A name match this strong holds its id against printed labels elsewhere on the form. */
const NAME_RESERVES = 0.9;

type FieldWidgets = {
  field: PDFField;
  kind: WidgetKind;
  widgets: { widget: PDFWidgetAnnotation; page: number }[];
};

/**
 * The label printed beside each field (its first widget that has one), read from
 * the page text layers. Every widget on a page, tooltip or not, blocks the search.
 */
function printedLabels(
  doc: PDFDocument,
  fields: FieldWidgets[],
  pageTexts: readonly (PageText | undefined)[],
): Map<PDFField, string> {
  const out = new Map<PDFField, string>();
  const byPage = new Map<number, { field: PDFField; box: UnitBox; checkbox: boolean }[]>();
  for (const { field, kind, widgets } of fields) {
    for (const { widget, page } of widgets) {
      if (!pageTexts[page - 1]) continue;
      const box = unitBox(doc, page, widget);
      if (!box) continue;
      const list = byPage.get(page) ?? [];
      list.push({ field, box, checkbox: kind === 'checkbox' });
      byPage.set(page, list);
    }
  }
  for (const [page, list] of byPage) {
    const labels = findPrintedLabels(list, pageTexts[page - 1]);
    list.forEach((item, i) => {
      const label = labels[i];
      if (label && !out.has(item.field)) out.set(item.field, label);
    });
  }
  return out;
}

/**
 * Read AcroForm names, types, and widget rectangles.
 * Returns an empty list when the PDF has no fillable data fields (flat scan).
 * `pageTexts` (each page's text layer, by page index) give a field without a /TU
 * tooltip its printed label; without them the internal name stands in.
 */
export function readAcroFormFields(doc: PDFDocument, pageTexts: readonly (PageText | undefined)[] = []): FieldRecord[] {
  const form = doc.getForm();
  const used = new Set<string>();
  const records: FieldRecord[] = [];
  const fields: FieldWidgets[] = [];
  for (const field of form.getFields()) {
    const kind = widgetKind(field);
    if (kind === 'skip') continue;
    const widgets = field.acroField.getWidgets();
    if (widgets.length === 0) continue;
    fields.push({ field, kind, widgets: widgets.map((widget) => ({ widget, page: widgetPage(doc, widget) })) });
  }
  const onPage = printedLabels(doc, fields, pageTexts);
  const nameOf = (field: PDFField) => {
    const tooltip = userLabel(field);
    return tooltip && nameLike(tooltip, field.getName()) ? tooltip : undefined;
  };
  // A field whose own name matches an id outright keeps it: a bare printed "PIN Code"
  // in another address block must not take addr_permanent_pin from `permanent_pin_code`.
  const reserved = new Map<PDFField, string>();
  if (onPage.size) {
    const taken = new Set<string>();
    for (const { field, kind } of fields) {
      for (const query of [nameOf(field), field.getName()]) {
        const hit = query ? matchLibrary(query, undefined, { type: kind }) : undefined;
        if (!hit?.claim || hit.score < NAME_RESERVES || taken.has(hit.claim)) continue;
        reserved.set(field, hit.claim);
        taken.add(hit.claim);
        break;
      }
    }
  }
  for (const { field, kind, widgets } of fields) {
    const pdfName = field.getName();
    const tooltip = userLabel(field);
    const named = nameOf(field);
    // A real tooltip, else the label printed beside the box on the page.
    const pageLabel = tooltip && !named ? undefined : onPage.get(field);
    const printed = (tooltip && !named ? tooltip : undefined) ?? pageLabel;
    // Scored on the printed label and on the internal name; the better match wins.
    const queries = [printed, named, pdfName].filter((value): value is string => Boolean(value && value.trim()));
    let best: LibraryMatch | undefined;
    for (const query of queries) {
      const blocked = query === pageLabel && reserved.size
        ? new Set([...used, ...[...reserved].filter(([other]) => other !== field).map(([, claim]) => claim)])
        : used;
      const hit = matchLibrary(query, blocked, { type: kind });
      // A yes/no id in a text box ("PAN" -> "Do you have a PAN?") is taken on the
      // field's own name (an AcroForm "PEP" text widget), never on nearby page text.
      if (query === pageLabel && kind === 'text' && hit.entry?.type === 'checkbox') continue;
      if (!best || hit.score > best.score) best = hit;
    }
    best ??= matchLibrary(pdfName, used, { type: kind });
    const entry = best.entry;
    const id = entry ? entry.id : customId(printed || named || pdfName, used);
    if (best.claim) used.add(best.claim);
    const library = entry ?? libraryById(id);
    const type = fieldType(kind, library ?? null);
    const widgetOptions = kind === 'choice' ? pdfOptions(field) : undefined;
    const options = widgetOptions ?? library?.options;
    let maxChars = library?.maxChars;
    if (field instanceof PDFTextField) {
      const pdfMax = field.getMaxLength();
      if (typeof pdfMax === 'number' && pdfMax > 0) maxChars = pdfMax;
    }
    const label = printed || library?.label || prettifyName(named || pdfName);
    for (const { widget, page } of widgets) {
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
        page,
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
