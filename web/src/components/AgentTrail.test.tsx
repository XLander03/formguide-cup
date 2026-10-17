import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentTrail, TRAIL_STEP_MS } from './AgentTrail';

const STEPS = [
  { key: 'lang', text: 'Heard Hindi', tone: 'info' as const },
  { key: 'found', text: 'Found Full name', tone: 'ok' as const },
];

describe('AgentTrail', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('reveals steps one by one, replays on a new turn, and collapses', () => {
    const { rerender } = render(<AgentTrail steps={STEPS} turn={1} />);
    expect(screen.getByText('Thinking it through…')).toBeInTheDocument();
    for (let i = 0; i < 2; i++) act(() => vi.advanceTimersByTime(TRAIL_STEP_MS));
    expect(screen.getByText('How I got this · 2 steps')).toBeInTheDocument();
    expect(screen.getByText('Found Full name')).toBeInTheDocument();

    rerender(<AgentTrail steps={STEPS} turn={2} />);
    expect(screen.getByText('Thinking it through…')).toBeInTheDocument();
    expect(screen.queryByText('Found Full name')).not.toBeInTheDocument();
    for (let i = 0; i < 2; i++) act(() => vi.advanceTimersByTime(TRAIL_STEP_MS));

    fireEvent.click(screen.getByRole('button', { expanded: true }));
    expect(screen.queryByText('Heard Hindi')).not.toBeInTheDocument();
  });
});
