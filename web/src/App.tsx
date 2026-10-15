import { lazy, Suspense, useEffect } from 'react';
import { parseAdminLocation } from './admin/routes';
import { AppShell, pageTitle } from './layout/AppShell';
import { ConfirmPage } from './pages/ConfirmPage';
import { JourneyPage } from './pages/JourneyPage';
import { LandingPage } from './pages/LandingPage';
import { ReviewPage } from './pages/ReviewPage';
import { SpeakPage } from './pages/SpeakPage';
import { RouteProvider, useRoute } from './routing/router';
import { FormSessionProvider } from './session/FormSession';

function AppRoutes() {
  const { path } = useRoute();

  useEffect(() => {
    document.title = pageTitle(path);
  }, [path]);

  return (
    <AppShell>
      {path === '/' && <LandingPage />}
      {path === '/journey' && <JourneyPage />}
      {path === '/speak' && <SpeakPage />}
      {path === '/review' && <ReviewPage />}
      {path === '/confirm' && <ConfirmPage />}
    </AppShell>
  );
}

const AdminApp = lazy(() => import('./admin/AdminApp').then((mod) => ({ default: mod.AdminApp })));

export default function App() {
  const admin = parseAdminLocation(window.location.pathname);
  if (admin) {
    return (
      <Suspense fallback={<p className="bg-background p-6 text-sm text-foreground">Loading…</p>}>
        <AdminApp initial={admin} />
      </Suspense>
    );
  }
  return (
    <RouteProvider>
      <FormSessionProvider>
        <AppRoutes />
      </FormSessionProvider>
    </RouteProvider>
  );
}
