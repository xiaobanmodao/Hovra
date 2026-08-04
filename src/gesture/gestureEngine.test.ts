import { describe, expect, it } from "vitest";

import { DEFAULT_GESTURE_SETTINGS } from "./config";
import { GestureEngine } from "./gestureEngine";
import { makeGestureHand, type SyntheticGesture } from "./fixtures/stable-gesture-sequences";
import type { GestureOutput } from "./types";

const actionFor = (kind: "left" | "right" | "double") => ({
  click: kind === "left",
  rightClick: kind === "right",
  doubleClick: kind === "double",
});

const runUntil = (
  engine: GestureEngine,
  hand: SyntheticGesture,
  startMs: number,
  predicate: (output: GestureOutput) => boolean,
  scale = 0.3,
  limitMs = 400,
): { output: GestureOutput; at: number } => {
  for (let elapsed = 0; elapsed <= limitMs; elapsed += 20) {
    const at = startMs + elapsed;
    const output = engine.update(makeGestureHand(hand, { scale }), at);
    if (predicate(output)) return { output, at };
  }
  throw new Error(`Gesture ${hand} did not reach the expected state`);
};

const releaseUntil = (
  engine: GestureEngine,
  startMs: number,
  predicate: (output: GestureOutput) => boolean,
  scale = 0.3,
): { output: GestureOutput; at: number } => runUntil(
  engine,
  "tracking",
  startMs,
  predicate,
  scale,
  500,
);

