import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

export const ROUTES = ['/', '/journey', '/speak', '/review', '/confirm'] as const;

export type RoutePath = (typeof ROUTES)[number];

export const STEPS: readonly { path: RoutePath; label: string; title: string }[] = [
  { path: '/', label: 'Start', title: 'Start' },
  { path: '/journey', label: 'Journey', title: 'Language and journey' },
  { path: '/speak', label: 'Speak', title: 'Speak and fill' },
  { path: '/review', label: 'Review', title: 'Review' },
  { path: '/confirm', label: 'Confirm', title: 'Confirm' },
];

export function parsePath(pathname: string): RoutePath {
  const trimmed = pathname.replace(/\/+$/, '') || '/';
  return (ROUTES as readonly string[]).includes(trimmed) ? (trimmed as RoutePath) : '/';
}

interface RouteApi {
  path: RoutePath;
  go: (next: RoutePath) => void;
}

const RouteContext = createContext<RouteApi | null>(null);

export function RouteProvider({ children }: { children: ReactNode }) {
  const [path, setPath] = useState<RoutePath>(() => parsePath(window.location.pathname));

  useEffect(() => {
    const onPop = () => setPath(parsePath(window.location.pathname));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const go = useCallback((next: RoutePath) => {
    if (parsePath(window.location.pathname) !== next) {
      window.history.pushState({ route: next }, '', next);
    }
    setPath(next);
  }, []);

  return <RouteContext.Provider value={{ path, go }}>{children}</RouteContext.Provider>;
}

export function useRoute(): RouteApi {
  const ctx = useContext(RouteContext);
  if (!ctx) throw new Error('useRoute must be used within RouteProvider');
  return ctx;
}
