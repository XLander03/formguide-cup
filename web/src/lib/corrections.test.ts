import { describe, expect, it } from 'vitest';
import { diffText, findCorrections } from './corrections';

describe('voice corrections', () => {
  it('reports a spoken change from one filled value to another', () => {
    const found = findCorrections({ dob: '1991-08-15', applicant_full_name: 'Ananya' }, { dob: '1992-08-15', applicant_full_name: 'Ananya' }, { dob: 'gemini' }, {}, 5);
    expect(found).toEqual([{ id: 'dob', from: '15 Aug 1991', to: '15 Aug 1992', at: 5 }]);
  });

  it('ignores first fills, typing, clearing and the sample draft', () => {
    expect(findCorrections({}, { dob: '1992-08-15' }, { dob: 'gemini' }, {})).toEqual([]);
    expect(findCorrections({ dob: '1991-08-15' }, { dob: '1992-08-15' }, { dob: 'manual' }, {})).toEqual([]);
    expect(findCorrections({ dob: '1991-08-15' }, { dob: '' }, { dob: 'gemini' }, {})).toEqual([]);
    expect(findCorrections({ dob: '1991-08-15' }, { dob: '1992-08-15' }, {}, { dob: 'Sample draft' })).toEqual([]);
  });

  it('reads enums and booleans as words', () => {
    expect(diffText('ovd_poi_type', 'driving_licence')).toBe('driving licence');
    expect(diffText('card_reissue_new', true)).toBe('Yes');
  });
});
