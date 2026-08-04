import { describe, expect, it } from "vitest";

import type { PinchCalibrationSample } from "./pinchCalibration";
import {
  evaluatePinchCalibrationReadiness,
  medianPinchCalibrationSample,
} from "./pinchCalibrationReadiness";

const sample = (
  imageRatio: number,
  worldRatio: number,
  depthGap: number,
): PinchCalibrationSample => ({ imageRatio, worldRatio, depthGap });

const contact = sample(0.24, 0.23, 0.08);
const positives = Array(10).fill(contact);

describe("pinch calibration readiness", () => {
  it("blocks recording when no hand sample is available", () => {
    const result = evaluatePinchCalibrationReadiness({
      stage: "front",
      recentSamples: [],
      positives: [],
    });

    expect(result.state).toBe("blocked");
    expect(result.reason).toBe("no-hand");
    expect(result.title).toBe("未检测到完整手部");
    expect(result.stableFrames).toBe(0);
  });

  it("explains which contact distance prevents recording", () => {
    const result = evaluatePinchCalibrationReadiness({
      stage: "front",
      recentSamples: [sample(0.4, 0.23, 0.08)],
      positives: [],
    });

    expect(result.state).toBe("blocked");
    expect(result.reason).toBe("contact-image");
    expect(result.title).toBe("让拇指和食指真正接触");
    expect(result.checks.find((check) => check.key === "image")?.passed).toBe(false);
  });

  it("requires four consecutive stable contact frames before recording", () => {
    const stabilizing = evaluatePinchCalibrationReadiness({
      stage: "side",
      recentSamples: [contact, sample(0.245, 0.235, 0.082)],
      positives: [],
    });
    const ready = evaluatePinchCalibrationReadiness({
      stage: "side",
      recentSamples: [
        contact,
        sample(0.245, 0.235, 0.082),
        sample(0.238, 0.228, 0.078),
        sample(0.242, 0.232, 0.081),
      ],
      positives: [],
    });

    expect(stabilizing.state).toBe("stabilizing");
    expect(stabilizing.title).toBe("保持姿势稳定 2/4");
    expect(ready.state).toBe("ready");
    expect(ready.reason).toBe("ready");
    expect(ready.title).toBe("可以记录");
  });

  it("accepts a safely wider real contact so personal calibration is not limited by defaults", () => {
    const widerContact = sample(0.38, 0.42, 0.21);

    const result = evaluatePinchCalibrationReadiness({
      stage: "front",
      recentSamples: Array(4).fill(widerContact),
      positives: [],
    });

    expect(result.state).toBe("ready");
  });

  it.each([
    [sample(0.42, 0.55, 0.35), "negative-overlap", "让两指尖在画面中重合", "image"],
    [sample(0.25, 0.3, 0.35), "negative-world", "增加两指的实际空间距离", "world"],
    [sample(0.25, 0.55, 0.12), "negative-depth", "增加两指的前后距离", "depth"],
  ] as const)("rejects a false-overlap frame with reason %s", (current, reason, title, failedKey) => {
    const result = evaluatePinchCalibrationReadiness({
      stage: "negative",
      recentSamples: [current],
      positives,
    });

    expect(result.state).toBe("blocked");
    expect(result.reason).toBe(reason);
    expect(result.title).toBe(title);
    expect(result.checks.find((check) => check.key === failedKey)?.passed).toBe(false);
  });

  it("rejects individually valid false-overlap frames when the window is unstable", () => {
    const result = evaluatePinchCalibrationReadiness({
      stage: "negative",
      recentSamples: [
        sample(0.25, 0.33, 0.2),
        sample(0.25, 0.39, 0.24),
        sample(0.25, 0.42, 0.27),
        sample(0.25, 0.35, 0.22),
      ],
      positives,
    });

    expect(result.state).toBe("blocked");
    expect(result.reason).toBe("unstable");
    expect(result.title).toBe("动作波动过大，请保持不动");
    expect(result.checks.find((check) => check.key === "stability")?.passed).toBe(false);
  });

  it("uses the median frame values instead of the final frame", () => {
    expect(medianPinchCalibrationSample([
      sample(0.1, 0.8, 0.2),
      sample(0.2, 0.4, 0.4),
      sample(0.3, 0.6, 0.1),
      sample(0.9, 0.2, 0.3),
    ])).toEqual(sample(0.25, 0.5, 0.25));
  });
});
