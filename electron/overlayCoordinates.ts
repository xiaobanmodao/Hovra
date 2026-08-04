import type { ScreenBounds } from "./mouseController";

export type ScreenPoint = { x: number; y: number };

export type OverlayBounds = ScreenPoint & { width: number; height: number };

export function toOverlayPoint(point: ScreenPoint, display: ScreenBounds): ScreenPoint {
  return { x: point.x - display.x, y: point.y - display.y };
}

export function cursorOverlayBounds(
  point: ScreenPoint,
  size: number,
): OverlayBounds {
  const roundedSize = Math.max(1, Math.round(size));
  const halfSize = roundedSize / 2;
  const systemX = Math.trunc(point.x);
  const systemY = Math.trunc(point.y);

  return {
    x: Math.round(systemX - halfSize),
    y: Math.round(systemY - halfSize),
    width: roundedSize,
    height: roundedSize,
  };
}
