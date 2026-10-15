import { useState, type FormEvent } from 'react';
import { BTN_LG, BTN_PRIMARY } from '../ui/buttons';
import { FileTextIcon, LockIcon } from '../ui/icons';

export type SignInResult = { ok: true } | { ok: false; reason: string };

export function AdminLogin({ onSignIn }: { onSignIn: (email: string, password: string) => Promise<SignInResult> }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setReason('');
    const result = await onSignIn(email, password);
    if (!result.ok) setReason(result.reason);
    setBusy(false);
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="flex min-h-16 items-center gap-3 border-b-2 border-foreground px-4 py-3 sm:px-6">
        <span className="grid size-9 place-items-center border-2 border-foreground bg-primary text-primary-foreground">
          <FileTextIcon className="size-4" />
        </span>
        <span className="font-display text-2xl leading-none">FormGuide</span>
        <span className="text-[10px] uppercase text-muted-foreground">Admin</span>
      </header>
      <main className="mx-auto w-full max-w-md px-4 py-10">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-primary">Cup admin</p>
        <h1 className="mt-2 font-display text-4xl leading-none">Sign in</h1>
        <p className="mt-3 flex items-start gap-2 text-sm text-muted-foreground">
          <LockIcon className="mt-0.5 size-4 shrink-0 text-primary" />
          One admin account. FormGuide does not create it.
        </p>
        <form className="mt-6 grid gap-4" onSubmit={(event) => void submit(event)}>
          <label className="grid gap-1 text-sm font-semibold">
            Email
            <input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="h-10 border-2 border-foreground bg-background px-3 font-normal"
            />
          </label>
          <label className="grid gap-1 text-sm font-semibold">
            Password
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="h-10 border-2 border-foreground bg-background px-3 font-normal"
            />
          </label>
          {reason ? (
            <p role="alert" className="text-sm text-destructive">
              {reason}
            </p>
          ) : null}
          <button type="submit" className={`${BTN_PRIMARY} ${BTN_LG}`} disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </main>
    </div>
  );
}
