import type { ScreenBounds } from "./mouseController";

export type ScreenPoint = { x: number; y: number };

export function toOverlayPoint(point: ScreenPoint, display: ScreenBounds): ScreenPoint {
  return { x: point.x - display.x, y: point.y - display.y };
}
