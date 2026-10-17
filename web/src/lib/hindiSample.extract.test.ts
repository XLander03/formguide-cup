import { describe, expect, it } from 'vitest';
import { heuristicExtract } from './heuristicExtract';
import { HINDI_SAMPLE } from './utteranceLang';

describe('Hindi sample address', () => {
  it('keeps the street and leaves the rest of the sentence out of the address line', () => {
    const result = heuristicExtract(HINDI_SAMPLE, {});
    expect(result.field_updates.addr_current_line1).toBe('14 लेक व्यू');
    expect(String(result.field_updates.addr_current_line1).length).toBeLessThanOrEqual(120);
    expect(result.field_updates.addr_current_city).toBe('Bengaluru');
    expect(result.field_updates.addr_current_state).toBe('Karnataka');
    expect(result.field_updates.addr_current_pin).toBe('560038');
  });
});
