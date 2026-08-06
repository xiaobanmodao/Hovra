import { describe, expect, it } from "vitest";

import type { GestureOutput } from "./types";
import {
  STABILITY_PROTOCOL,
  advanceStabilitySession,
  cancelStabilitySession,
  createStabilitySession,
  type StabilityObservation,
} from "./stabilityTest";

const output = (overrides: Partial<GestureOutput["diagnostics"]> = {}, click = false): GestureOutput => ({
  state: "tracking",
  cursor: { x: 0.5, y: 0.5, z: 0 },
  click,
  rightClick: false,
  doubleClick: false,
  scrollY: 0,
  dragStart: false,
  dragEnd: false,
  phase: click ? "active" : "neutral",
  candidate: null,
  lockedGesture: click ? "left" : null,
  confirmationProgress: click ? 1 : 0,
  longPressProgress: 0,
  diagnostics: {
    timestampMs: 0, quality: 1, trackingSource: "observed", trackingQuality: 1,
    rejectedLandmarkCount: 0, palmScale: 0.2, screenPinchGap: 0.1,
    imageAspectRatio: 16 / 9, worldPalmScale: null, palmFacingScore: null,
    leftPinchRatio: 0.6, worldLeftPinchRatio: null, pinchDepthReliable: true,
    rightPinchRatio: null, doublePinchRatio: null, openPalmScore: 0,
    scrollPoseScore: null, pinchProbability: 0, pinchImageDepthGap: 0.1,
    pinchWorldQuality: 0, pinchQualityReasons: [], pinchBlockingReason: "image",
    pinchEnterVotes: 0, pinchRequiredVotes: 2, effectiveFps: 30, inferenceMs: 6,
    pinchModelMode: "mediapipe", visionPinchRatio: null, visionConfidence: null,
    visionAgeMs: null, visionInferenceMs: null, modelAgreement: null,
    pinchScreenRatio: 0.6, pinchSpatialRatio: 0.6, pinchEnterRatio: 0.33,
    pinchExitRatio: 0.5, ...overrides,
  },
});

const observation = (nowMs: number, overrides: Partial<StabilityObservation> = {}): StabilityObservation => ({
  nowMs,
  output: output(),
  handPresent: true,
  pageFocused: true,
  ...overrides,
});

describe("stability test protocol", () => {
  it("包含五个方向各四次捏合和四类负样本", () => {
    const contacts = STABILITY_PROTOCOL.filter((step) => step.label === "contact");
    expect(contacts).toHaveLength(20);
    expect(contacts.reduce<Record<string, number>>((counts, step) => ({
      ...counts, [step.scenario]: (counts[step.scenario] ?? 0) + 1,
    }), {})).toEqual({ front: 4, left: 4, right: 4, near: 4, far: 4 });
    expect([...new Set(STABILITY_PROTOCOL.filter((step) => step.phase === "negative").map((step) => step.scenario))])
      .toEqual(["overlap", "fist", "open-palm", "fast-move"]);
  });

  it("准备阶段只有累计十秒有效帧后才进入动作测试", () => {
    let session = createStabilitySession(0);
    session = advanceStabilitySession(session, observation(0));
    session = advanceStabilitySession(session, observation(9_999));
    expect(session.phase).toBe("readiness");
    session = advanceStabilitySession(session, observation(10_000));
    expect(session.phase).toBe("positive");
  });

  it("坏帧暂停计时且不记录样本", () => {
    let session = createStabilitySession(0);
    session = advanceStabilitySession(session, observation(0));
    const next = advanceStabilitySession(session, observation(5_000, { handPresent: false }));
    expect(next.stepElapsedMs).toBe(session.stepElapsedMs);
    expect(next.samples).toHaveLength(session.samples.length);
    expect(next.quality.message).toBe("手掌未完整进入画面");
  });

  it("为有效帧记录当前步骤标签和点击", () => {
    let session = createStabilitySession(0);
    session = { ...session, phase: "positive", stepIndex: 0, lastObservedAt: 0 };
    session = advanceStabilitySession(session, observation(16, { output: output({}, true) }));
    expect(session.samples.at(-1)).toMatchObject({ label: "separate", clicked: true, scenario: "front" });
  });

  it("取消后停止采样", () => {
    const cancelled = cancelStabilitySession(createStabilitySession(0));
    expect(advanceStabilitySession(cancelled, observation(16))).toEqual(cancelled);
  });
});
