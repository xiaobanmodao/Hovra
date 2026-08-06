import { describe, expect, it } from "vitest";

import { makeGestureHand } from "./fixtures/stable-gesture-sequences";
import {
  evaluateGestureEvents,
  runGestureRegression,
  type GestureRegressionCase,
} from "./gestureRegression";
import type { GestureTraceFrame, GestureTraceV5 } from "./gestureTrace";
import type { Landmark } from "./types";

const EMPTY_TRACE: GestureTraceV5 = { version: 5, frames: [] };

const clickCase = (): GestureRegressionCase => ({
  name: "短捏合",
  trace: EMPTY_TRACE,
  expectations: [{ event: "click", startMs: 80, endMs: 120 }],
});

const rawFrame = (
  t: number,
  landmarks: Landmark[] | null,
  storedEvents: GestureTraceFrame["events"] = [],
): GestureTraceFrame => ({
  t,
  landmarks,
  worldLandmarks: landmarks,
  quality: landmarks ? 1 : 0,
  features: null,
  phase: landmarks ? "neutral" : "lost",
  candidate: null,
  confirmationProgress: 0,
  lockedGesture: null,
  events: storedEvents,
});

describe("evaluateGestureEvents", () => {
  it("passes one event inside its independently specified time window", () => {
    expect(evaluateGestureEvents(clickCase(), [{ event: "click", t: 96 }])).toEqual({
      name: "短捏合",
      passed: true,
      events: [{ event: "click", t: 96 }],
      failures: [],
    });
  });

  it("matches a semantic right-click event independently from left click", () => {
    const testCase: GestureRegressionCase = {
      name: "右键短捏合",
      trace: EMPTY_TRACE,
      expectations: [{ event: "rightClick", startMs: 90, endMs: 130 }],
    };

    expect(evaluateGestureEvents(testCase, [{ event: "rightClick", t: 112 }]))
      .toMatchObject({ passed: true, failures: [] });
  });

  it("reports a missing event with its required count and window", () => {
    expect(evaluateGestureEvents(clickCase(), []).failures).toEqual([
      {
        code: "count",
        message: "短捏合：click 在 80–120 毫秒内需要 1 次，实际 0 次",
      },
    ]);
  });

  it("reports duplicates as a count failure without also calling them unexpected", () => {
    const report = evaluateGestureEvents(clickCase(), [
      { event: "click", t: 96 },
      { event: "click", t: 112 },
    ]);

    expect(report.failures).toEqual([
      {
        code: "count",
        message: "短捏合：click 在 80–120 毫秒内需要 1 次，实际 2 次",
      },
    ]);
  });

  it("reports every event outside all allowed windows as unexpected", () => {
    const report = evaluateGestureEvents(clickCase(), [
      { event: "dragStart", t: 90 },
      { event: "click", t: 200 },
    ]);

    expect(report.failures).toEqual([
      {
        code: "count",
        message: "短捏合：click 在 80–120 毫秒内需要 1 次，实际 0 次",
      },
      {
        code: "unexpected",
        message: "短捏合：90 毫秒出现未允许的 dragStart",
      },
      {
        code: "unexpected",
        message: "短捏合：200 毫秒出现未允许的 click",
      },
    ]);
  });

  it("rejects overlapping same-event windows before matching", () => {
    const testCase: GestureRegressionCase = {
      name: "重叠窗口",
      trace: EMPTY_TRACE,
      expectations: [
        { event: "click", startMs: 10, endMs: 30 },
        { event: "click", startMs: 30, endMs: 50 },
      ],
    };

    expect(() => evaluateGestureEvents(testCase, [])).toThrow("must not overlap");
  });

  it.each([
    [{ event: "click", startMs: 20, endMs: 10 }, "ordered"],
    [{ event: "click", startMs: Number.NaN, endMs: 10 }, "finite"],
    [{ event: "click", startMs: 0, endMs: 10, minCount: -1 }, "non-negative integers"],
    [{ event: "click", startMs: 0, endMs: 10, maxCount: 1.5 }, "non-negative integers"],
    [{ event: "click", startMs: 0, endMs: 10, minCount: 2, maxCount: 1 }, "minimum"],
  ] as const)("rejects an invalid expectation %#", (expectation, message) => {
    const testCase = {
      name: "非法配置",
      trace: EMPTY_TRACE,
      expectations: [expectation],
    } as GestureRegressionCase;

    expect(() => evaluateGestureEvents(testCase, [])).toThrow(message);
  });
});

describe("runGestureRegression", () => {
  it("emits pause only once for one continuous open-palm state", () => {
    const openPalm = makeGestureHand("open-palm");
    const trace: GestureTraceV5 = {
      version: 5,
      frames: [0, 16, 32, 48, 64, 80].map((t) => rawFrame(t, openPalm)),
    };

    const report = runGestureRegression({
      name: "张掌",
      trace,
      expectations: [{ event: "pause", startMs: 0, endMs: 80 }],
    });

    expect(report.events.filter((event) => event.event === "pause")).toHaveLength(1);
    expect(report.failures).toEqual([]);
  });

  it("recomputes behavior from landmarks instead of trusting stored trace events", () => {
    const tracking = makeGestureHand("tracking");
    const trace: GestureTraceV5 = {
      version: 5,
      frames: [
        rawFrame(0, tracking, ["click"]),
        rawFrame(16, tracking, ["dragStart"]),
        rawFrame(32, tracking, ["dragEnd"]),
      ],
    };

    expect(runGestureRegression({
      name: "旧输出不是真值",
      trace,
      expectations: [],
    })).toMatchObject({ passed: true, events: [], failures: [] });
  });
});
