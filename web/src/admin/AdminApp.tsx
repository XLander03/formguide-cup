import { useEffect, useState } from 'react';
import { AdminLogin } from './AdminLogin';
import { AdminShell } from './AdminShell';
import { ConsolePage } from './ConsolePage';
import { journeyLabel } from './consoleFormat';
import { saveAdminDraft } from './draftStore';
import { FieldReviewPage } from './FieldReviewPage';
import { adminPath, adminTitle, parseAdminLocation, type AdminRoute } from './routes';
import { UploadPage } from './UploadPage';
import { useAdminSession } from './useAdminSession';

export function AdminApp({ initial }: { initial: AdminRoute }) {
  const [route, setRoute] = useState<AdminRoute>(initial);
  // A one-shot message for the console, e.g. after publishing from review.
  const [flash, setFlash] = useState<string | undefined>(undefined);
  const { status, signIn, signOut } = useAdminSession();

  useEffect(() => {
    document.title = adminTitle(route);
  }, [route]);

  useEffect(() => {
    const onPop = () => {
      const next = parseAdminLocation(window.location.pathname);
      if (next) {
        setFlash(undefined);
        setRoute(next);
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  function go(next: AdminRoute, message?: string) {
    const path = `${adminPath(next)}${window.location.search}`;
    if (`${window.location.pathname}${window.location.search}` !== path) {
      window.history.pushState({ admin: next.name }, '', path);
    }
    setFlash(message);
    setRoute(next);
  }

  if (status === 'loading') {
    return <p className="bg-background p-6 text-sm text-foreground">Checking sign-in…</p>;
  }

  if (status !== 'in') return <AdminLogin onSignIn={signIn} />;

  return (
    <AdminShell route={route} go={go} onSignOut={() => void signOut()}>
      {route.name === 'console' ? (
        <ConsolePage
          key={flash ?? 'console'}
          initialNotice={flash}
          onUpload={() => go({ name: 'upload' })}
          onReview={(row) => go({ name: 'review', formId: row.formId, version: row.version })}
        />
      ) : route.name === 'upload' ? (
        <UploadPage
          onConsole={() => go({ name: 'console' })}
          onReady={(form, pages, bytes) => {
            saveAdminDraft({ form, pages }, bytes);
            go({ name: 'review', formId: form.formId, version: form.version });
          }}
        />
      ) : (
        <FieldReviewPage
          key={`${route.formId}@${route.version ?? ''}`}
          formId={route.formId}
          version={route.version}
          onConsole={() => go({ name: 'console' })}
          onPublished={(form) =>
            go(
              { name: 'console' },
              `Published ${form.bankId || 'Bank'} · ${journeyLabel(form.journey)}. It now shows in the journey picker.`,
            )
          }
        />
      )}
    </AdminShell>
  );
}
