import type { Landmark } from "../types";

export type SyntheticGesture = "tracking" | "left" | "right" | "double" | "scroll" | "open-palm";

export type SyntheticHandOptions = {
  scale?: number;
  rotation?: number;
  translateX?: number;
  translateY?: number;
  cursor?: { x: number; y: number };
};

const extendedHand = (): Landmark[] => [
  { x: 0, y: 0.6, z: 0 },
  { x: -0.2, y: 0.4, z: 0 }, { x: -0.3, y: 0.25, z: 0 },
  { x: -0.32, y: 0.05, z: 0 }, { x: -0.25, y: -0.1, z: 0 },
  { x: -0.18, y: 0.05, z: 0 }, { x: -0.2, y: -0.2, z: 0 },
  { x: -0.2, y: -0.45, z: 0 }, { x: -0.2, y: -0.7, z: 0 },
  { x: 0, y: 0, z: 0 }, { x: 0, y: -0.3, z: 0 },
  { x: 0, y: -0.58, z: 0 }, { x: 0, y: -0.84, z: 0 },
  { x: 0.17, y: 0.06, z: 0 }, { x: 0.18, y: -0.2, z: 0 },
  { x: 0.18, y: -0.44, z: 0 }, { x: 0.18, y: -0.64, z: 0 },
  { x: 0.31, y: 0.14, z: 0 }, { x: 0.34, y: -0.08, z: 0 },
  { x: 0.36, y: -0.27, z: 0 }, { x: 0.38, y: -0.43, z: 0 },
];

export function makeGestureHand(
  gesture: SyntheticGesture,
  options: SyntheticHandOptions = {},
): Landmark[] {
  const hand = extendedHand();

  if (gesture === "tracking") {
    curlFinger(hand, 5, 6, 7, 8, -0.12);
    curlFinger(hand, 9, 10, 11, 12, 0.02);
    curlFinger(hand, 13, 14, 15, 16, 0.16);
    curlFinger(hand, 17, 18, 19, 20, 0.3);
  } else if (gesture === "scroll") {
    hand[14] = { x: 0.18, y: -0.06, z: 0 };
    hand[15] = { x: 0.09, y: 0.04, z: 0 };
    hand[16] = { x: 0.17, y: 0.08, z: 0 };
    hand[18] = { x: 0.32, y: 0.02, z: 0 };
    hand[19] = { x: 0.25, y: 0.12, z: 0 };
    hand[20] = { x: 0.31, y: 0.16, z: 0 };
  } else if (gesture !== "open-palm") {
    curlFinger(hand, 5, 6, 7, 8, -0.12);
    curlFinger(hand, 9, 10, 11, 12, 0.02);
    curlFinger(hand, 13, 14, 15, 16, 0.16);
    curlFinger(hand, 17, 18, 19, 20, 0.3);
    const targetIndex = gesture === "left" ? 8 : gesture === "right" ? 12 : 16;
    hand[targetIndex] = { x: hand[4]!.x + 0.025, y: hand[4]!.y, z: 0 };
  }

  const scale = options.scale ?? 0.3;
  const rotation = options.rotation ?? 0;
  let transformed = transform(
    hand,
    scale,
    rotation,
    options.translateX ?? 0.5,
    options.translateY ?? 0.5,
  );
  if (options.cursor) {
    const index = transformed[8]!;
    transformed = transformed.map((point) => ({
      x: point.x + options.cursor!.x - index.x,
      y: point.y + options.cursor!.y - index.y,
      z: point.z,
    }));
  }
  return transformed;
}

function curlFinger(
  hand: Landmark[],
  mcp: number,
  pip: number,
  dip: number,
  tip: number,
  x: number,
): void {
  const base = hand[mcp]!;
  hand[pip] = { x: base.x + 0.09, y: base.y + 0.02, z: 0 };
  hand[dip] = { x: x + 0.08, y: base.y + 0.12, z: 0 };
  hand[tip] = { x, y: base.y + 0.18, z: 0 };
}

function transform(
  hand: Landmark[],
  scale: number,
  rotation: number,
  translateX: number,
  translateY: number,
): Landmark[] {
  const cosine = Math.cos(rotation);
  const sine = Math.sin(rotation);
  return hand.map((point) => ({
    x: translateX + scale * (point.x * cosine - point.y * sine),
    y: translateY + scale * (point.x * sine + point.y * cosine),
    z: (point.z ?? 0) * scale,
  }));
}
