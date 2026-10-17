export type AdminRoute =
  | { name: 'console' }
  | { name: 'upload' }
  | { name: 'review'; formId: string; version?: string };

export function parseAdminLocation(pathname: string): AdminRoute | null {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path === '/admin') return { name: 'console' };
  if (path === '/admin/upload') return { name: 'upload' };
  const versioned = /^\/admin\/forms\/([^/]+)\/versions\/([^/]+)\/review$/.exec(path);
  if (versioned) {
    return { name: 'review', formId: decodeURIComponent(versioned[1]), version: decodeURIComponent(versioned[2]) };
  }
  const review = /^\/admin\/forms\/([^/]+)\/review$/.exec(path);
  if (!review) return null;
  return { name: 'review', formId: decodeURIComponent(review[1]) };
}

export function adminPath(route: AdminRoute): string {
  if (route.name === 'console') return '/admin';
  if (route.name === 'upload') return '/admin/upload';
  const formId = encodeURIComponent(route.formId);
  if (route.version) return `/admin/forms/${formId}/versions/${encodeURIComponent(route.version)}/review`;
  return `/admin/forms/${formId}/review`;
}

export function adminTitle(route: AdminRoute): string {
  if (route.name === 'console') return 'Admin console — FormGuide';
  if (route.name === 'upload') return 'Upload a form — FormGuide';
  return 'Review fields — FormGuide';
}
