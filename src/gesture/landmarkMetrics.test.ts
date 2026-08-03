import { describe, expect, it } from "vitest";

import { thumbIndexDistance } from "./landmarkMetrics";
import { INDEX_FINGER_TIP, THUMB_TIP, type Landmark } from "./types";

const landmarks = (): Landmark[] =>
  Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));

describe("thumbIndexDistance", () => {
  it("measures the three-dimensional thumb/index distance", () => {
    const hand = landmarks();
    hand[THUMB_TIP] = { x: 0.2, y: 0.3, z: 0 };
    hand[INDEX_FINGER_TIP] = { x: 0.24, y: 0.3, z: 0.03 };

    expect(thumbIndexDistance(hand)).toBeCloseTo(0.05);
  });

  it("returns null when either pinch landmark is unavailable", () => {
    const hand = landmarks();
    hand.length = INDEX_FINGER_TIP;

    expect(thumbIndexDistance(hand)).toBeNull();
  });
});
