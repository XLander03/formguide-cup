/**
 * The hosted app's addresses, for each function's CORS list. formguide.web.app is the
 * customer-facing name; faceapp-5397b is the project's own default site, still serving the
 * same app. Hosting rewrites are same-origin; these matter for direct calls (admin upload).
 */
export const SITE_ORIGINS = [
  'https://formguide.web.app',
  'https://formguide.firebaseapp.com',
  'https://faceapp-5397b.web.app',
  'https://faceapp-5397b.firebaseapp.com',
];
