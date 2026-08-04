import { describe, expect, it } from "vitest";

import type { Landmark } from "./types";
import { buildHandGeometry } from "./handGeometry";

const baseHand = (): Landmark[] => [
  { x: 0, y: 0.6, z: 0 },
  { x: -0.22, y: 0.42, z: 0 }, { x: -0.3, y: 0.25, z: 0 },
  { x: -0.34, y: 0.08, z: 0 }, { x: -0.27, y: -0.08, z: 0 },
  { x: -0.18, y: 0.05, z: 0 }, { x: -0.2, y: -0.22, z: 0 },
  { x: -0.2, y: -0.48, z: 0 }, { x: -0.2, y: -0.72, z: 0 },
  { x: 0, y: 0, z: 0 }, { x: 0, y: -0.3, z: 0 },
  { x: 0, y: -0.58, z: 0 }, { x: 0, y: -0.84, z: 0 },
  { x: 0.17, y: 0.06, z: 0 }, { x: 0.18, y: -0.2, z: 0 },
  { x: 0.18, y: -0.44, z: 0 }, { x: 0.18, y: -0.64, z: 0 },
  { x: 0.31, y: 0.14, z: 0 }, { x: 0.34, y: -0.08, z: 0 },
  { x: 0.36, y: -0.27, z: 0 }, { x: 0.38, y: -0.43, z: 0 },
];

const transformHand = (
  hand: Landmark[],
  scale: number,
  rotation: number,
  tx: number,
  ty: number,
): Landmark[] => hand.map((point) => ({
  x: tx + scale * (point.x * Math.cos(rotation) - point.y * Math.sin(rotation)),
  y: ty + scale * (point.x * Math.sin(rotation) + point.y * Math.cos(rotation)),
  z: (point.z ?? 0) * scale,
}));

describe("buildHandGeometry", () => {
  it("keeps normalized fingertip distances invariant across translation, scale, and rotation", () => {
    const base = buildHandGeometry(baseHand())!;
    const transformed = buildHandGeometry(transformHand(baseHand(), 1.8, Math.PI / 3, 4, -2))!;

    expect(transformed.pinchRatios.left).toBeCloseTo(base.pinchRatios.left, 6);
    expect(transformed.pinchRatios.right).toBeCloseTo(base.pinchRatios.right, 6);
    expect(transformed.pinchRatios.double).toBeCloseTo(base.pinchRatios.double, 6);
    expect(transformed.scale).toBeCloseTo(base.scale * 1.8, 6);
  });

  it("projects movement onto the palm-local axes after image rotation", () => {
    const baseHandValue = baseHand();
    const moved = transformHand(baseHandValue, 1, 0, 0, -0.1);
    const base = buildHandGeometry(baseHandValue)!;
    const movedGeometry = buildHandGeometry(moved)!;
    const baseDelta = base.projectDelta({
      x: movedGeometry.origin.x - base.origin.x,
      y: movedGeometry.origin.y - base.origin.y,
      z: 0,
    });

    const rotatedHand = transformHand(baseHandValue, 1, Math.PI / 2, 0, 0);
    const rotatedMoved = transformHand(moved, 1, Math.PI / 2, 0, 0);
    const rotated = buildHandGeometry(rotatedHand)!;
    const rotatedMovedGeometry = buildHandGeometry(rotatedMoved)!;
    const rotatedDelta = rotated.projectDelta({
      x: rotatedMovedGeometry.origin.x - rotated.origin.x,
      y: rotatedMovedGeometry.origin.y - rotated.origin.y,
      z: 0,
    });

    expect(baseDelta.y).toBeGreaterThan(0);
    expect(rotatedDelta.y).toBeCloseTo(baseDelta.y, 6);
  });

  it("rejects incomplete, non-finite, and degenerate hands", () => {
    expect(buildHandGeometry(baseHand().slice(0, 20))).toBeNull();
    const invalid = baseHand();
    invalid[8].x = Number.NaN;
    expect(buildHandGeometry(invalid)).toBeNull();
    expect(buildHandGeometry(Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 })))).toBeNull();
  });
});
