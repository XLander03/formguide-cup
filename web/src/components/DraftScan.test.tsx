import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DraftScan, SCAN_STEP_MS } from './DraftScan';

describe('DraftScan', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('reveals checks one by one, then lets a warning be fixed or dismissed', () => {
    const onFix = vi.fn();
    render(
      <DraftScan values={{ applicant_full_name: 'Ananya Reddy', pan_number: 'ABCDE1234F' }} onFix={onFix}>
        <p>draft</p>
      </DraftScan>,
    );
    expect(screen.getByText('Checking your draft…')).toBeInTheDocument();
    for (let i = 0; i < 3; i++) act(() => vi.advanceTimersByTime(SCAN_STEP_MS));
    expect(screen.getByText('Draft checked')).toBeInTheDocument();
    expect(screen.getByText(/0 passed · 2 worth a look/)).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Fix it' })[0]);
    expect(onFix).toHaveBeenCalledWith('pan_number');
    fireEvent.click(screen.getAllByRole('button', { name: 'It’s right' })[0]);
    expect(screen.getByText(/1 worth a look/)).toBeInTheDocument();
    expect(screen.getByText('You confirmed this is right.')).toBeInTheDocument();
  });

  it('shows nothing but the draft when no check can judge it', () => {
    render(
      <DraftScan values={{}} onFix={() => {}}>
        <p>draft</p>
      </DraftScan>,
    );
    expect(screen.queryByLabelText('Draft checks')).not.toBeInTheDocument();
    expect(screen.getByText('draft')).toBeInTheDocument();
  });
});
