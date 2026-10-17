import { describe, expect, it } from 'vitest';
import { runDraftChecks } from './draftChecks';

const TODAY = new Date(2026, 9, 17);
const byId = (values: Record<string, string>) =>
  Object.fromEntries(runDraftChecks(values, TODAY).map((c) => [c.id, c]));

describe('draft checks', () => {
  it('passes the sample person', () => {
    const checks = byId({
      applicant_full_name: 'Priya Sharma',
      dob: '1990-04-12',
      mobile_registered: '9876543210',
      pan_number: 'ABCPS1234D',
      addr_current_pin: '560001',
      addr_current_state: 'Karnataka',
      ovd_poi_type: 'passport',
      ovd_poi_number: 'K1234567',
      ovd_poi_expiry: '2031-01-01',
    });
    expect(Object.values(checks).every((c) => c.level === 'pass')).toBe(true);
    expect(checks.age.detail).toMatch(/36/);
    expect(Object.keys(checks)).toEqual(['age', 'mobile', 'pan_type', 'pan_name', 'pin_state', 'doc_format', 'doc_expiry']);
  });

  it('flags a non-personal PAN and a surname mismatch', () => {
    const checks = byId({ applicant_full_name: 'Ananya Reddy', pan_number: 'ABCDE1234F' });
    expect(checks.pan_type.level).toBe('warn');
    expect(checks.pan_type.detail).toMatch(/D.*personal PAN has P/);
    expect(checks.pan_name.level).toBe('warn');
    expect(checks.pan_name.detail).toMatch(/Reddy → R/);
  });

  it('flags a PIN from another state, and skips states it does not know', () => {
    expect(byId({ addr_current_pin: '110001', addr_current_state: 'Karnataka' }).pin_state.level).toBe('warn');
    expect(byId({ addr_current_pin: '403001', addr_current_state: 'Goa' }).pin_state.level).toBe('pass');
    expect(byId({ addr_current_pin: '560001', addr_current_state: 'कर्नाटक' }).pin_state.level).toBe('pass');
    expect(byId({ addr_current_pin: '560001', addr_current_state: 'Atlantis' }).pin_state).toBeUndefined();
  });

  it('checks document number format and expiry', () => {
    expect(byId({ ovd_poi_type: 'passport', ovd_poi_number: '12345' }).doc_format.level).toBe('warn');
    expect(byId({ ovd_poi_type: 'voter_id', ovd_poi_number: 'abc 1234567' }).doc_format.level).toBe('pass');
    expect(byId({ ovd_poi_expiry: '2025-01-01' }).doc_expiry.level).toBe('warn');
    expect(byId({ ovd_poi_expiry: '2027-01-01' }).doc_expiry.level).toBe('note');
  });

  it('notes senior citizens and says nothing about an empty draft', () => {
    expect(byId({ dob: '1950-01-01' }).age.level).toBe('note');
    expect(runDraftChecks({}, TODAY)).toEqual([]);
  });
});
