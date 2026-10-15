import type { PageSize } from './geometry';

/** Page image drawn with the existing theme colors. */
export function paperPageDataUrl(pageNumber: number, page: PageSize): string {
  const width = Math.max(1, Math.round(page.width));
  const height = Math.max(1, Math.round(page.height));
  const rules = Array.from({ length: 12 }, (_, index) => {
    const y = 140 + index * 48;
    return `<line x1="48" y1="${y}" x2="${width - 48}" y2="${y}" stroke="oklch(25% 0.05 257 / 18%)" stroke-width="1"/>`;
  }).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect width="100%" height="100%" fill="oklch(98.5% 0.008 91)"/>
    <rect x="36" y="36" width="${width - 72}" height="${height - 72}" fill="none" stroke="oklch(25% 0.05 257)" stroke-width="1.5"/>
    <text x="48" y="72" fill="oklch(47% 0.095 176)" font-family="Georgia, serif" font-size="22">Page ${pageNumber}</text>
    <text x="48" y="98" fill="oklch(50% 0.035 257)" font-family="Arial, sans-serif" font-size="12">Fields vary by bank.</text>
    ${rules}
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
