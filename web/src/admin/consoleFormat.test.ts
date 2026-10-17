import { describe, expect, it } from 'vitest';
import { badgeLabel, journeyLabel, relativeTime, sourceLabel, versionSummary } from './consoleFormat';

const NOW = Date.parse('2026-10-17T12:00:00Z');

describe('console formatting', () => {
  it('shows relative time, or a dash when unknown', () => {
    expect(relativeTime(null, NOW)).toBe('—');
    expect(relativeTime('not a date', NOW)).toBe('—');
    expect(relativeTime('2026-10-17T11:59:30Z', NOW)).toBe('just now');
    expect(relativeTime('2026-10-17T11:45:00Z', NOW)).toBe('15 min ago');
    expect(relativeTime('2026-10-17T09:00:00Z', NOW)).toBe('3 h ago');
    expect(relativeTime('2026-10-16T12:00:00Z', NOW)).toBe('1 day ago');
    expect(relativeTime('2026-10-12T12:00:00Z', NOW)).toBe('5 days ago');
  });

  it('labels journeys and sources for people', () => {
    expect(journeyLabel('kyc_update')).toBe('KYC update');
    expect(journeyLabel('nominee_change')).toBe('Nominee change');
    expect(sourceLabel('acroform')).toBe('Fillable PDF');
    expect(sourceLabel('ocr')).toBe('OCR');
  });

  it('sums a version up in one line and leaves out an unknown update time', () => {
    const row = {
      formId: 'f',
      version: 'v1',
      bankId: 'Axis',
      journey: 'account_opening',
      status: 'draft' as const,
      source: 'ocr' as const,
      fieldCount: 262,
      sharedCount: 23,
      needsReview: 0,
      updatedAt: '2026-10-17T11:55:00Z',
    };
    expect(versionSummary(row, NOW)).toBe('OCR · 262 fields · 23 filled by voice · updated 5 min ago');
    expect(versionSummary({ ...row, updatedAt: null }, NOW)).toBe('OCR · 262 fields · 23 filled by voice');
    expect(badgeLabel('published')).toBe('Live');
  });
});
