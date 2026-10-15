import { describe, expect, it } from 'vitest';
import { clientToPdf, moveBox, pdfBoxToScreen, resizeBox, snapBox } from './geometry';

const page = { width: 100, height: 200 };

describe('pdf box geometry', () => {
  it('converts bottom-left PDF points to a top-left screen box', () => {
    const screen = pdfBoxToScreen({ x: 10, y: 20, w: 30, h: 40 }, page, 50, 100);
    expect(screen).toEqual({ x: 5, y: 70, w: 15, h: 20 });
  });

  it('maps the top of the view to the top of the page', () => {
    const point = clientToPdf(10, 0, { left: 0, top: 0, width: 100, height: 200 }, { width: 50, height: 80 });
    expect(point).toEqual({ x: 5, y: 80 });
  });

  it('snaps to the grid and stays inside the page', () => {
    expect(snapBox({ x: 6, y: 6, w: 10, h: 10 }, { width: 100, height: 100 })).toEqual({
      x: 8,
      y: 8,
      w: 16,
      h: 16,
    });
    expect(snapBox({ x: 90, y: 90, w: 40, h: 40 }, { width: 100, height: 100 })).toEqual({
      x: 60,
      y: 60,
      w: 40,
      h: 40,
    });
  });

  it('moves and resizes with the same snap', () => {
    const moved = moveBox({ x: 10, y: 10, w: 20, h: 20 }, { x: 33, y: 34 }, 0, 0, { width: 200, height: 200 });
    expect(moved.x).toBe(32);
    expect(moved.y).toBe(36);
    const resized = resizeBox(10, 80, { x: 55, y: 40 }, { width: 200, height: 200 });
    expect(resized).toEqual({ x: 12, y: 40, w: 44, h: 40 });
  });
});
