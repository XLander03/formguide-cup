import { useEffect, useState } from 'react';

export function useMinWidth(px: number): boolean {
  const query = `(min-width: ${px}px)`;
  const read = () => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(query).matches;
  const [matches, setMatches] = useState(read);

  useEffect(() => {
    if (!window.matchMedia) return;
    const media = window.matchMedia(query);
    const onChange = () => setMatches(media.matches);
    onChange();
    media.addEventListener?.('change', onChange);
    return () => media.removeEventListener?.('change', onChange);
  }, [query]);

  return matches;
}
