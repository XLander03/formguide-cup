import { describe, expect, it } from 'vitest';
import { layoutText } from './publishedPdfFill';

/** Helvetica-ish: half the font size per character. */
const widthOf = (text: string, size: number) => text.length * size * 0.5;

describe('layoutText', () => {
  it('prints a short cell row at a readable size, not 75% of a thin box', () => {
    const [line] = layoutText('Bengaluru', { x: 50, y: 100, w: 380, h: 8.7 }, widthOf);
    expect(line.size).toBe(8);
    expect(line.x).toBe(52);
  });

  it('shrinks a single row only when the value is too wide', () => {
    const [line] = layoutText('priya.sharma.demo@example.com', { x: 0, y: 0, w: 80, h: 12 }, widthOf);
    expect(line.size).toBeLessThan(8);
    expect(widthOf('priya.sharma.demo@example.com', line.size)).toBeLessThanOrEqual(77);
  });

  it('starts a tall address block on its first row', () => {
    const box = { x: 57, y: 400, w: 537, h: 35 };
    const lines = layoutText('14, Lake View Apartments, 3rd Cross', box, widthOf);
    expect(lines).toHaveLength(1);
    expect(lines[0].y).toBeGreaterThan(box.y + box.h / 2);
  });

  it('wraps a long address onto the next rows instead of shrinking it', () => {
    const box = { x: 0, y: 0, w: 150, h: 35 };
    const text = '14, Lake View Apartments, 3rd Cross, Indiranagar 2nd Stage';
    const lines = layoutText(text, box, widthOf);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.map((l) => l.text).join(' ')).toBe(text);
    expect(lines[0].size).toBeGreaterThanOrEqual(8);
    expect(lines[1].y).toBeLessThan(lines[0].y);
    for (const l of lines) expect(widthOf(l.text, l.size)).toBeLessThanOrEqual(box.w - 3);
  });

  it('keeps the value on one line at the smallest size when nothing fits', () => {
    const lines = layoutText('ABCDEFGHIJKLMNOPQRSTUVWXYZ', { x: 0, y: 0, w: 20, h: 8 }, widthOf);
    expect(lines).toHaveLength(1);
    expect(lines[0].size).toBe(5);
  });
});
