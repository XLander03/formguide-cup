export type AdminRoute = { name: 'upload' } | { name: 'review'; formId: string };

export function parseAdminLocation(pathname: string): AdminRoute | null {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path === '/admin/upload') return { name: 'upload' };
  const review = /^\/admin\/forms\/([^/]+)\/review$/.exec(path);
  if (!review) return null;
  return { name: 'review', formId: decodeURIComponent(review[1]) };
}

export function adminPath(route: AdminRoute): string {
  if (route.name === 'upload') return '/admin/upload';
  return `/admin/forms/${encodeURIComponent(route.formId)}/review`;
}
