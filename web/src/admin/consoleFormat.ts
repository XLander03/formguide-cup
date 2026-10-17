import type { AdminFormRow } from '../../../shared/forms/admin';
import { JOURNEYS } from '../lib/journeys';

export function journeyLabel(journey: string): string {
  const known = JOURNEYS.find((item) => item.id === journey);
  if (known) return known.title;
  const words = journey.replace(/[_-]+/g, ' ').trim();
  return words ? words[0].toUpperCase() + words.slice(1) : '—';
}

export function sourceLabel(source: AdminFormRow['source']): string {
  return source === 'acroform' ? 'Fillable PDF' : 'OCR';
}

export function statusLabel(status: AdminFormRow['status']): string {
  if (status === 'published') return 'Published';
  if (status === 'retired') return 'Retired';
  return 'Draft';
}

/** "just now", "5 min ago", "3 h ago", "2 days ago", then a date; "—" when unknown. */
export function relativeTime(iso: string | null, now: number = Date.now()): string {
  if (!iso) return '—';
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return '—';
  const seconds = Math.max(0, Math.round((now - then) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  return new Date(then).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Why Publish is off for a row, or null when it can publish. */
export function publishBlockedReason(row: AdminFormRow): string | null {
  if (row.status !== 'draft') return null;
  if (row.needsReview > 0) {
    return `${row.needsReview} field${row.needsReview === 1 ? '' : 's'} still need review.`;
  }
  return null;
}
