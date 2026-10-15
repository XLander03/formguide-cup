import { useEffect, useState } from 'react';
import { AdminLogin } from './AdminLogin';
import { AdminShell } from './AdminShell';
import { saveAdminDraft } from './draftStore';
import { FieldReviewPage } from './FieldReviewPage';
import { adminPath, parseAdminLocation, type AdminRoute } from './routes';
import { UploadPage } from './UploadPage';
import { useAdminSession } from './useAdminSession';

export function AdminApp({ initial }: { initial: AdminRoute }) {
  const [route, setRoute] = useState<AdminRoute>(initial);
  const { status, signIn, signOut } = useAdminSession();

  useEffect(() => {
    const title = route.name === 'upload' ? 'Upload a form — FormGuide' : 'Review fields — FormGuide';
    document.title = title;
  }, [route]);

  useEffect(() => {
    const onPop = () => {
      const next = parseAdminLocation(window.location.pathname);
      if (next) setRoute(next);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  function go(next: AdminRoute) {
    const path = `${adminPath(next)}${window.location.search}`;
    if (`${window.location.pathname}${window.location.search}` !== path) {
      window.history.pushState({ admin: next.name }, '', path);
    }
    setRoute(next);
  }

  if (status === 'loading') {
    return <p className="bg-background p-6 text-sm text-foreground">Checking sign-in…</p>;
  }

  if (status !== 'in') return <AdminLogin onSignIn={signIn} />;

  return (
    <AdminShell onSignOut={() => void signOut()}>
      {route.name === 'upload' ? (
        <UploadPage
          onReady={(form, pages, bytes) => {
            saveAdminDraft({ form, pages }, bytes);
            go({ name: 'review', formId: form.formId });
          }}
        />
      ) : (
        <FieldReviewPage formId={route.formId} onUpload={() => go({ name: 'upload' })} />
      )}
    </AdminShell>
  );
}
