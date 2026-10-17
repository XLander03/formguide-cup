const KEY = 'formguide.demo';

/**
 * Demo helpers (sample phrase, sample draft, manual read-back) show only for demos:
 * `?demo=1` (or the `?flags=1` demo) turns them on for this tab, `?demo=0` turns them off.
 * Kept in sessionStorage because moving between steps drops the query string.
 */
export function demoMode(): boolean {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  try {
    if (params.get('demo') === '0') {
      sessionStorage.removeItem(KEY);
      return false;
    }
    if (params.get('demo') === '1' || params.get('flags') === '1') {
      sessionStorage.setItem(KEY, '1');
      return true;
    }
    return sessionStorage.getItem(KEY) === '1';
  } catch {
    return params.get('demo') === '1' || params.get('flags') === '1';
  }
}
