import { describe, expect, it } from 'vitest';
import { CUP_ADMIN_EMAIL, CUP_TEST_ADMIN_EMAIL, isCupAdmin } from '../../../shared/forms/cupAdmin';

describe('cup admin gate', () => {
  it('accepts the admin and the Cup test admin, and no one else', () => {
    expect(isCupAdmin(CUP_ADMIN_EMAIL)).toBe(true);
    expect(isCupAdmin(`  ${CUP_ADMIN_EMAIL.toUpperCase()}  `)).toBe(true);
    expect(isCupAdmin(CUP_TEST_ADMIN_EMAIL)).toBe(true);
    expect(isCupAdmin('someoneelse@example.com')).toBe(false);
    expect(isCupAdmin('formguide-test@test.com.evil.com')).toBe(false);
    expect(isCupAdmin(null)).toBe(false);
  });
});
