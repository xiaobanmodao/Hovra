import { describe, expect, it } from "vitest";

import { makeGestureHand } from "./fixtures/stable-gesture-sequences";
import { GestureEngine } from "./gestureEngine";

describe("GestureEngine 稳定内核", () => {
  it("在诊断和识别中使用个人捏合边界", () => {
    const engine = new GestureEngine({
      gestureSensitivity: 0.5, openPalmMinTipDistance: 0.18,
      cursorSmoothingFactor: 0.4, cursorOffsetX: 0, cursorOffsetY: 0,
      cameraStaleFrameMs: 500, pinchEnterRatio: 0.3, pinchExitRatio: 0.52,
    });
    expect(engine.update(makeGestureHand("tracking"), 0).diagnostics).toMatchObject({
      pinchEnterRatio: 0.3,
      pinchExitRatio: 0.52,
    });
  });
  it("在第二个连续接触帧立即点击一次", () => {
    const engine = new GestureEngine();
    const left = makeGestureHand("left");

    expect(engine.update(left, 0)).toMatchObject({
      phase: "candidate",
      state: "left-pinching",
      click: false,
      confirmationProgress: 0.5,
    });
    expect(engine.update(left, 16)).toMatchObject({
      phase: "active",
      state: "left-pinching",
      click: true,
      lockedGesture: "left",
      confirmationProgress: 1,
    });
    expect(engine.update(left, 32).click).toBe(false);
  });

  it("持续捏合不连点，明确松开两帧后才能再次点击", () => {
    const engine = new GestureEngine();
    const left = makeGestureHand("left");
    const tracking = makeGestureHand("tracking");

    engine.update(left, 0);
    expect(engine.update(left, 16).click).toBe(true);
    for (let at = 32; at <= 1_000; at += 16) {
      expect(engine.update(left, at).click).toBe(false);
    }
    expect(engine.update(tracking, 1_016).phase).toBe("releasing");
    expect(engine.update(tracking, 1_032).phase).toBe("neutral");
    expect(engine.update(left, 1_048).click).toBe(false);
    expect(engine.update(left, 1_064).click).toBe(true);
  });

  it("忽略单帧指尖重合", () => {
    const engine = new GestureEngine();

    expect(engine.update(makeGestureHand("left"), 0).phase).toBe("candidate");
    expect(engine.update(makeGestureHand("tracking"), 16).click).toBe(false);
    expect(engine.update(makeGestureHand("tracking"), 32).click).toBe(false);
  });

  it("真实接触不再被错误的世界坐标阻断", () => {
    const engine = new GestureEngine();
    const left = makeGestureHand("left");
    const misleadingWorld = makeGestureHand("left");
    misleadingWorld[8] = { ...misleadingWorld[4]!, z: 0.7 };

    expect(engine.update(left, 0, misleadingWorld).click).toBe(false);
    expect(engine.update(left, 16, misleadingWorld)).toMatchObject({
      click: true,
      lockedGesture: "left",
      diagnostics: {
        worldLeftPinchRatio: null,
        pinchModelMode: "mediapipe",
      },
    });
  });

  it("画面重合但同帧归一化深度分离时绝不点击", () => {
    const engine = new GestureEngine();
    const overlap = makeGestureHand("left");
    overlap[4] = { ...overlap[4]!, z: -0.12 };
    overlap[8] = { ...overlap[8]!, z: 0.12 };

    for (let at = 0; at <= 160; at += 16) {
      const output = engine.update(overlap, at, makeGestureHand("left"), 4, 16 / 9);
      expect(output.click).toBe(false);
      expect(output.lockedGesture).toBeNull();
      expect(output.diagnostics.pinchBlockingReason).toBe("depth");
    }
  });

  it("保留原始光标坐标并报告稳定内核几何", () => {
    const engine = new GestureEngine();
    const image = makeGestureHand("left", { cursor: { x: 0.72, y: 0.24 } });

    const output = engine.update(image, 0, null, 4, 16 / 9);

    expect(output.cursor?.x).toBeCloseTo(0.72);
    expect(output.cursor?.y).toBeCloseTo(0.24);
    expect(output.diagnostics).toMatchObject({
      imageAspectRatio: 16 / 9,
      pinchDepthReliable: true,
      pinchModelMode: "mediapipe",
      visionPinchRatio: null,
      worldLeftPinchRatio: null,
    });
    expect(output.diagnostics.pinchScreenRatio).toBeLessThan(output.diagnostics.pinchEnterRatio!);
    expect(output.diagnostics.pinchSpatialRatio).toBeLessThan(output.diagnostics.pinchEnterRatio!);
  });

  it("需要三个连续张掌帧才暂停，两个非张掌帧才恢复", () => {
    const engine = new GestureEngine();
    const open = makeGestureHand("open-palm");
    const tracking = makeGestureHand("tracking");

    expect(engine.update(open, 0).state).toBe("tracking");
    expect(engine.update(open, 16).state).toBe("tracking");
    expect(engine.update(open, 32)).toMatchObject({
      state: "paused",
      lockedGesture: "open-palm",
    });
    expect(engine.update(tracking, 48).state).toBe("paused");
    expect(engine.update(tracking, 64).state).toBe("tracking");
  });

  it.each(["fist", "tracking", "right", "double", "scroll"] as const)(
    "%s 永远不会被误判为张掌暂停",
    (gesture) => {
      const engine = new GestureEngine();
      for (let at = 0; at <= 160; at += 16) {
        expect(engine.update(makeGestureHand(gesture), at).state).not.toBe("paused");
      }
    },
  );

  it("张掌优先并清除未完成的点击候选", () => {
    const engine = new GestureEngine();
    engine.update(makeGestureHand("left"), 0);
    engine.update(makeGestureHand("open-palm"), 16);
    engine.update(makeGestureHand("open-palm"), 32);
    const paused = engine.update(makeGestureHand("open-palm"), 48);

    expect(paused).toMatchObject({ state: "paused", click: false, lockedGesture: "open-palm" });
  });

  it.each(["right", "double", "scroll"] as const)("不启用已取消的 %s 动作", (gesture) => {
    const engine = new GestureEngine();

    for (let at = 0; at <= 128; at += 16) {
      const output = engine.update(makeGestureHand(gesture), at);
      expect(output.rightClick).toBe(false);
      expect(output.doubleClick).toBe(false);
      expect(output.scrollY).toBe(0);
      expect(output.dragStart).toBe(false);
      expect(output.dragEnd).toBe(false);
    }
  });

  it("丢手和非法帧不会制造点击", () => {
    const engine = new GestureEngine();
    engine.update(makeGestureHand("left"), 0);
    expect(engine.update(null, 16)).toMatchObject({ state: "lost", click: false });
    expect(engine.update(makeGestureHand("left"), 32).click).toBe(false);
    expect(engine.update(makeGestureHand("left"), 20).click).toBe(false);
  });

  it("记录不含图像数据且点击帧可回放", () => {
    const engine = new GestureEngine();
    const left = makeGestureHand("left");
    engine.update(left, 0, left);
    engine.update(left, 16, left);

    const trace = engine.getTrace();
    expect(trace.frames.at(-1)?.events).toEqual(["click"]);
    expect(JSON.stringify(trace)).not.toContain("data:image");
    expect(JSON.stringify(trace)).not.toContain("imageData");
  });
});
