/**
 * PAN photo vs spoken values. Pure: no image bytes, no storage.
 * Fill only applicant_full_name, dob, and pan_number.
 */

export const PAN_DOC_IDS = ['applicant_full_name', 'dob', 'pan_number'] as const;
export type PanDocId = (typeof PAN_DOC_IDS)[number];

/** Existing Check-this reason when a spoken value disagrees with the PAN card. */
export const PAN_MISMATCH_REASON = "Doesn't match PAN";

export type PanDocValues = Partial<Record<PanDocId, string>>;

const MONTHS: Record<string, string> = {
  january: '01',
  jan: '01',
  february: '02',
  feb: '02',
  march: '03',
  mar: '03',
  april: '04',
  apr: '04',
  may: '05',
  june: '06',
  jun: '06',
  july: '07',
  jul: '07',
  august: '08',
  aug: '08',
  september: '09',
  sep: '09',
  sept: '09',
  october: '10',
  oct: '10',
  november: '11',
  nov: '11',
  december: '12',
  dec: '12',
};

function validDate(year: string, month: string, day: string): string | null {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
  if (y < 1900 || y > 2100) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

/** ISO date when the text is a real calendar date; otherwise null. */
export function canonicalDob(value: string): string | null {
  const text = value.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (iso) return validDate(iso[1], iso[2], iso[3]);
  const slash = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/.exec(text);
  if (slash) return validDate(slash[3], slash[2], slash[1]);
  const named = /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/.exec(text);
  if (named) {
    const month = MONTHS[named[2].toLowerCase()];
    if (!month) return null;
    return validDate(named[3], month, named[1]);
  }
  return null;
}

export function canonicalPanValue(id: PanDocId, value: string): string {
  if (id === 'pan_number') return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (id === 'dob') {
    const iso = canonicalDob(value);
    return iso ?? value.trim().replace(/\s+/g, ' ').toLowerCase();
  }
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function panValuesMatch(id: PanDocId, spoken: string, fromPan: string): boolean {
  const a = canonicalPanValue(id, spoken);
  const b = canonicalPanValue(id, fromPan);
  return a.length > 0 && a === b;
}

/** Value stored on the draft: uppercase PAN, ISO date, trimmed name. */
export function displayPanValue(id: PanDocId, value: string): string {
  if (id === 'pan_number') return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (id === 'dob') return canonicalDob(value) ?? value.trim();
  return value.trim().replace(/\s+/g, ' ');
}

export interface PanApplyDecision {
  /** Empty fields (or earlier document fills) to write. Spoken values are omitted. */
  fill: PanDocValues;
  fromDocument: PanDocId[];
  /** Spoken values that disagree with the card. */
  conflicts: PanDocId[];
  /** Spoken values that agree. No Check-this flag. */
  matches: PanDocId[];
}

function spokenText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text ? text : null;
}

/**
 * Never overwrite a value the user already spoke (or typed).
 * Fields still marked from a previous PAN photo may be replaced by a new photo.
 */
export function decidePanApply(
  current: Record<string, unknown>,
  extracted: PanDocValues,
  fromDocument: ReadonlySet<string>,
): PanApplyDecision {
  const fill: PanDocValues = {};
  const nowFromDoc: PanDocId[] = [];
  const conflicts: PanDocId[] = [];
  const matches: PanDocId[] = [];
  for (const id of PAN_DOC_IDS) {
    const raw = extracted[id];
    if (!raw || !raw.trim()) continue;
    const stored = displayPanValue(id, raw);
    if (!stored) continue;
    const currentText = spokenText(current[id]);
    const userOwned = currentText !== null && !fromDocument.has(id);
    if (!userOwned) {
      fill[id] = stored;
      nowFromDoc.push(id);
      continue;
    }
    if (panValuesMatch(id, currentText, stored)) matches.push(id);
    else conflicts.push(id);
  }
  return { fill, fromDocument: nowFromDoc, conflicts, matches };
}

/** A later utterance checked against the PAN values read in this session. */
export function speechAgainstPan(
  updates: Record<string, unknown>,
  snapshot: PanDocValues,
): { conflicts: PanDocId[]; matches: PanDocId[] } {
  const conflicts: PanDocId[] = [];
  const matches: PanDocId[] = [];
  for (const id of PAN_DOC_IDS) {
    const pan = snapshot[id];
    const next = updates[id];
    if (!pan || typeof next !== 'string' || !next.trim()) continue;
    if (panValuesMatch(id, next, pan)) matches.push(id);
    else conflicts.push(id);
  }
  return { conflicts, matches };
}

export function panResultNote(
  decision: PanApplyDecision,
  hindi: boolean,
): string {
  const filled = decision.fromDocument.length > 0;
  const conflicts = decision.conflicts.length > 0;
  if (hindi) {
    if (filled && conflicts) {
      return 'खाली फ़ील्ड दस्तावेज़ से भरे गए। जो पैन से नहीं मिलते उन्हें जाँचें। Fields vary by bank.';
    }
    if (conflicts) {
      return 'बोले गए मान रखे गए। जो पैन से नहीं मिलते उन्हें जाँचें। Fields vary by bank.';
    }
    return 'नाम, जन्म तिथि और पैन दस्तावेज़ से भरे गए। Fields vary by bank.';
  }
  if (filled && conflicts) {
    return "Filled the empty fields from the document. Check the ones that don't match the PAN. Fields vary by bank.";
  }
  if (conflicts) {
    return "Kept what you already said. Check the fields that don't match the PAN. Fields vary by bank.";
  }
  return 'Filled name, date of birth, and PAN from the document. Fields vary by bank.';
}
