import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestPlan } from '../lib/journeyPlan';
import { LANGUAGES } from '../lib/languages';
import { RouteProvider } from '../routing/router';
import { FormSessionProvider, useFormSession, type FormSessionValue } from '../session/FormSession';
import { JourneyPage } from './JourneyPage';

let session: FormSessionValue;
function Probe() {
  session = useFormSession();
  return null;
}

function mount(plan: RequestPlan = async () => ({ plan: null, error: 'plan_503' })) {
  sessionStorage.clear();
  window.history.pushState({}, '', '/journey');
  return render(
    <RouteProvider>
      <FormSessionProvider>
        <Probe />
        <JourneyPage plan={plan} />
      </FormSessionProvider>
    </RouteProvider>,
  );
}

describe('JourneyPage companion panel', () => {
  beforeEach(() => sessionStorage.clear());

  it('opens on Speak and switches tabs by click and arrow keys', async () => {
    const user = userEvent.setup();
    mount();
    const tablist = screen.getByRole('tablist');
    const tabs = within(tablist).getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Speak', 'Type', 'Languages']);
    expect(screen.getByRole('tab', { name: 'Speak' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toContainElement(
      screen.getByRole('button', { name: /Tap and say what you need/ }),
    );
    expect(screen.queryByLabelText(/Tell us what happened/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Type' }));
    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', screen.getByRole('tab', { name: 'Type' }).id);
    expect(screen.getByLabelText(/Tell us what happened/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Plan my forms/ })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /Tap and say what you need/ })).not.toBeInTheDocument();

    // Roving focus: only the selected tab is in the tab order.
    expect(screen.getByRole('tab', { name: 'Type' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('tab', { name: 'Speak' })).toHaveAttribute('tabindex', '-1');

    screen.getByRole('tab', { name: 'Type' }).focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Languages' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Languages' })).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Speak' })).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('tab', { name: 'Languages' })).toHaveFocus();
    await user.keyboard('{Home}');
    expect(screen.getByRole('tab', { name: 'Speak' })).toHaveFocus();
    await user.keyboard('{End}');
    expect(screen.getByRole('tab', { name: 'Languages' })).toHaveAttribute('aria-selected', 'true');
  });

  it('changes language from the pill through Supported languages and returns to Speak', async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole('button', { name: 'Speaking in English. Change language' }));
    expect(screen.getByRole('tab', { name: 'Languages' })).toHaveAttribute('aria-selected', 'true');
    const list = screen.getByRole('list', { name: 'Supported languages' });
    const options = within(list).getAllByRole('button');
    expect(options).toHaveLength(LANGUAGES.length);
    expect(within(list).getByRole('button', { name: /English/ })).toHaveAttribute('aria-pressed', 'true');

    await user.click(within(list).getByRole('button', { name: /বাংলা.*Bengali/ }));
    expect(session.language).toBe('bn');
    expect(session.micLang).toBe('bn-IN');
    expect(screen.getByRole('tab', { name: 'Speak' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Speak' })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Speaking in Bengali. Change language' })).toHaveTextContent(
      /বাংলা · Bengali/,
    );

    await user.click(screen.getByRole('tab', { name: 'Languages' }));
    expect(screen.getByRole('button', { name: /বাংলা.*Bengali/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /^English/ })).toHaveAttribute('aria-pressed', 'false');
  });

  it('keeps samples behind a disclosure and plans from one', async () => {
    const user = userEvent.setup();
    const plan = vi.fn<RequestPlan>(async () => ({ plan: null, error: 'plan_503' }));
    mount(plan);
    const toggle = screen.getByRole('button', { name: /No mic\? Try a sample/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('button', { name: /डेबिट कार्ड चोरी/ })).not.toBeInTheDocument();

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: /डेबिट कार्ड चोरी/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /सैलरी के लिए/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /redo my KYC/ }));
    expect(plan).toHaveBeenCalledWith('My bank sent a letter saying I need to redo my KYC', 'en');
    expect(screen.getByText('Sample · not a live transcript')).toBeInTheDocument();

    // The sample also lands in the Type box so it can be edited.
    await user.click(screen.getByRole('tab', { name: 'Type' }));
    expect(screen.getByLabelText(/Tell us what happened/)).toHaveValue(
      'My bank sent a letter saying I need to redo my KYC',
    );
  });

  it('never says Beta anywhere on the page', async () => {
    const user = userEvent.setup();
    const { container } = mount();
    for (const tab of ['Speak', 'Type', 'Languages']) {
      await user.click(screen.getByRole('tab', { name: tab }));
      expect(container.textContent ?? '').not.toMatch(/beta/i);
      expect(container.innerHTML).not.toMatch(/beta/i);
    }
    expect(screen.queryByText(/Tested in English and Hindi/)).not.toBeInTheDocument();
  });
});
