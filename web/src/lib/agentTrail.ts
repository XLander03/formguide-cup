import { CONFIDENCE_FLAG_THRESHOLD as UNSURE_BELOW, type FieldConfidence } from '../session/FormSession';
import type { ExtractResponse, FormValues } from './types';
import { detectUtteranceLang } from './utteranceLang';
import { fieldIssue } from './validate';

export type ChipTone = 'ai' | 'rules' | 'typed' | 'sample' | 'unsure';

/** Where a field's value came from, as the small label under it. Null when nothing filled it. */
export function sourceChip(
  source: string | undefined,
  confidence: FieldConfidence | undefined,
): { text: string; tone: ChipTone } | null {
  if (!source) return null;
  if (source === 'manual') return { text: '⌨ typed', tone: 'typed' };
  if (source === 'priya_demo') return { text: 'sample', tone: 'sample' };
  if (source === 'heuristic' || source === 'heuristic-dev') return { text: '≈ rules fill', tone: 'rules' };
  if (source !== 'gemini') return null;
  if (confidence?.confirmed) return { text: '✦ AI · you confirmed', tone: 'ai' };
  // The model omits a score when it is sure; only show a number it actually gave.
  if (!confidence || confidence.confidence >= 1) return { text: '✦ AI', tone: 'ai' };
  const pct = Math.round(confidence.confidence * 100);
  return { text: `✦ AI · ${pct}%`, tone: confidence.confidence < UNSURE_BELOW ? 'unsure' : 'ai' };
}

export type StepTone = 'ok' | 'warn' | 'info';

export interface TrailStep {
  key: string;
  text: string;
  tone: StepTone;
}

const SKIP = new Set(['journey_mode', 'preferred_language', 'account_product_intent']);

function list(names: string[]): string {
  if (names.length <= 1) return names.join('');
  if (names.length > 4) return `${names.slice(0, 3).join(', ')} and ${names.length - 3} more`;
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

const LANG_TEXT: Record<string, string> = {
  en: 'Heard English',
  hi: 'Heard Hindi',
  mixed: 'Heard a Hindi + English mix',
};

/**
 * What FormGuide did on the last turn, step by step: the language it heard, the fields it found,
 * the format checks on them, what it is unsure of, and what it asks next. Built only from the
 * turn's own response and the draft; nothing is invented for show.
 */
export function buildTrail(input: {
  last: ExtractResponse | null;
  said: string;
  values: FormValues;
  missing: string[];
  confidence: Record<string, FieldConfidence>;
  label: (id: string) => string;
  /** Label of the field asked next, or null when nothing required is left. */
  nextLabel: string | null;
  /** Sort key for found fields, so they are named in form order (on-screen fields first). */
  rank?: (id: string) => number;
}): TrailStep[] {
  const { last, said, values, missing, confidence, label, nextLabel, rank } = input;
  if (!last) return [];
  const steps: TrailStep[] = [];
  const lang = last.reply_lang ?? (said ? detectUtteranceLang(said) : null);
  if (lang && LANG_TEXT[lang]) steps.push({ key: 'lang', text: LANG_TEXT[lang], tone: 'info' });

  if (last.intent === 'question') {
    steps.push({ key: 'intent', text: 'You asked a question, so I answered it first', tone: 'info' });
  } else if (last.intent === 'correction') {
    steps.push({ key: 'intent', text: 'You corrected something, so I changed it', tone: 'info' });
  }

  const found = Object.entries(last.field_updates ?? {})
    .filter(([id, v]) => !SKIP.has(id) && v !== null && v !== undefined && v !== '')
    .map(([id]) => id);
  if (rank) found.sort((a, b) => rank(a) - rank(b));
  if (found.length > 0) {
    steps.push({ key: 'found', text: `Found ${list(found.map(label))}`, tone: 'ok' });
  } else if (last.intent !== 'question') {
    steps.push({ key: 'found', text: 'No new details in that answer', tone: 'warn' });
  }

  const checked = found.filter((id) => typeof values[id] === 'string');
  const bad = checked.filter((id) => fieldIssue(id, values[id]));
  const formatIds = checked.filter((id) => ['pan_number', 'mobile_registered', 'addr_current_pin', 'dob', 'email'].includes(id));
  const good = formatIds.filter((id) => !bad.includes(id));
  if (good.length > 0) steps.push({ key: 'format', text: `${list(good.map(label))} format ✓`, tone: 'ok' });
  for (const id of bad) steps.push({ key: `bad-${id}`, text: `${label(id)} doesn't look right: ${fieldIssue(id, values[id])}`, tone: 'warn' });

  const unsure = found.filter((id) => {
    const c = confidence[id];
    return c && !c.confirmed && c.confidence < UNSURE_BELOW;
  });
  if (unsure.length > 0) {
    steps.push({ key: 'unsure', text: `Not fully sure about ${list(unsure.map(label))}, so I'll ask you to check`, tone: 'warn' });
  }

  if (nextLabel) {
    const left = missing.length;
    steps.push({ key: 'next', text: `${left} required left → asking for ${nextLabel} next`, tone: 'info' });
  } else {
    steps.push({ key: 'next', text: 'Every required detail is in → ready to read it back', tone: 'ok' });
  }
  return steps;
}
