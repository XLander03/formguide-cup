import type { FieldRecord } from '../../../shared/forms/types';

export interface PageSize {
  width: number;
  height: number;
}

export interface ScreenBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const SNAP_PT = 4;
export const MIN_BOX = 16;

export type FieldBox = FieldRecord['box'];

export function clampBox(box: FieldBox, page: PageSize): FieldBox {
  const w = Math.min(Math.max(box.w, MIN_BOX), page.width);
  const h = Math.min(Math.max(box.h, MIN_BOX), page.height);
  const x = Math.min(Math.max(box.x, 0), page.width - w);
  const y = Math.min(Math.max(box.y, 0), page.height - h);
  return { x, y, w, h };
}

export function snapBox(box: FieldBox, page: PageSize): FieldBox {
  const snap = (value: number) => Math.round(value / SNAP_PT) * SNAP_PT;
  return clampBox({ x: snap(box.x), y: snap(box.y), w: snap(box.w), h: snap(box.h) }, page);
}

/** PDF points, bottom-left origin, to a top-left screen box. */
export function pdfBoxToScreen(box: FieldBox, page: PageSize, viewWidth: number, viewHeight: number): ScreenBox {
  return {
    x: (box.x / page.width) * viewWidth,
    y: ((page.height - box.y - box.h) / page.height) * viewHeight,
    w: (box.w / page.width) * viewWidth,
    h: (box.h / page.height) * viewHeight,
  };
}

export function clientToPdf(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
  page: PageSize,
): { x: number; y: number } {
  const x = ((clientX - rect.left) / rect.width) * page.width;
  const y = (1 - (clientY - rect.top) / rect.height) * page.height;
  return { x, y };
}

export function moveBox(
  box: FieldBox,
  pointer: { x: number; y: number },
  offsetX: number,
  offsetY: number,
  page: PageSize,
): FieldBox {
  return snapBox({ x: pointer.x - offsetX, y: pointer.y - offsetY, w: box.w, h: box.h }, page);
}

/** Resize from the screen bottom-right handle, which is the PDF bottom edge. */
export function resizeBox(
  left: number,
  top: number,
  pointer: { x: number; y: number },
  page: PageSize,
): FieldBox {
  return snapBox({ x: left, y: pointer.y, w: pointer.x - left, h: top - pointer.y }, page);
}

export function boxStyle(box: FieldBox, page: PageSize): { left: string; top: string; width: string; height: string } {
  const screen = pdfBoxToScreen(box, page, 100, 100);
  return {
    left: `${screen.x}%`,
    top: `${screen.y}%`,
    width: `${screen.w}%`,
    height: `${screen.h}%`,
  };
}
