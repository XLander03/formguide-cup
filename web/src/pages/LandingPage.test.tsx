import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { AppShell } from '../layout/AppShell';
import { LANGUAGES } from '../lib/languages';
import { PREP_LIST } from '../lib/prepList';
import { RouteProvider } from '../routing/router';
import { FormSessionProvider } from '../session/FormSession';
import { setViewport } from '../test/viewport';
import { JourneyPage } from './JourneyPage';
import { LandingPage } from './LandingPage';

function renderAt(path: string, page: JSX.Element) {
  setViewport(1365);
  window.history.pushState({}, '', path);
  return render(
    <RouteProvider>
      <FormSessionProvider>
        <AppShell>{page}</AppShell>
      </FormSessionProvider>
    </RouteProvider>,
  );
}

describe('Landing page', () => {
  it('lists every language equally and makes no field-count claim', () => {
    const { container } = renderAt('/', <LandingPage />);
    for (const lang of LANGUAGES) expect(screen.getAllByText(lang.pickerLabel).length).toBeGreaterThan(0);
    expect(container.textContent).not.toMatch(/\b45\b|preview/i);
    expect(container.textContent).not.toMatch(/Hindi or English/);
  });

  it('has an admin login in the header and no footer', () => {
    const { container } = renderAt('/', <LandingPage />);
    expect(screen.getByRole('link', { name: /Admin login/ })).toHaveAttribute('href', '/admin');
    expect(container.querySelector('footer')).toBeNull();
    expect(container.textContent).not.toMatch(/No bank form IDs are generated/);
  });
});

describe('Journey page preparation list', () => {
  it('shows the checklist for the picked journey', async () => {
    const user = userEvent.setup();
    renderAt('/journey?flags=1', <JourneyPage />);
    expect(screen.getByText(PREP_LIST.account_opening[0])).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Debit card reissue/ }));
    for (const item of PREP_LIST.debit_reissue) expect(screen.getByText(item)).toBeInTheDocument();
  });
});
