import { describe, expect, it } from "vitest";

import {
  createIntentFeedbackState,
  intentFeedbackCounts,
  labelIntentEvent,
  parseIntentFeedback,
  recordIntentFrame,
  serializeIntentFeedback,
  type IntentFeedbackFrame,
} from "./intentFeedback";

const frame = (t: number, clicked = false): IntentFeedbackFrame => ({
  t,
  evidence: {
    contact: !clicked,
    separated: clicked,
    blockingReason: clicked ? "image" : "none",
    cursor: { x: 0.5, y: 0.4, z: 0 },
    motionCursor: { x: 0.5, y: 0.4, z: 0 },
    suppressed: false,
  },
  clicked,
  pinchRatio: clicked ? 0.5 : 0.25,
});

describe("真实点击意图反馈", () => {
  it("点击事件默认未标注，绝不自动当成正确点击", () => {
    let state = createIntentFeedbackState();
    state = recordIntentFrame(state, frame(0));
    state = recordIntentFrame(state, frame(16));
    state = recordIntentFrame(state, frame(32, true), { x: 0.48, y: 0.39 });

    expect(state.events).toHaveLength(1);
    expect(state.events[0]).toMatchObject({
      label: "unlabeled",
      clickedAt: 32,
      clickCursor: { x: 0.48, y: 0.39 },
    });
    expect(intentFeedbackCounts(state.events)).toEqual({ intentional: 0, falsePositive: 0, unlabeled: 1 });
  });

  it("用户可明确标记误触或正确点击，未知编号不会改动数据", () => {
    let state = recordIntentFrame(createIntentFeedbackState(), frame(32, true), { x: 0.5, y: 0.4 });
    const id = state.events[0]!.id;
    state = labelIntentEvent(state, id, "false-positive");
    expect(state.events[0]?.label).toBe("false-positive");
    expect(labelIntentEvent(state, "missing", "intentional")).toBe(state);
  });

  it("只保留有限事件和点击附近的有限数值轨迹", () => {
    let state = createIntentFeedbackState({ maxEvents: 3, maxFramesPerEvent: 6, preClickMs: 40, postClickMs: 20 });
    for (let index = 0; index < 5; index += 1) {
      state = recordIntentFrame(state, frame(index * 100, true), { x: 0.5, y: 0.4 });
    }
    expect(state.events).toHaveLength(3);
    expect(state.events[0]?.clickedAt).toBe(200);
    expect(state.events.every((event) => event.frames.length <= 6)).toBe(true);
  });

  it("持久化不含图片且损坏数据安全恢复为空", () => {
    const state = recordIntentFrame(createIntentFeedbackState(), frame(32, true), { x: 0.5, y: 0.4 });
    const serialized = serializeIntentFeedback(state.events);
    const restored = parseIntentFeedback(serialized);

    expect(restored).toHaveLength(1);
    expect(serialized).not.toContain("data:image");
    expect(parseIntentFeedback("{broken")).toEqual([]);
    expect(parseIntentFeedback(JSON.stringify({ version: 99, events: [] }))).toEqual([]);
  });
});

