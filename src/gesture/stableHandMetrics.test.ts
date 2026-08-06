import { describe, expect, it } from "vitest";

import { makeGestureHand } from "./fixtures/stable-gesture-sequences";
import {
  measureStableHand,
  resolveStablePinchThresholds,
  stablePinchThresholds,
} from "./stableHandMetrics";
import { DEFAULT_GESTURE_SETTINGS } from "./config";

describe("stable hand metrics", () => {
  it("keeps the original index-tip cursor coordinates", () => {
    const hand = makeGestureHand("tracking", { cursor: { x: 0.72, y: 0.24 } });

    const metrics = measureStableHand(hand, 16 / 9, 0.5);

    expect(metrics?.cursor).toMatchObject({ x: 0.72, y: 0.24 });
  });

  it.each([0.18, 0.3, 0.48])(
    "recognizes genuine contact at hand scale %s",
    (scale) => {
      const metrics = measureStableHand(makeGestureHand("left", { scale }), 16 / 9, 0.5);

      expect(metrics).toMatchObject({
        depthReliable: true,
        pinchContact: true,
        pinchBlockingReason: "none",
      });
      expect(metrics!.spatialPinchRatio).toBeLessThan(metrics!.pinchEnterRatio);
    },
  );

  it.each([
    [0.18, 0],
    [0.3, Math.PI / 3],
    [0.48, -Math.PI / 4],
  ] as const)(
    "在尺度 %s、旋转 %s 时只把拇指与中指的排他接触识别为右键",
    (scale, rotation) => {
      const metrics = measureStableHand(
        makeGestureHand("right", { scale, rotation }),
        16 / 9,
        0.5,
      )!;

      expect(metrics).toMatchObject({
        rightDepthReliable: true,
        rightPinchContact: true,
        rightPinchBlockingReason: "none",
      });
      expect(metrics.rightSpatialPinchRatio).toBeLessThanOrEqual(metrics.pinchEnterRatio);
      expect(metrics.spatialPinchRatio).toBeGreaterThanOrEqual(metrics.pinchExitRatio);
    },
  );

  it("右键投影重合但纵深分离时严格阻断", () => {
    const hand = makeGestureHand("right");
    hand[4] = { ...hand[4]!, z: -0.12 };
    hand[12] = { ...hand[12]!, z: 0.12 };

    const metrics = measureStableHand(hand, 16 / 9, 0.5)!;

    expect(metrics.rightScreenPinchRatio).toBeLessThan(metrics.pinchEnterRatio);
    expect(metrics.rightDepthPinchRatio).toBeGreaterThan(metrics.pinchEnterRatio);
    expect(metrics).toMatchObject({
      rightPinchContact: false,
      rightPinchBlockingReason: "depth",
    });
  });

  it("右键缺少中指纵深时不降级为二维接触", () => {
    const hand = makeGestureHand("right");
    hand[12] = { x: hand[12]!.x, y: hand[12]!.y };

    expect(measureStableHand(hand, 16 / 9, 0.5)).toMatchObject({
      rightDepthReliable: false,
      rightPinchContact: false,
      rightPinchBlockingReason: "depth",
    });
  });

  it.each([8, 16] as const)(
    "拇指同时靠近关节点 %s 时拒绝含糊右键",
    (ambiguousTip) => {
      const hand = makeGestureHand("right");
      hand[ambiguousTip] = {
        ...hand[4]!,
        x: hand[4]!.x + 0.002,
      };

      expect(measureStableHand(hand, 16 / 9, 0.5)?.rightPinchContact).toBe(false);
    },
  );

  it("左键接触不会同时成为右键接触", () => {
    expect(measureStableHand(makeGestureHand("left"), 16 / 9, 0.5))
      .toMatchObject({ pinchContact: true, rightPinchContact: false });
  });

  it("blocks projected overlap when the normalized landmark depth is separated", () => {
    const hand = makeGestureHand("left");
    hand[4] = { ...hand[4]!, z: -0.12 };
    hand[8] = { ...hand[8]!, z: 0.12 };

    const metrics = measureStableHand(hand, 16 / 9, 0.5);

    expect(metrics!.screenPinchRatio).toBeLessThan(metrics!.pinchEnterRatio);
    expect(metrics!.depthPinchRatio).toBeGreaterThan(metrics!.pinchEnterRatio);
    expect(metrics).toMatchObject({
      pinchContact: false,
      pinchBlockingReason: "depth",
    });
  });

  it("does not silently fall back to ambiguous 2D clicking when depth is absent", () => {
    const hand = makeGestureHand("left").map(({ x, y }) => ({ x, y }));

    const metrics = measureStableHand(hand, 16 / 9, 0.5);

    expect(metrics).toMatchObject({
      depthReliable: false,
      pinchContact: false,
      pinchBlockingReason: "depth",
    });
  });

  it("requires all four fingers to be genuinely extended for open palm", () => {
    expect(measureStableHand(makeGestureHand("open-palm"), 1, 0.5)?.openPalmCandidate).toBe(true);
    expect(measureStableHand(makeGestureHand("fist"), 1, 0.5)?.openPalmCandidate).toBe(false);
    expect(measureStableHand(makeGestureHand("tracking"), 1, 0.5)?.openPalmCandidate).toBe(false);

    const almostOpen = makeGestureHand("open-palm");
    almostOpen[16] = { ...almostOpen[14]! };
    expect(measureStableHand(almostOpen, 1, 0.5)?.openPalmCandidate).toBe(false);
  });

  it("只把四指都折回掌心的姿态标记为握拳抑制", () => {
    expect(measureStableHand(makeGestureHand("fist"), 1, 0.5)?.fistCandidate).toBe(true);
    expect(measureStableHand(makeGestureHand("tracking"), 1, 0.5)?.fistCandidate).toBe(false);
    expect(measureStableHand(makeGestureHand("left"), 1, 0.5)?.fistCandidate).toBe(false);
    expect(measureStableHand(makeGestureHand("open-palm"), 1, 0.5)?.fistCandidate).toBe(false);
  });

  it.each([
    [0.18, 0, 1],
    [0.3, Math.PI / 3, 16 / 9],
    [0.48, -Math.PI / 4, 4 / 3],
  ] as const)(
    "在尺度 %s、旋转 %s、宽高比 %s 下识别严格双指滚动姿势",
    (scale, rotation, aspectRatio) => {
      const metrics = measureStableHand(
        makeGestureHand("scroll", { scale, rotation }),
        aspectRatio,
        0.5,
      )!;

      expect(metrics).toMatchObject({
        scrollPoseContact: true,
        scrollPoseRetained: true,
        scrollAnchor: {
          x: expect.any(Number),
          y: expect.any(Number),
        },
      });
      expect(metrics.scrollPoseScore).toBeGreaterThanOrEqual(0.8);
    },
  );

  it.each(["tracking", "open-palm", "fist", "left", "right", "double"] as const)(
    "%s 不会误入双指滚动",
    (gesture) => {
      expect(measureStableHand(makeGestureHand(gesture), 16 / 9, 0.5))
        .toMatchObject({ scrollPoseContact: false });
    },
  );

  it("拇指靠近无名指或缺少关键纵深时阻断滚动", () => {
    const overlap = makeGestureHand("scroll");
    overlap[16] = { ...overlap[4]!, x: overlap[4]!.x + 0.002 };
    expect(measureStableHand(overlap, 16 / 9, 0.5))
      .toMatchObject({ scrollPoseContact: false });

    const missingDepth = makeGestureHand("scroll");
    missingDepth[16] = { x: missingDepth[16]!.x, y: missingDepth[16]!.y };
    expect(measureStableHand(missingDepth, 16 / 9, 0.5))
      .toMatchObject({ scrollPoseContact: false });
  });

  it("掌部滚动锚点随整手平移且不依赖指尖位置", () => {
    const first = measureStableHand(makeGestureHand("scroll", { translateY: 0.4 }), 1, 0.5)!;
    const secondHand = makeGestureHand("scroll", { translateY: 0.48 });
    secondHand[8] = { ...secondHand[8]!, y: secondHand[8]!.y + 0.04 };
    const second = measureStableHand(secondHand, 1, 0.5)!;

    expect(second.scrollAnchor.y - first.scrollAnchor.y).toBeCloseTo(0.08, 6);
    expect(second.scrollAnchor.y).not.toBeCloseTo(second.cursor.y, 3);
  });

  it("用掌部锚点而不是正在捏合的食指尖测量整手移动", () => {
    const trackingHand = makeGestureHand("tracking");
    const pinchedHand = trackingHand.map((point) => ({ ...point }));
    pinchedHand[8] = { ...pinchedHand[4]!, x: pinchedHand[4]!.x + 0.005 };
    const tracking = measureStableHand(trackingHand, 1, 0.5);
    const pinched = measureStableHand(pinchedHand, 1, 0.5);

    expect(tracking?.motionCursor).not.toEqual(tracking?.cursor);
    expect(pinched?.motionCursor.x).toBeCloseTo(tracking!.motionCursor.x);
    expect(pinched?.motionCursor.y).toBeCloseTo(tracking!.motionCursor.y);
  });

  it("maps sensitivity to bounded contact and release thresholds", () => {
    const strict = stablePinchThresholds(0);
    const normal = stablePinchThresholds(0.5);
    const permissive = stablePinchThresholds(1);

    expect(strict.enterRatio).toBeLessThan(normal.enterRatio);
    expect(normal.enterRatio).toBeLessThan(permissive.enterRatio);
    expect(strict.exitRatio).toBeGreaterThan(strict.enterRatio);
    expect(permissive.exitRatio).toBeLessThanOrEqual(0.58);
  });

  it("没有个人阈值时保持当前默认边界", () => {
    expect(resolveStablePinchThresholds(DEFAULT_GESTURE_SETTINGS)).toEqual(stablePinchThresholds(0.5));
  });

  it("只接受安全且有迟滞的个人边界", () => {
    expect(resolveStablePinchThresholds({
      ...DEFAULT_GESTURE_SETTINGS, pinchEnterRatio: 0.3, pinchExitRatio: 0.5,
    })).toEqual({ enterRatio: 0.3, exitRatio: 0.5 });
    expect(resolveStablePinchThresholds({
      ...DEFAULT_GESTURE_SETTINGS, pinchEnterRatio: 0.5, pinchExitRatio: 0.4,
    })).toEqual(stablePinchThresholds(0.5));
  });

  it("rejects malformed landmark frames", () => {
    expect(measureStableHand(null, 1, 0.5)).toBeNull();
    expect(measureStableHand(makeGestureHand("tracking").slice(0, 20), 1, 0.5)).toBeNull();
    const invalid = makeGestureHand("tracking");
    invalid[8] = { x: Number.NaN, y: 0.5, z: 0 };
    expect(measureStableHand(invalid, 1, 0.5)).toBeNull();
  });
});
