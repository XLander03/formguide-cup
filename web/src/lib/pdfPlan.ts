import { HDFC_V1, boundFields } from '../forms/hdfcV1';
import type { FormVersion, PdfWrite } from '../forms/types';
import type { FormValues } from './types';

const GENDER_LABEL: Record<string, string> = {
  female: 'Female',
  male: 'Male',
  other: 'Other',
  prefer_not_to_say: 'Other',
};

export type PdfOp = { name: string; op: 'text'; value: string } | { name: string; op: 'check' };

function isoToDmy(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : iso;
}

function lastFourDigits(value: string): string | null {
  const match = /(\d{4})\D*$/.exec(value);
  return match ? match[1] : null;
}

function whenMatches(values: FormValues, when: Record<string, string | boolean>): boolean {
  return Object.entries(when).every(([key, expect]) => values[key] === expect);
}

function renderText(values: FormValues, write: PdfWrite, today: Date): string {
  if (write.transform === 'today') {
    return `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;
  }
  const raw = write.source ? values[write.source] : undefined;
  if (typeof raw !== 'string' || !raw) return '';
  if (write.transform === 'dmy') return isoToDmy(raw);
  if (write.transform === 'pan') return raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (write.transform === 'gender') return GENDER_LABEL[raw] ?? raw;
  if (write.transform === 'digit') {
    const last4 = lastFourDigits(raw);
    if (!last4) return '';
    return last4[write.digitIndex ?? 0] ?? '';
  }
  return raw;
}

function shouldCheck(values: FormValues, write: PdfWrite): boolean {
  if (write.when && !whenMatches(values, write.when)) return false;
  const raw = write.source ? values[write.source] : undefined;
  if (write.whenTrue) return raw === true;
  if (write.equalsAny) return write.equalsAny.some((value) => raw === value);
  if (write.equals !== undefined) return raw === write.equals;
  return false;
}

/** Widget writes implied by the active FormVersion. Empty text is omitted, matching safeSetText. */
export function planPdfOps(values: FormValues, today: Date, form: FormVersion = HDFC_V1): PdfOp[] {
  const ops: PdfOp[] = [];
  for (const field of boundFields(form)) {
    for (const write of field.writes ?? []) {
      if (write.when && !whenMatches(values, write.when)) continue;
      if (write.op === 'check') {
        if (shouldCheck(values, write)) ops.push({ name: write.pdfField, op: 'check' });
        continue;
      }
      const value = renderText(values, write, today);
      if (value) ops.push({ name: write.pdfField, op: 'text', value });
    }
  }
  return ops;
}

export function planPdfFieldMap(
  values: FormValues,
  today: Date,
  form: FormVersion = HDFC_V1,
): Record<string, string | true> {
  const out: Record<string, string | true> = {};
  for (const op of planPdfOps(values, today, form)) {
    out[op.name] = op.op === 'check' ? true : op.value;
  }
  return out;
}
