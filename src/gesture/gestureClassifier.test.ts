import { describe, expect, it } from "vitest";

import type { GestureFeatures } from "./gestureFeatures";
import { GestureClassifier } from "./gestureClassifier";

const features = (overrides: Partial<GestureFeatures> = {}): GestureFeatures => {
  const leftPinchRatio = overrides.leftPinchRatio ?? 0.8;
  return {
    palmScale: 0.3,
    leftPinchRatio,
    worldLeftPinchRatio: overrides.worldLeftPinchRatio ?? leftPinchRatio,
    pinchDepthReliable: overrides.pinchDepthReliable ?? true,
    rightPinchRatio: 0.8,
    doublePinchRatio: 0.8,
    fingerExtension: { index: 0.4, middle: 0.4, ring: 0.4, pinky: 0.4 },
    openPalmScore: 0.4,
    scrollPoseScore: 0.4,
    ...overrides,
  };
};

describe("GestureClassifier", () => {
  it("leaves every pinch pose to the adaptive temporal recognizer", () => {
    const classifier = new GestureClassifier(0.5);
    const result = classifier.classify(features({
      leftPinchRatio: 0.22,
      rightPinchRatio: 0.16,
      doublePinchRatio: 0.2,
    }));

    expect(result).toBeNull();
  });

  it("uses hysteresis only for a locked open palm", () => {
    const classifier = new GestureClassifier(0.5);
    const ambiguous = features({ openPalmScore: 0.72, leftPinchRatio: 0.1 });

    expect(classifier.classify(ambiguous, "open-palm")?.kind).toBe("open-palm");
    expect(classifier.classify(features({ openPalmScore: 0.6 }), "open-palm"))
      .toBeNull();
  });

  it("ignores right, double, and scroll poses while retaining open-palm stop", () => {
    const classifier = new GestureClassifier(0.5);

    expect(classifier.classify(features({ rightPinchRatio: 0.1 }))).toBeNull();
    expect(classifier.classify(features({ doublePinchRatio: 0.1 }))).toBeNull();
    expect(classifier.classify(features({ scrollPoseScore: 0.95 }))).toBeNull();
    expect(classifier.classify(features({ openPalmScore: 0.83 }))?.kind).toBe("open-palm");
  });
});
