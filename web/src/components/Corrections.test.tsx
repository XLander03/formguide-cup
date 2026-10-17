import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FormValues } from '../lib/types';
import { CORRECTION_MS, CorrectionToast, useVoiceCorrections } from './Corrections';

function Probe({ values, source }: { values: FormValues; source: Record<string, string> }) {
  const corrections = useVoiceCorrections(values, source, {});
  return <CorrectionToast corrections={corrections} label={(id) => (id === 'dob' ? 'Date of birth' : id)} />;
}

describe('correction toast', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('shows old → new after a spoken change, then fades out', () => {
    const { rerender } = render(<Probe values={{ dob: '1991-08-15' }} source={{ dob: 'gemini' }} />);
    expect(screen.queryByText('Corrected by voice')).not.toBeInTheDocument();
    rerender(<Probe values={{ dob: '1992-08-15' }} source={{ dob: 'gemini' }} />);
    expect(screen.getByText('Corrected by voice')).toBeInTheDocument();
    expect(screen.getByText('15 Aug 1991')).toHaveClass('line-through');
    expect(screen.getByText('15 Aug 1992')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(CORRECTION_MS + 10));
    expect(screen.queryByText('Corrected by voice')).not.toBeInTheDocument();
  });

  it('stays quiet when the customer types the change', () => {
    const { rerender } = render(<Probe values={{ dob: '1991-08-15' }} source={{ dob: 'gemini' }} />);
    rerender(<Probe values={{ dob: '1992-08-15' }} source={{ dob: 'manual' }} />);
    expect(screen.queryByText('Corrected by voice')).not.toBeInTheDocument();
  });
});
