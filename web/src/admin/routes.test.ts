import { describe, expect, it } from 'vitest';
import { adminPath, adminTitle, parseAdminLocation, type AdminRoute } from './routes';

describe('admin routes', () => {
  it('opens the console at /admin and /admin/', () => {
    expect(parseAdminLocation('/admin')).toEqual({ name: 'console' });
    expect(parseAdminLocation('/admin/')).toEqual({ name: 'console' });
    expect(adminPath({ name: 'console' })).toBe('/admin');
    expect(adminTitle({ name: 'console' })).toBe('Admin console — FormGuide');
  });

  it('keeps upload and review, with an optional version on review', () => {
    expect(parseAdminLocation('/admin/upload')).toEqual({ name: 'upload' });
    expect(parseAdminLocation('/admin/forms/hdfc%20kyc/review')).toEqual({ name: 'review', formId: 'hdfc kyc' });
    expect(parseAdminLocation('/admin/forms/hdfc_kyc/versions/v2/review/')).toEqual({
      name: 'review',
      formId: 'hdfc_kyc',
      version: 'v2',
    });
  });

  it('round-trips every route through its path', () => {
    const routes: AdminRoute[] = [
      { name: 'console' },
      { name: 'upload' },
      { name: 'review', formId: 'a/b' },
      { name: 'review', formId: 'axis_aof', version: 'v 3' },
    ];
    for (const route of routes) expect(parseAdminLocation(adminPath(route))).toEqual(route);
  });

  it('leaves customer paths alone', () => {
    expect(parseAdminLocation('/')).toBeNull();
    expect(parseAdminLocation('/journey')).toBeNull();
    expect(parseAdminLocation('/admin/forms')).toBeNull();
    expect(parseAdminLocation('/administrator')).toBeNull();
  });
});
