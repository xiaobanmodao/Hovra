import { describe, expect, it } from "vitest";

import type { PinchProbabilityResult } from "./pinchProbability";
import { PinchTemporalRecognizer } from "./pinchTemporalRecognizer";

const result = (
  probability: number,
  worldQuality = 1,
  safetyGatePassed = probability >= 0.72,
): PinchProbabilityResult => ({
  probability,
  entryThreshold: 0.72,
  worldQuality,
  safetyGatePassed,
  approachObserved: true,
  blockingReason: safetyGatePassed ? "none" : "depth",
});

describe("PinchTemporalRecognizer", () => {
  it("activates after two agreeing frames in a three-frame high-quality window", () => {
    const recognizer = new PinchTemporalRecognizer();

    expect(recognizer.update(result(0.9), 0, true)).toMatchObject({
      phase: "candidate",
      enterVotes: 1,
      requiredVotes: 2,
    });
    recognizer.update(result(0.5), 16, true);
    expect(recognizer.update(result(0.9), 32, true)).toMatchObject({
      phase: "active",
      activated: true,
      enterVotes: 2,
      requiredVotes: 2,
    });
  });

  it("requires three agreeing frames when world quality is low", () => {
    const recognizer = new PinchTemporalRecognizer();

    recognizer.update(result(0.9, 0), 0, true);
    recognizer.update(result(0.9, 0), 16, true);
    expect(recognizer.update(result(0.5, 0, false), 32, true).phase).toBe("candidate");
    expect(recognizer.update(result(0.9, 0), 48, true)).toMatchObject({
      phase: "active",
      enterVotes: 3,
      requiredVotes: 3,
    });
  });

  it("ignores stale frames instead of counting them as votes", () => {
    const recognizer = new PinchTemporalRecognizer();

    recognizer.update(result(0.9), 0, true);
    expect(recognizer.update(result(0.9), 100, false)).toMatchObject({
      phase: "candidate",
      enterVotes: 1,
    });
  });

  it("clicks exactly once after two release votes", () => {
    const recognizer = new PinchTemporalRecognizer();
    recognizer.update(result(0.9), 0, true);
    recognizer.update(result(0.9), 16, true);

    expect(recognizer.update(result(0.2, 1, false), 32, true).clicked).toBe(false);
    recognizer.update(result(0.8), 48, true);
    expect(recognizer.update(result(0.2, 1, false), 64, true)).toMatchObject({
      phase: "cooldown",
      clicked: true,
    });
    expect(recognizer.update(result(0.2, 1, false), 80, true).clicked).toBe(false);
    expect(recognizer.update(result(0.2, 1, false), 144, true).phase).toBe("neutral");
  });

  it("never clicks when a candidate releases before activation", () => {
    const recognizer = new PinchTemporalRecognizer();

    recognizer.update(result(0.9), 0, true);
    recognizer.update(result(0.2, 1, false), 16, true);
    const output = recognizer.update(result(0.2, 1, false), 32, true);

    expect(output.clicked).toBe(false);
    expect(output.phase).toBe("neutral");
  });

  it("cancels a lost active pinch without clicking", () => {
    const recognizer = new PinchTemporalRecognizer();
    recognizer.update(result(0.9), 0, true);
    recognizer.update(result(0.9), 16, true);

    expect(recognizer.update(null, 32, false).phase).toBe("lost");
    expect(recognizer.update(null, 168, false)).toMatchObject({
      phase: "lost",
      clicked: false,
    });
    expect(recognizer.update(result(0.2, 1, false), 184, true).clicked).toBe(false);
  });

  it("resets safely when timestamps move backwards", () => {
    const recognizer = new PinchTemporalRecognizer();
    recognizer.update(result(0.9), 32, true);

    const output = recognizer.update(result(0.9), 16, true);

    expect(output.phase).toBe("candidate");
    expect(output.enterVotes).toBe(1);
  });
});
