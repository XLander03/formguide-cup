import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PlanProgress } from '../components/PlanProgress';
import type { PlanResponse, RequestPlan } from '../lib/journeyPlan';
import { RouteProvider, useRoute } from '../routing/router';
import { FormSessionProvider, useFormSession, type FormSessionValue } from '../session/FormSession';
import { ConfirmPage } from './ConfirmPage';
import { JourneyPage } from './JourneyPage';

const STOLEN_AND_MOVED = 'मेरा डेबिट कार्ड चोरी हो गया और मैंने घर बदल लिया है';

const TWO_FORMS: PlanResponse = {
  outcome: 'planned',
  steps: [
    { journey: 'debit_reissue', reason: 'चोरी हुआ कार्ड पहले ब्लॉक करें।' },
    { journey: 'kyc_update', reason: 'नया पता अपडेट करें।' },
  ],
  reply: 'पहले कार्ड, फिर पता।',
  trace: [
    { tool: 'list_journeys', args: {}, summary: '4 journeys' },
    { tool: 'list_bank_forms', args: { journey: 'kyc_update' }, summary: 'HDFC' },
    { tool: 'submit_plan', args: { journeys: ['debit_reissue', 'kyc_update'] }, summary: '2 forms' },
  ],
};

let session: FormSessionValue;
let path = '';
function Probe() {
  session = useFormSession();
  path = useRoute().path;
  return null;
}

function Pages({ plan }: { plan: RequestPlan }) {
  const route = useRoute();
  return (
    <>
      <Probe />
      {route.path === '/speak' || route.path === '/confirm' ? <PlanProgress /> : null}
      {route.path === '/journey' ? <JourneyPage plan={plan} /> : null}
      {route.path === '/confirm' ? <ConfirmPage /> : null}
    </>
  );
}

function mount(plan: RequestPlan) {
  window.history.pushState({}, '', '/journey');
  return render(
    <RouteProvider>
      <FormSessionProvider>
        <Pages plan={plan} />
      </FormSessionProvider>
    </RouteProvider>,
  );
}

describe('JourneyPage planner', () => {
  beforeEach(() => sessionStorage.clear());

  it('plans two forms from one Hindi sentence and carries answers from the first to the second', async () => {
    const user = userEvent.setup();
    const plan = vi.fn<RequestPlan>(async () => ({ plan: TWO_FORMS, error: null }));
    mount(plan);

    await user.click(screen.getByRole('button', { name: new RegExp(STOLEN_AND_MOVED) }));
    expect(plan).toHaveBeenCalledWith(STOLEN_AND_MOVED, 'en');
    const card = await screen.findByRole('region', { name: 'Your plan' });
    expect(within(card).getByText('2 forms, in this order.')).toBeInTheDocument();
    expect(within(card).getByText('चोरी हुआ कार्ड पहले ब्लॉक करें।')).toBeInTheDocument();
    expect(within(card).getByText('How I decided')).toBeInTheDocument();
    expect(within(card).getByText('Looked up KYC update forms: HDFC')).toBeInTheDocument();
    // The single-card pick follows step 1.
    expect(screen.getByRole('button', { name: /Start filling Debit card reissue/ })).toBeInTheDocument();

    await user.click(within(card).getByRole('button', { name: /Start with step 1 · Debit card reissue/ }));
    expect(path).toBe('/speak');
    expect(session.plan?.steps).toHaveLength(2);
    expect(session.planStep).toBe(0);
    expect(session.journey).toBe('debit_reissue');
    // What the customer already said fills the card reason.
    expect(session.values.card_reason).toBe('stolen');
    expect(screen.getByRole('status', { name: 'Plan progress' })).toHaveTextContent('Form 1 of 2');

    // Finish form 1 and save its draft.
    act(() => session.onPriya());
    for (const gate of ['card_old_blocked_ack', 'readback_confirmed', 'draft_only_ack', 'no_live_submit_ack']) {
      act(() => session.onChange(gate, true));
    }
    act(() => session.emitDraft());
    expect(session.draftReady).toBe(true);
    act(() => window.history.pushState({}, '', '/confirm'));
    act(() => window.dispatchEvent(new PopStateEvent('popstate')));
    expect(path).toBe('/confirm');

    await user.click(await screen.findByRole('button', { name: /Next: KYC update/ }));
    expect(path).toBe('/speak');
    expect(session.planStep).toBe(1);
    expect(session.journey).toBe('kyc_update');
    expect(session.values.applicant_full_name).toBe('Priya Sharma');
    expect(session.values.mobile_registered).toBe('9876543210');
    expect(session.values.readback_confirmed).toBeNull();
    expect(session.draftReady).toBe(false);
    expect(screen.getByRole('status', { name: 'Plan progress' })).toHaveTextContent('Form 2 of 2');
  });

  it('falls back to the single-card pick with a gentle note when the planner fails', async () => {
    const user = userEvent.setup();
    mount(async () => ({ plan: null, error: 'plan_503' }));
    await user.click(screen.getByRole('button', { name: /redo my KYC/ }));
    expect(await screen.findByText(/could not plan this just now/)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Your plan' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Start filling Re-KYC/ })).toBeInTheDocument();
  });

  it('shows the polite reply for a request outside the journeys', async () => {
    const user = userEvent.setup();
    mount(async () => ({
      plan: {
        outcome: 'unsupported',
        steps: [],
        reply: 'Sorry, loans are not covered.',
        unsupported: ['personal loan'],
        trace: [{ tool: 'submit_plan', args: { journeys: [] }, summary: 'No supported form' }],
      },
      error: null,
    }));
    await user.type(screen.getByLabelText(/Tell us what happened/), 'I want a personal loan{Enter}');
    const card = await screen.findByRole('region', { name: 'Your plan' });
    expect(within(card).getByText('Sorry, loans are not covered.')).toBeInTheDocument();
    expect(within(card).getByText('personal loan · later')).toBeInTheDocument();
    expect(within(card).queryByRole('button', { name: /Start with step 1/ })).not.toBeInTheDocument();
  });

  it('sets the plan aside when a card is picked by hand', async () => {
    const user = userEvent.setup();
    mount(async () => ({ plan: TWO_FORMS, error: null }));
    await user.click(screen.getByRole('button', { name: new RegExp(STOLEN_AND_MOVED) }));
    await screen.findByRole('region', { name: 'Your plan' });
    await user.click(screen.getByRole('button', { name: /Re-KYC.*Periodic/ }));
    await user.click(screen.getByRole('button', { name: /Start filling Re-KYC/ }));
    expect(session.plan).toBeNull();
    expect(path).toBe('/speak');
  });
});
