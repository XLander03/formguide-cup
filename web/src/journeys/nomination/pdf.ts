import { confidenceFlag } from '../confidence';
import {
  NOMINATION_SCHEMA,
  isNominationFilled,
  nominationField,
} from './schema';
import type { FormValues } from '../../lib/types';

function pdfEscape(text: string): string {
  let out = '';
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if (ch === '\\' || ch === '(' || ch === ')') out += `\\${ch}`;
    else if (code === 0x00b7) out += '\\267';
    else if (code >= 32 && code <= 126) out += ch;
    else if (code >= 160 && code <= 255) out += `\\${code.toString(8).padStart(3, '0')}`;
    else out += '?';
  }
  return out;
}

function wrap(line: string, width = 86): string[] {
  if (line.length <= width) return [line];
  const rows: string[] = [];
  let rest = line;
  while (rest.length > width) {
    let cut = rest.lastIndexOf(' ', width);
    if (cut < 16) cut = width;
    rows.push(rest.slice(0, cut));
    rest = rest.slice(cut).trimStart();
  }
  if (rest) rows.push(rest);
  return rows;
}

function display(id: string, value: FormValues[string]): string {
  if (value === true) return 'Yes';
  if (value === false) return 'No';
  if (typeof value !== 'string') return '';
  return value.replace(/_/g, ' ');
}

export function nominationPdfLines(
  values: FormValues,
  confidence: Record<string, number | { confidence: number; reason?: string }>,
): string[] {
  const lines = [
    'Nomination',
    'Add or change nominee for a savings account',
    'DRAFT · NOT SUBMITTED',
    'Fields vary by bank. This draft was not submitted to a bank.',
    '',
  ];
  for (const field of NOMINATION_SCHEMA.fields) {
    if (field.group === 'confirm_gates') continue;
    if (!isNominationFilled(values[field.id])) continue;
    const flag = confidenceFlag(confidence[field.id]);
    const suffix = flag ? `  (${flag.text})` : '';
    const label = nominationField(field.id)?.label_en ?? field.label_en;
    lines.push(...wrap(`${label}: ${display(field.id, values[field.id])}${suffix}`));
  }
  lines.push('');
  lines.push('Schema nomination_savings_demo_v1');
  lines.push('DRAFT · NOT SUBMITTED');
  return lines;
}

/** Single-page draft PDF. Helvetica only, so non-Latin glyphs are omitted from the file. */
export function buildNominationPdf(
  values: FormValues,
  confidence: Record<string, number | { confidence: number; reason?: string }>,
): Blob {
  const commands = ['BT', '72 750 Td', '14 TL'];
  nominationPdfLines(values, confidence).forEach((line, index) => {
    const title = index === 0;
    const banner = line.startsWith('DRAFT');
    commands.push(title ? '/F1 18 Tf' : banner ? '/F1 13 Tf' : '/F1 11 Tf');
    if (index > 0) commands.push('T*');
    commands.push(`(${pdfEscape(line)}) Tj`);
  });
  commands.push('ET');
  const stream = commands.join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let body = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n`;
  body += '0000000000 65535 f \n';
  for (let index = 1; index <= objects.length; index += 1) {
    body += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
  }
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Blob([body], { type: 'application/pdf' });
}
