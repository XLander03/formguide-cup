import { describe, expect, it } from 'vitest';
import { CUP_ADMIN_EMAIL, isCupAdmin } from './cupAdmin';

describe('cup admin gate', () => {
  it('accepts only the single hard-coded admin email', () => {
    expect(isCupAdmin(CUP_ADMIN_EMAIL)).toBe(true);
    expect(isCupAdmin(`  ${CUP_ADMIN_EMAIL.toUpperCase()}  `)).toBe(true);
    expect(isCupAdmin('someoneelse@example.com')).toBe(false);
    expect(isCupAdmin(null)).toBe(false);
  });
});
