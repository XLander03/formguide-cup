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
    expect(screen.getByRole('button', { name: /Tap and say what you need/i })).toBeInTheDocument();
  });

  it('selects the form from what was said', async () => {
    const user = userEvent.setup();
    renderJourney(1365);
    await user.click(await screen.findByRole('button', { name: /No mic\? Try a sample/ }));
    await user.click(screen.getByRole('button', { name: /सैलरी के लिए नया अकाउंट/ }));
    expect(screen.getByRole('button', { name: /Start filling Salary account/ })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /redo my KYC/ }));
    expect(screen.getByRole('button', { name: /Start filling Re-KYC/ })).toBeInTheDocument();
  });

  it('uses the microphone instead of a fake listening label', async () => {
    const user = userEvent.setup();
    renderJourney(1365);
    const mic = await screen.findByRole('button', { name: /Tap and say what you need/i });
    await user.click(mic);
    expect(await screen.findByText(/no microphone/i)).toBeInTheDocument();
    expect(screen.queryByText(/Speaking starts on the next step/i)).not.toBeInTheDocument();
  });
});
