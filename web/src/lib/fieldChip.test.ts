import { describe, expect, it } from 'vitest';
import { sourceChip } from './fieldChip';

describe('sourceChip', () => {
  it('labels only what the customer should notice, never scores or engines', () => {
    expect(sourceChip('gemini', { confidence: 1, confirmed: false })).toBeNull();
    expect(sourceChip('gemini', { confidence: 0.94, confirmed: false })).toBeNull();
    expect(sourceChip('heuristic-dev', undefined)).toBeNull();
    expect(sourceChip('gemini', { confidence: 0.6, confirmed: false })).toEqual({ text: 'please check', tone: 'unsure' });
    expect(sourceChip('gemini', { confidence: 0.6, confirmed: true })?.text).toBe('✓ you checked');
    expect(sourceChip('manual', undefined)?.text).toBe('typed');
    expect(sourceChip(undefined, undefined)).toBeNull();
  });
});
