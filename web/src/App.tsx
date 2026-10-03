import { useEffect } from 'react';
import { AppShell, pageTitle } from './layout/AppShell';
import { ConfirmPage } from './pages/ConfirmPage';
import { JourneyPage } from './pages/JourneyPage';
import { LandingPage } from './pages/LandingPage';
import { ReviewPage } from './pages/ReviewPage';
import { SpeakPage } from './pages/SpeakPage';
import { RouteProvider, useRoute } from './routing/router';
import { FormSessionProvider, useFormSession } from './session/FormSession';

function AppRoutes() {
  const { path, go } = useRoute();
  const { canReadback, readyForFill } = useFormSession();

  useEffect(() => {
    document.title = pageTitle(path);
  }, [path]);

  useEffect(() => {
    if ((path === '/review' || path === '/confirm') && !canReadback) {
      go(readyForFill ? '/speak' : '/journey');
    }
  }, [path, canReadback, readyForFill, go]);

  return (
    <AppShell>
      {path === '/' && <LandingPage />}
      {path === '/journey' && <JourneyPage />}
      {path === '/speak' && <SpeakPage />}
      {path === '/review' && canReadback && <ReviewPage />}
      {path === '/confirm' && canReadback && <ConfirmPage />}
    </AppShell>
  );
}

export default function App() {
  return (
    <RouteProvider>
      <FormSessionProvider>
        <AppRoutes />
      </FormSessionProvider>
    </RouteProvider>
  );
}
