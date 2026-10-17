import { describe, expect, it } from 'vitest';
import { extractEndpointUrls } from './extractClient';

describe('extract endpoints', () => {
  it('does not call /api/extract outside Vite dev, where hosting has no extract function', () => {
    expect(extractEndpointUrls({ dev: false, functionsUrl: '' })).toEqual([]);
  });

  it('uses the Vite middleware only while developing', () => {
    expect(extractEndpointUrls({ dev: true, functionsUrl: '' })).toEqual(['/api/extract']);
  });

  it('keeps an explicit functions URL ahead of the dev middleware', () => {
    expect(extractEndpointUrls({ dev: true, functionsUrl: 'https://example.test/fn/' })).toEqual([
      'https://example.test/fn/extract',
      '/api/extract',
    ]);
  });
});
