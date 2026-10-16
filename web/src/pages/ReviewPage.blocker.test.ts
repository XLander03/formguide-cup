import { describe, expect, it } from 'vitest';
import { readbackBlocker } from './ReviewPage';

const ready = { canReadback: true, busy: false, missing: [], flaggedIds: [], invalidIds: [] };

describe('readbackBlocker', () => {
  it('is null when read-back is open', () => {
    expect(readbackBlocker(ready)).toBeNull();
  });

  it('names what is empty, badly formatted, and unconfirmed', () => {
    expect(
      readbackBlocker({
        ...ready,
        canReadback: false,
        missing: ['photo_consent', 'ovd_poi_number', 'pep_declaration', 'residential_status'],
        invalidIds: ['customer_id_cif'],
        flaggedIds: ['dob'],
      }),
    ).toBe(
      'Still empty: Photograph / image capture consent, Proof of identity — document number, Are you a Politically Exposed Person (PEP)? and 1 more. ' +
        'Fix the format of: Customer ID / CIF (if existing). ' +
        'Confirm with “Check this”: Date of birth.',
    );
  });

  it('says it is still working while busy', () => {
    expect(readbackBlocker({ ...ready, busy: true })).toBe('Still filling from your last answer…');
  });
});