describe("GestureEngine V2", () => {
  it("shows a candidate immediately but waits 80 ms before confirming it", () => {
    const engine = new GestureEngine();
    const first = engine.update(makeGestureHand("left"), 0);

    expect(first).toMatchObject({
      state: "left-pinching",
      phase: "candidate",
      candidate: "left",
      lockedGesture: null,
      confirmationProgress: 0,
    });
    expect(engine.update(makeGestureHand("left"), 79).lockedGesture).toBeNull();
    expect(engine.update(makeGestureHand("left"), 80)).toMatchObject({
      phase: "active",
      lockedGesture: "left",
      confirmationProgress: 1,
    });
  });

  it.each(["left", "right", "double"] as const)(
    "emits one %s action only after a confirmed release",
    (kind) => {
      const engine = new GestureEngine();
      const activated = runUntil(engine, kind, 0, (output) => output.lockedGesture === kind);
      const released = releaseUntil(
        engine,
        activated.at + 20,
        (output) => output.click || output.rightClick || output.doubleClick,
      );

      expect(released.output).toMatchObject(actionFor(kind));
      expect(engine.update(makeGestureHand("tracking"), released.at + 20)).toMatchObject({
        click: false,
        rightClick: false,
        doubleClick: false,
      });
    },
  );

  it("does not switch actions when another fingertip becomes closer during a lock", () => {
    const engine = new GestureEngine();
    const activated = runUntil(engine, "left", 0, (output) => output.lockedGesture === "left");
    const overlap = makeGestureHand("right");

    for (let at = activated.at + 20; at <= activated.at + 100; at += 20) {
      const output = engine.update(overlap, at);
      expect(output.lockedGesture).not.toBe("right");
      expect(output.rightClick).toBe(false);
    }
  });

  it("tolerates up to three dropped frames without clicking or releasing a drag", () => {
    const clickEngine = new GestureEngine();
    const activated = runUntil(clickEngine, "left", 0, (output) => output.lockedGesture === "left");
    for (const offset of [20, 40, 60]) {
      const dropped = clickEngine.update(null, activated.at + offset);
      expect(dropped.click).toBe(false);
      expect(dropped.lockedGesture).toBe("left");
    }
    expect(clickEngine.update(makeGestureHand("left"), activated.at + 80).lockedGesture).toBe("left");

    const dragEngine = new GestureEngine();
    const dragActivation = runUntil(dragEngine, "left", 0, (output) => output.lockedGesture === "left");
    const drag = runUntil(
      dragEngine,
      "left",
      dragActivation.at + 20,
      (output) => output.dragStart,
      0.3,
      500,
    );
    expect(drag.output.state).toBe("dragging");
    expect(dragEngine.update(null, drag.at + 100)).toMatchObject({
      state: "dragging",
      dragEnd: false,
    });
    expect(dragEngine.update(null, drag.at + 220)).toMatchObject({
      state: "lost",
      dragEnd: true,
      click: false,
    });
  });

  it("starts drag 350 ms after confirmation and ends it without a click", () => {
    const engine = new GestureEngine({ ...DEFAULT_GESTURE_SETTINGS, dragHoldMs: 350 });
    const activated = runUntil(engine, "left", 0, (output) => output.lockedGesture === "left");

    expect(engine.update(makeGestureHand("left"), activated.at + 349).dragStart).toBe(false);
    expect(engine.update(makeGestureHand("left"), activated.at + 350)).toMatchObject({
      state: "dragging",
      dragStart: true,
    });
    const released = releaseUntil(engine, activated.at + 370, (output) => output.dragEnd);
    expect(released.output).toMatchObject({ dragEnd: true, click: false });
  });

  it("confirms scroll, uses palm-local signed movement, and resets its reference", () => {
    const engine = new GestureEngine();
    const activated = runUntil(engine, "scroll", 0, (output) => output.lockedGesture === "scroll");
    expect(activated.output).toMatchObject({ state: "scrolling", scrollY: 0 });

    const upward = engine.update(makeGestureHand("scroll", { translateY: -0.03 }), activated.at + 20);
    expect(upward.scrollY).toBeGreaterThan(0);
    expect(Math.abs(upward.scrollY)).toBeLessThanOrEqual(12);

    releaseUntil(engine, activated.at + 40, (output) => output.lockedGesture === null);
    const next = runUntil(engine, "scroll", activated.at + 400, (output) => output.lockedGesture === "scroll");
    expect(next.output.scrollY).toBe(0);
  });

  it("meets 20-of-20 synthetic action repetitions at near, mid, and far scales", () => {
    for (const scale of [0.18, 0.3, 0.45]) {
      for (const kind of ["left", "right", "double"] as const) {
        for (let repetition = 0; repetition < 20; repetition += 1) {
          const engine = new GestureEngine();
          const activated = runUntil(engine, kind, 0, (output) => output.lockedGesture === kind, scale);
          const released = releaseUntil(
            engine,
            activated.at + 20,
            (output) => output.click || output.rightClick || output.doubleClick,
            scale,
          );
          expect(released.output).toMatchObject(actionFor(kind));
        }
      }
    }
  });

  it("keeps candidate-to-confirmation latency at or below 120 ms", () => {
    for (const kind of ["left", "right", "double", "scroll"] as const) {
      const engine = new GestureEngine();
      let candidateAt: number | null = null;
      const activated = runUntil(engine, kind, 0, (output) => {
        if (output.phase === "candidate" && candidateAt === null) candidateAt = output.diagnostics?.timestampMs ?? 0;
        return output.lockedGesture === kind;
      });
      expect(activated.at - (candidateAt ?? 0)).toBeLessThanOrEqual(120);
    }
  });

  it("keeps physical-onset confirmation p95 at or below 120 ms after neutral movement", () => {
    const latencies: number[] = [];
    for (const scale of [0.18, 0.3, 0.45]) {
      for (const kind of ["left", "right", "double", "scroll"] as const) {
        for (let repetition = 0; repetition < 10; repetition += 1) {
          const engine = new GestureEngine();
          for (const at of [0, 20, 40]) {
            engine.update(makeGestureHand("tracking", { scale }), at);
          }
          const onsetMs = 60;
          const activated = runUntil(
            engine,
            kind,
            onsetMs,
            (output) => output.lockedGesture === kind,
            scale,
          );
          latencies.push(activated.at - onsetMs);
        }
      }
    }

    const sorted = [...latencies].sort((first, second) => first - second);
    const p95 = sorted[Math.ceil(sorted.length * 0.95) - 1]!;
    expect(p95).toBeLessThanOrEqual(120);
  });

  it("produces zero actions during two minutes of jittering neutral pointer movement", () => {
    const engine = new GestureEngine();
    let actionCount = 0;

    for (let at = 0; at <= 120_000; at += 33) {
      const output = engine.update(makeGestureHand("tracking", {
        scale: 0.3 + Math.sin(at / 1_100) * 0.025,
        translateX: 0.5 + Math.sin(at / 700) * 0.08,
        translateY: 0.5 + Math.cos(at / 900) * 0.06,
      }), at);
      actionCount += Number(output.click)
        + Number(output.rightClick)
        + Number(output.doubleClick)
        + Number(output.dragStart)
        + Number(output.dragEnd)
        + Number(output.scrollY !== 0);
    }

    expect(actionCount).toBe(0);
  });

  it("records privacy-safe diagnostics for deterministic replay", () => {
    const engine = new GestureEngine();
    runUntil(engine, "left", 1_000, (output) => output.lockedGesture === "left");
    releaseUntil(engine, 1_100, (output) => output.click);

    const trace = engine.getTrace();
    expect(trace.version).toBe(1);
    expect(trace.frames.length).toBeGreaterThan(0);
    expect(JSON.stringify(trace)).not.toContain("image");
    expect(trace.frames.at(-1)?.features?.palmScale).toBeGreaterThan(0);
  });
});
