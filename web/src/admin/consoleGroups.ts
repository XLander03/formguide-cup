import type { AdminFormRow } from '../../../shared/forms/admin';
import { journeyLabel } from './consoleFormat';

/**
 * The console groups forms by bank + journey: customers pick one form per bank
 * and journey, so that is the unit an admin manages. Each upload makes a new
 * formId, so repeated uploads of one PDF land in the same group.
 */
export interface FormGroup {
  key: string;
  bankId: string;
  journey: string;
  title: string;
  /** Published versions, newest first. Normally one; more means customers see duplicates. */
  live: AdminFormRow[];
  /** The newest draft, the one an admin works on. */
  draft: AdminFormRow | null;
  /** Every other draft in the group, newest first. */
  olderDrafts: AdminFormRow[];
  retired: AdminFormRow[];
}

export type ConsoleFilter = 'review' | 'ready' | 'live' | 'retired' | 'all';

export const FILTERS: readonly { id: ConsoleFilter; label: string }[] = [
  { id: 'review', label: 'Needs review' },
  { id: 'ready', label: 'Ready to publish' },
  { id: 'live', label: 'Live' },
  { id: 'retired', label: 'Retired' },
  { id: 'all', label: 'All' },
];

export function groupTitle(bankId: string, journey: string): string {
  return `${bankId || 'Bank'} · ${journeyLabel(journey)}`;
}

/** Newest first: by updatedAt when both rows have one, else the server's order (it sorts newest first). */
function newestFirst(rows: readonly AdminFormRow[]): AdminFormRow[] {
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const at = a.row.updatedAt;
      const bt = b.row.updatedAt;
      if (at && bt && at !== bt) return at < bt ? 1 : -1;
      return a.index - b.index;
    })
    .map((item) => item.row);
}

export function groupForms(rows: readonly AdminFormRow[]): FormGroup[] {
  const byKey = new Map<string, AdminFormRow[]>();
  for (const row of newestFirst(rows)) {
    const key = `${row.bankId.trim().toLowerCase()}|${row.journey}`;
    const list = byKey.get(key);
    if (list) list.push(row);
    else byKey.set(key, [row]);
  }
  const groups = [...byKey.entries()].map(([key, list]): FormGroup => {
    const drafts = list.filter((row) => row.status === 'draft');
    return {
      key,
      bankId: list[0].bankId,
      journey: list[0].journey,
      title: groupTitle(list[0].bankId, list[0].journey),
      live: list.filter((row) => row.status === 'published'),
      draft: drafts[0] ?? null,
      olderDrafts: drafts.slice(1),
      retired: list.filter((row) => row.status === 'retired'),
    };
  });
  return groups.sort((a, b) => a.title.localeCompare(b.title));
}

export function needsReview(group: FormGroup): boolean {
  return group.draft !== null && group.draft.needsReview > 0;
}

export function readyToPublish(group: FormGroup): boolean {
  return group.draft !== null && group.draft.needsReview === 0;
}

export function inFilter(group: FormGroup, filter: ConsoleFilter): boolean {
  switch (filter) {
    case 'review':
      return needsReview(group);
    case 'ready':
      return readyToPublish(group);
    case 'live':
      return group.live.length > 0;
    case 'retired':
      return group.retired.length > 0;
    case 'all':
      return group.live.length > 0 || group.draft !== null;
  }
}

export function filterCounts(groups: readonly FormGroup[]): Record<ConsoleFilter, number> {
  const counts = { review: 0, ready: 0, live: 0, retired: 0, all: 0 };
  for (const group of groups) {
    for (const { id } of FILTERS) if (inFilter(group, id)) counts[id] += 1;
  }
  return counts;
}

/** Needs review if anything does, else Ready to publish, else Live. */
export function defaultFilter(groups: readonly FormGroup[]): ConsoleFilter {
  const counts = filterCounts(groups);
  if (counts.review > 0) return 'review';
  if (counts.ready > 0) return 'ready';
  return 'live';
}

/** Fields still to check across the drafts an admin works on (the newest per group). */
export function fieldsToReview(groups: readonly FormGroup[]): number {
  return groups.reduce((sum, group) => sum + (needsReview(group) ? group.draft!.needsReview : 0), 0);
}

export type PrimaryAction =
  | { kind: 'review'; row: AdminFormRow; label: string }
  | { kind: 'publish'; row: AdminFormRow; label: string }
  | { kind: 'replace'; row: AdminFormRow; label: string }
  | { kind: 'view'; row: AdminFormRow; label: string }
  | null;

export function primaryAction(group: FormGroup): PrimaryAction {
  const { draft } = group;
  if (draft && draft.needsReview > 0) {
    return { kind: 'review', row: draft, label: `Review ${draft.needsReview} field${draft.needsReview === 1 ? '' : 's'}` };
  }
  if (draft) {
    return group.live.length > 0
      ? { kind: 'replace', row: draft, label: 'Publish & replace live' }
      : { kind: 'publish', row: draft, label: 'Publish' };
  }
  if (group.live.length > 0) return { kind: 'view', row: group.live[0], label: 'View on site' };
  return null;
}
