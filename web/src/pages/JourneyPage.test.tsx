import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { BANK_VARIES_COPY } from '../lib/schema';
import { RouteProvider } from '../routing/router';
import { FormSessionProvider } from '../session/FormSession';
import { setViewport } from '../test/viewport';
import { JourneyPage } from './JourneyPage';

function renderJourney(width: number) {
  setViewport(width);
  window.history.pushState({}, '', '/journey?flags=1');
  return render(
    <RouteProvider>
      <FormSessionProvider>
        <JourneyPage />
      </FormSessionProvider>
    </RouteProvider>,
  );
}

describe('JourneyPage published forms', () => {
  it('lists the HDFC fallback with the bank-varies line at 1365px and about 400px', async () => {
    const wide = renderJourney(1365);
    expect(await screen.findByRole('list', { name: 'Published forms' })).toBeInTheDocument();
    expect(screen.getByText('HDFC')).toBeInTheDocument();
    expect(screen.getAllByText(BANK_VARIES_COPY).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /Start filling/ })).toBeInTheDocument();
    wide.unmount();

    renderJourney(400);
    expect(await screen.findByText('HDFC')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Speaking starts on the next step/i })).toBeInTheDocument();
  });

  it('does not pretend the journey mic is transcribing', async () => {
    const user = userEvent.setup();
    renderJourney(1365);
    const mic = await screen.findByRole('button', { name: /Speaking starts on the next step/i });
    await user.click(mic);
    expect(screen.queryByText(/Listening/i)).not.toBeInTheDocument();
    expect(mic).not.toHaveAttribute('aria-pressed', 'true');
  });
});
