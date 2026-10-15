import type { ReactNode } from 'react';
import { BTN_MD, BTN_OUTLINE } from '../ui/buttons';
import { FileTextIcon } from '../ui/icons';

export function AdminShell({ children, onSignOut }: { children: ReactNode; onSignOut: () => void }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-b-2 border-foreground px-4 py-3 sm:px-6">
        <a href="/" className="flex items-center gap-3">
          <span className="grid size-9 place-items-center border-2 border-foreground bg-primary text-primary-foreground">
            <FileTextIcon className="size-4" />
          </span>
          <span className="font-display text-2xl leading-none">FormGuide</span>
          <span className="text-[10px] uppercase text-muted-foreground">Admin</span>
        </a>
        <button type="button" className={`${BTN_OUTLINE} ${BTN_MD}`} onClick={onSignOut}>
          Sign out
        </button>
      </header>
      <main>{children}</main>
    </div>
  );
}
