import { describe, expect, it } from 'vitest';
import type { AdminFormRow } from '../../../shared/forms/admin';
import { defaultFilter, fieldsToReview, filterCounts, groupForms, inFilter, primaryAction } from './consoleGroups';

function row(patch: Partial<AdminFormRow>): AdminFormRow {
  return {
    formId: 'f',
    version: 'v1',
    bankId: 'ICICI',
    journey: 'rekyc',
    status: 'draft',
    source: 'ocr',
    fieldCount: 129,
    sharedCount: 41,
    needsReview: 0,
    updatedAt: null,
    ...patch,
  };
}

/** Production today, in the server's order. */
const PROD: AdminFormRow[] = [
  row({ formId: 'axis_new', bankId: 'Axis', journey: 'account_opening', fieldCount: 262 }),
  row({ formId: 'axis_old', bankId: 'Axis', journey: 'account_opening', status: 'published' }),
  row({ formId: 'axis_rekyc', bankId: 'Axis', status: 'published' }),
  row({ formId: 'icici_a', needsReview: 5 }),
  row({ formId: 'icici_b', needsReview: 5 }),
  row({ formId: 'icici_c', needsReview: 5 }),
  row({ formId: 'icici_live', status: 'published' }),
  row({ formId: 'pnb_gone', bankId: 'PNB', status: 'retired' }),
];

describe('console groups', () => {
  it('groups by bank and journey with the newest draft on top and older drafts collapsed', () => {
    const groups = groupForms(PROD);
    expect(groups.map((group) => group.title)).toEqual([
      'Axis · Account opening',
      'Axis · Re-KYC',
      'ICICI · Re-KYC',
      'PNB · Re-KYC',
    ]);
    const icici = groups[2];
    expect(icici.draft?.formId).toBe('icici_a');
    expect(icici.olderDrafts.map((item) => item.formId)).toEqual(['icici_b', 'icici_c']);
    expect(icici.live.map((item) => item.formId)).toEqual(['icici_live']);
    expect(groups[3].retired).toHaveLength(1);
  });

  it('prefers updatedAt for newest when both rows have one', () => {
    const [group] = groupForms([
      row({ formId: 'older', updatedAt: '2026-10-16T00:00:00Z' }),
      row({ formId: 'newer', updatedAt: '2026-10-17T00:00:00Z' }),
    ]);
    expect(group.draft?.formId).toBe('newer');
    expect(group.olderDrafts.map((item) => item.formId)).toEqual(['older']);
  });

  it('counts filters per group and picks the default', () => {
    const groups = groupForms(PROD);
    expect(filterCounts(groups)).toEqual({ review: 1, ready: 1, live: 3, retired: 1, all: 3 });
    expect(fieldsToReview(groups)).toBe(5);
    expect(defaultFilter(groups)).toBe('review');
    expect(inFilter(groups[3], 'all')).toBe(false);

    const noReview = groupForms(PROD.filter((item) => !item.formId.startsWith('icici')));
    expect(defaultFilter(noReview)).toBe('ready');
    expect(defaultFilter(groupForms([row({ status: 'published' })]))).toBe('live');
  });

  it('chooses one primary action by state', () => {
    const [axisAof, axisRekyc, icici, pnb] = groupForms(PROD);
    expect(primaryAction(icici)).toMatchObject({ kind: 'review', label: 'Review 5 fields' });
    expect(primaryAction(axisAof)).toMatchObject({ kind: 'replace', label: 'Publish & replace live' });
    expect(primaryAction(axisRekyc)).toMatchObject({ kind: 'view', label: 'View on site' });
    expect(primaryAction(pnb)).toBeNull();
    expect(primaryAction(groupForms([row({ needsReview: 1 })])[0])?.label).toBe('Review 1 field');
    expect(primaryAction(groupForms([row({})])[0])).toMatchObject({ kind: 'publish', label: 'Publish' });
  });
});
