import { describe, expect, it } from "vitest";

import { makeGestureHand } from "./fixtures/stable-gesture-sequences";
import { HandTrackingStabilizer } from "./handTrackingStabilizer";
import type { Landmark } from "./types";

const handAt = (centerX: number): Landmark[] => {
  const base = makeGestureHand("tracking");
  const offset = centerX - base[9]!.x;
  return base.map((point) => ({ ...point, x: point.x + offset }));
};

const range = (values: number[]): number => Math.max(...values) - Math.min(...values);

describe("HandTrackingStabilizer", () => {
  it("减少静止关节噪声但在 100ms 内跟随至少 80% 的整手平移", () => {
    const stabilizer = new HandTrackingStabilizer();
    const raw: number[] = [];
    const stable: number[] = [];

    for (let frame = 0; frame < 40; frame += 1) {
      const x = 0.5 + (frame % 2 === 0 ? -0.015 : 0.015);
      raw.push(x);
      stable.push(stabilizer.update(handAt(x), frame * 16).controlLandmarks![8]!.x);
    }

    expect(range(stable.slice(10))).toBeLessThan(range(raw.slice(10)) * 0.6);

    const motion = new HandTrackingStabilizer();
    const start = motion.update(handAt(0.2), 0).controlLandmarks![8]!.x;
    motion.update(handAt(0.2), 16);
    const moved = motion.update(handAt(0.8), 116);

    expect(moved.rejectedIndices).toEqual([]);
    expect(moved.controlLandmarks![8]!.x - start).toBeGreaterThanOrEqual(0.48);
  });

  it("拒绝瞬移的食指尖并用掌部运动预测替代", () => {
    const stabilizer = new HandTrackingStabilizer();
    const base = makeGestureHand("tracking");
    stabilizer.update(base, 0);
    const broken = base.map((point) => ({ ...point }));
    broken[8] = { ...broken[4]!, x: broken[4]!.x + 0.001 };

    const frame = stabilizer.update(broken, 16);

    expect(frame).toMatchObject({ source: "observed", gestureSafe: false });
    expect(frame.rejectedIndices).toContain(8);
    expect(frame.controlLandmarks![8]!.x).not.toBeCloseTo(broken[8]!.x, 3);
  });

  it("允许骨段长度一致的真实捏合和展开手指运动", () => {
    const pinch = new HandTrackingStabilizer();
    pinch.update(makeGestureHand("tracking"), 0);
    expect(pinch.update(makeGestureHand("left"), 16)).toMatchObject({
      gestureSafe: true,
      rejectedIndices: [],
    });

    const opening = new HandTrackingStabilizer();
    opening.update(makeGestureHand("tracking"), 0);
    expect(opening.update(makeGestureHand("open-palm"), 16)).toMatchObject({
      gestureSafe: true,
      rejectedIndices: [],
    });

    const cancelPinch = new HandTrackingStabilizer();
    cancelPinch.update(makeGestureHand("left"), 0);
    expect(cancelPinch.update(makeGestureHand("open-palm"), 16)).toMatchObject({
      gestureSafe: true,
      rejectedIndices: [],
    });
  });

  it("拒绝骨段比例、坐标边界和掌宽突变且不修改原始输入", () => {
    const base = makeGestureHand("tracking");

    const bone = new HandTrackingStabilizer();
    bone.update(base, 0);
    const stretched = structuredClone(base);
    stretched[12] = { ...stretched[12]!, y: stretched[12]!.y - 0.5 };
    expect(bone.update(stretched, 16)).toMatchObject({ gestureSafe: false });

    const bounds = new HandTrackingStabilizer();
    bounds.update(base, 0);
    const outside = structuredClone(base);
    outside[8] = { ...outside[8]!, x: 1.3 };
    expect(bounds.update(outside, 16).rejectedIndices).toContain(8);

    const scale = new HandTrackingStabilizer();
    scale.update(base, 0);
    const widened = structuredClone(base);
    widened[17] = { ...widened[17]!, x: widened[17]!.x + 0.4 };
    expect(scale.update(widened, 16)).toMatchObject({ gestureSafe: false });
    expect(base).toEqual(makeGestureHand("tracking"));
  });

  it("只在 80ms 内预测控制点且预测永远不安全", () => {
    const stabilizer = new HandTrackingStabilizer();
    stabilizer.update(handAt(0.3), 0);
    stabilizer.update(handAt(0.34), 16);

    expect(stabilizer.update(null, 64)).toMatchObject({
      source: "predicted",
      gestureSafe: false,
      quality: 0.15,
    });
    expect(stabilizer.update(null, 97)).toMatchObject({
      source: "lost",
      gestureSafe: false,
      quality: 0,
      controlLandmarks: null,
    });
  });

  it("时间戳倒退或观测间隔超过 250ms 时清空历史", () => {
    const stabilizer = new HandTrackingStabilizer();
    stabilizer.update(handAt(0.3), 100);

    expect(stabilizer.update(handAt(0.4), 99)).toMatchObject({
      source: "lost",
      controlLandmarks: null,
    });

    stabilizer.update(handAt(0.3), 200);
    expect(stabilizer.update(handAt(0.8), 451)).toMatchObject({
      source: "observed",
      gestureSafe: true,
      rejectedIndices: [],
    });
  });
});
