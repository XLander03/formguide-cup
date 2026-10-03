import { useEffect } from 'react';
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

  if (path === '/') return <LandingPage />;

  return (
    <AppShell>
      {path === '/journey' && <JourneyPage />}
      {path === '/speak' && <SpeakPage />}
      {path === '/review' && <ReviewPage />}
      {path === '/confirm' && <ConfirmPage />}
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
