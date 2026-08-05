import { describe, expect, it } from "vitest";

import { imageLandmarkDistance, thumbIndexDistance } from "./landmarkMetrics";
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

describe("imageLandmarkDistance", () => {
  it("ignores image depth when the two fingertips overlap on screen", () => {
    expect(imageLandmarkDistance(
      { x: 0.25, y: 0.4, z: -0.35 },
      { x: 0.25, y: 0.4, z: 0.35 },
      16 / 9,
    )).toBe(0);
  });

  it("corrects normalized x distance using the video aspect ratio", () => {
    const wide = imageLandmarkDistance(
      { x: 120 / 1920, y: 90 / 1080 },
      { x: 0, y: 0 },
      1920 / 1080,
    );
    const standard = imageLandmarkDistance(
      { x: 120 / 1440, y: 90 / 1080 },
      { x: 0, y: 0 },
      1440 / 1080,
    );

    expect(wide).toBeCloseTo(standard, 8);
  });

  it("uses a neutral aspect ratio when the supplied value is invalid", () => {
    expect(imageLandmarkDistance({ x: 0.2, y: 0 }, { x: 0, y: 0 }, Number.NaN)).toBeCloseTo(0.2);
    expect(imageLandmarkDistance({ x: 0.2, y: 0 }, { x: 0, y: 0 }, 0)).toBeCloseTo(0.2);
  });
});
