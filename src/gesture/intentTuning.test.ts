import { describe, expect, it } from "vitest";

import type { IntentFeedbackEvent, IntentFeedbackFrame, IntentLabel } from "./intentFeedback";
import { analyzeIntentFeedback } from "./intentTuning";
import { DEFAULT_PINCH_CLICK_CONFIG } from "./pinchClickStateMachine";

const makeEvent = (id: string, label: IntentLabel, firstContactSpeed: number): IntentFeedbackEvent => {
  const startX = 0.3;
  const contactX = startX + firstContactSpeed * 0.016;
  const makeFrame = (
    t: number,
    contact: boolean,
    separated: boolean,
    x: number,
  ): IntentFeedbackFrame => ({
    t,
    clicked: t === 64,
    pinchRatio: contact ? 0.25 : 0.55,
    evidence: {
      contact,
      separated,
      blockingReason: contact ? "none" : "image",
      cursor: { x, y: 0.4, z: 0 },
      motionCursor: { x, y: 0.4, z: 0 },
      suppressed: false,
    },
  });
  return {
    id,
    clickedAt: 64,
    clickCursor: { x: startX, y: 0.4 },
    label,
    frames: [
      makeFrame(0, false, true, startX),
      makeFrame(16, true, false, contactX),
      makeFrame(32, true, false, contactX),
      makeFrame(48, false, true, contactX),
      makeFrame(64, false, true, contactX),
    ],
  };
};

describe("真实意图离线调优", () => {
  it("样本不足时拒绝制造看似精确的建议", () => {
    const report = analyzeIntentFeedback([
      makeEvent("i1", "intentional", 0.5),
      makeEvent("f1", "false-positive", 2.6),
    ], DEFAULT_PINCH_CLICK_CONFIG);

    expect(report.recommendation).toMatchObject({ safe: false, config: null, reason: "真实标签不足" });
  });

  it("离线重放优先降低误触并保留正确点击", () => {
    const events = [
      makeEvent("i1", "intentional", 0.4),
      makeEvent("i2", "intentional", 0.5),
      makeEvent("i3", "intentional", 0.6),
      makeEvent("f1", "false-positive", 2.6),
      makeEvent("f2", "false-positive", 2.8),
    ];
    const report = analyzeIntentFeedback(events, DEFAULT_PINCH_CLICK_CONFIG);

    expect(report.baseline).toMatchObject({ falsePositiveClicks: 2, intentionalClicks: 3 });
    expect(report.recommendation.safe).toBe(true);
    expect(report.recommendation.config?.maxCursorSpeed).toBeLessThan(2.6);
    expect(report.recommendation.predicted).toMatchObject({ falsePositiveClicks: 0, intentionalClicks: 3 });
  });

  it("未标注事件完全不参与建议", () => {
    const events = [
      makeEvent("i1", "intentional", 0.4), makeEvent("i2", "intentional", 0.5),
      makeEvent("i3", "intentional", 0.6), makeEvent("f1", "false-positive", 2.6),
      makeEvent("f2", "false-positive", 2.8), makeEvent("u1", "unlabeled", 5),
    ];
    const report = analyzeIntentFeedback(events, DEFAULT_PINCH_CLICK_CONFIG);

    expect(report.labelledEvents).toBe(5);
    expect(report.unlabelledEvents).toBe(1);
  });
});

