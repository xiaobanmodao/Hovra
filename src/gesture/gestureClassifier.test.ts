import { describe, expect, it } from "vitest";

import type { GestureFeatures } from "./gestureFeatures";
import { GestureClassifier } from "./gestureClassifier";

const features = (overrides: Partial<GestureFeatures> = {}): GestureFeatures => ({
  palmScale: 0.3,
  leftPinchRatio: 0.8,
  rightPinchRatio: 0.8,
  doublePinchRatio: 0.8,
  fingerExtension: { index: 0.4, middle: 0.4, ring: 0.4, pinky: 0.4 },
  openPalmScore: 0.4,
  scrollPoseScore: 0.4,
  ...overrides,
});

describe("GestureClassifier", () => {
  it("selects only the strongest qualifying pinch before lock", () => {
    const classifier = new GestureClassifier(0.5);
    const result = classifier.classify(features({
      leftPinchRatio: 0.22,
      rightPinchRatio: 0.16,
      doublePinchRatio: 0.2,
    }));

    expect(result?.kind).toBe("right");
  });

  it("uses the wider exit threshold and never switches while locked", () => {
    const classifier = new GestureClassifier(0.5);
    const ambiguous = features({ leftPinchRatio: 0.36, rightPinchRatio: 0.1 });

    expect(classifier.classify(ambiguous, "left")?.kind).toBe("left");
    expect(classifier.classify(features({ leftPinchRatio: 0.42, rightPinchRatio: 0.1 }), "left"))
      .toBeNull();
  });

  it("recognizes scroll and open-palm poses only above stable thresholds", () => {
    const classifier = new GestureClassifier(0.5);

    expect(classifier.classify(features({ scrollPoseScore: 0.76 }))?.kind).toBe("scroll");
    expect(classifier.classify(features({ openPalmScore: 0.83 }))?.kind).toBe("open-palm");
    expect(classifier.classify(features({ scrollPoseScore: 0.74, openPalmScore: 0.81 }))).toBeNull();
  });
});
