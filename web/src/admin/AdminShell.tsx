import type { MouseEvent, ReactNode } from 'react';
import { BTN_MD, BTN_OUTLINE } from '../ui/buttons';
import { ArrowRightIcon, FileTextIcon } from '../ui/icons';
import { adminPath, type AdminRoute } from './routes';

const NAV: readonly { label: string; route: AdminRoute; active: (route: AdminRoute) => boolean }[] = [
  { label: 'Overview', route: { name: 'console' }, active: (route) => route.name === 'console' || route.name === 'review' },
  { label: 'Upload', route: { name: 'upload' }, active: (route) => route.name === 'upload' },
];

const NAV_LINK = 'inline-flex h-10 items-center border-2 px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';

export function AdminShell({
  children,
  route,
  go,
  onSignOut,
}: {
  children: ReactNode;
  route: AdminRoute;
  go: (next: AdminRoute) => void;
  onSignOut: () => void;
}) {
  function follow(event: MouseEvent<HTMLAnchorElement>, next: AdminRoute) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    go(next);
  }

  const search = typeof window === 'undefined' ? '' : window.location.search;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="flex min-h-16 flex-wrap items-center gap-x-6 gap-y-3 border-b-2 border-foreground px-4 py-3 sm:px-6">
        <a
          href={`${adminPath({ name: 'console' })}${search}`}
          className="flex items-center gap-3"
          onClick={(event) => follow(event, { name: 'console' })}
        >
          <span className="grid size-9 place-items-center border-2 border-foreground bg-primary text-primary-foreground">
            <FileTextIcon className="size-4" />
          </span>
          <span className="font-display text-2xl leading-none">FormGuide</span>
          <span className="text-[10px] uppercase text-muted-foreground">Admin</span>
        </a>

        <nav aria-label="Admin" className="order-last flex w-full gap-2 sm:order-none sm:w-auto">
          {NAV.map((item) => {
            const active = item.active(route);
            return (
              <a
                key={item.label}
                href={`${adminPath(item.route)}${search}`}
                aria-current={active ? 'page' : undefined}
                className={`${NAV_LINK} flex-1 justify-center sm:flex-none ${
                  active
                    ? 'border-foreground bg-foreground text-background'
                    : 'border-transparent hover:border-foreground'
                }`}
                onClick={(event) => follow(event, item.route)}
              >
                {item.label}
              </a>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <a href="/" className={`${NAV_LINK} gap-1 border-transparent hover:border-foreground`}>
            Customer site
            <ArrowRightIcon className="size-4" />
          </a>
          <button type="button" className={`${BTN_OUTLINE} ${BTN_MD}`} onClick={onSignOut}>
            Sign out
          </button>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
