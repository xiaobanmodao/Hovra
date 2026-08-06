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
  it("稳定捏合阶段不点击，只在第二个连续释放帧点击一次", () => {
    const engine = new GestureEngine();
    const left = makeGestureHand("left");
    const tracking = makeGestureHand("tracking");

    engine.update(tracking, 0);
    expect(engine.update(left, 16)).toMatchObject({
      phase: "candidate",
      state: "left-pinching",
      click: false,
      confirmationProgress: 0.5,
    });
    expect(engine.update(left, 32)).toMatchObject({
      phase: "active",
      state: "left-pinching",
      click: false,
      lockedGesture: "left",
      confirmationProgress: 1,
    });
    expect(engine.update(tracking, 48)).toMatchObject({ phase: "releasing", click: false });
    expect(engine.update(tracking, 64)).toMatchObject({
      phase: "cooldown",
      click: true,
      clickCursor: expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }),
    });
  });

  it("右键需要三帧排他接触并只在第二个释放帧触发一次", () => {
    const engine = new GestureEngine();
    const right = makeGestureHand("right");
    const tracking = makeGestureHand("tracking");

    engine.update(tracking, 0);
    expect(engine.update(right, 16)).toMatchObject({
      phase: "candidate",
      state: "right-pinching",
      candidate: "right",
      rightClick: false,
      click: false,
      confirmationProgress: 1 / 3,
      longPressProgress: 0,
    });
    expect(engine.update(right, 32)).toMatchObject({
      phase: "candidate",
      state: "right-pinching",
      rightClick: false,
      confirmationProgress: 2 / 3,
    });
    expect(engine.update(right, 48)).toMatchObject({
      phase: "active",
      state: "right-pinching",
      lockedGesture: "right",
      rightClick: false,
      confirmationProgress: 1,
    });
    expect(engine.update(tracking, 64)).toMatchObject({
      phase: "releasing",
      lockedGesture: "right",
      rightClick: false,
    });
    expect(engine.update(tracking, 80)).toMatchObject({
      phase: "cooldown",
      rightClick: true,
      click: false,
      dragStart: false,
      dragEnd: false,
      clickCursor: expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }),
    });
    expect(engine.update(tracking, 96).rightClick).toBe(false);
  });

  it("右键保持超过 650 毫秒会取消且永远不转成左键或拖动", () => {
    const engine = new GestureEngine();
    const right = makeGestureHand("right");
    const tracking = makeGestureHand("tracking");
    const outputs = [engine.update(tracking, 0)];
    for (const at of [16, 32, 48, 148, 248, 348, 448, 548, 648, 666]) {
      outputs.push(engine.update(right, at));
    }
    outputs.push(engine.update(tracking, 682));
    outputs.push(engine.update(tracking, 698));

    expect(outputs.some((output) => output.rightClick)).toBe(false);
    expect(outputs.some((output) => output.click)).toBe(false);
    expect(outputs.some((output) => output.dragStart || output.dragEnd)).toBe(false);
    expect(outputs.at(-3)?.diagnostics.clickBlockingReason).toBe("timeout");
  });

  it("拇指同时靠近食指与中指的含糊姿态不会选择任何点击动作", () => {
    const engine = new GestureEngine();
    const ambiguous = makeGestureHand("right");
    ambiguous[8] = { ...ambiguous[4]!, x: ambiguous[4]!.x + 0.002 };
    const tracking = makeGestureHand("tracking");
    const outputs = [engine.update(tracking, 0)];
    for (const at of [16, 32, 48, 64]) outputs.push(engine.update(ambiguous, at));
    outputs.push(engine.update(tracking, 80));
    outputs.push(engine.update(tracking, 96));

    expect(outputs.some((output) => output.click || output.rightClick)).toBe(false);
    expect(outputs.some((output) => output.lockedGesture === "left"
      || output.lockedGesture === "right")).toBe(false);
  });

  it("丢手和张掌都会取消未完成右键且不制造释放事件", () => {
    const right = makeGestureHand("right");

    const lost = new GestureEngine();
    lost.update(makeGestureHand("tracking"), 0);
    lost.update(right, 16);
    lost.update(right, 32);
    expect(lost.update(null, 48)).toMatchObject({
      rightClick: false,
      click: false,
      dragStart: false,
      dragEnd: false,
    });

    const paused = new GestureEngine();
    paused.update(makeGestureHand("tracking"), 0);
    paused.update(right, 16);
    paused.update(right, 32);
    paused.update(makeGestureHand("open-palm"), 48);
    paused.update(makeGestureHand("open-palm"), 64);
    expect(paused.update(makeGestureHand("open-palm"), 80)).toMatchObject({
      state: "paused",
      rightClick: false,
      click: false,
    });
  });

  it("持续捏合不连点，明确松开两帧后才能再次点击", () => {
    const engine = new GestureEngine();
    const left = makeGestureHand("left");
    const tracking = makeGestureHand("tracking");

    engine.update(tracking, 0);
    engine.update(left, 16);
    expect(engine.update(left, 32).click).toBe(false);
    for (let at = 48; at <= 320; at += 16) {
      expect(engine.update(left, at).click).toBe(false);
    }
    expect(engine.update(tracking, 336).phase).toBe("releasing");
    expect(engine.update(tracking, 352).click).toBe(true);
    for (let at = 368; at <= 512; at += 16) engine.update(tracking, at);
    expect(engine.update(left, 528).click).toBe(false);
    expect(engine.update(left, 544).click).toBe(false);
    engine.update(tracking, 560);
    expect(engine.update(tracking, 576).click).toBe(true);
  });

  it("持续捏合进入长按，松开只结束长按而不追加点击", () => {
    const engine = new GestureEngine();
    const left = makeGestureHand("left");
    const tracking = makeGestureHand("tracking");

    engine.update(tracking, 0);
    engine.update(left, 16);
    engine.update(left, 32);
    engine.update(left, 132);
    expect(engine.update(left, 232).longPressProgress).toBeCloseTo(216 / 420, 6);
    engine.update(left, 332);
    expect(engine.update(left, 435)).toMatchObject({
      state: "left-pinching",
      dragStart: false,
      dragEnd: false,
      click: false,
      longPressProgress: 419 / 420,
    });
    expect(engine.update(left, 436)).toMatchObject({
      state: "dragging",
      phase: "dragging",
      dragStart: true,
      dragEnd: false,
      click: false,
      longPressProgress: 1,
      clickCursor: expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }),
    });
    expect(engine.update(left, 452)).toMatchObject({
      state: "dragging",
      phase: "dragging",
      dragStart: false,
      dragEnd: false,
      click: false,
      longPressProgress: 1,
    });
    expect(engine.update(tracking, 468)).toMatchObject({
      phase: "releasing",
      dragEnd: false,
      longPressProgress: 1,
    });
    expect(engine.update(tracking, 484)).toMatchObject({
      dragStart: false,
      dragEnd: true,
      click: false,
      longPressProgress: 0,
    });
  });

  it("短时丢点保留预测光标但立即结束长按且不产生其他事件", () => {
    const engine = new GestureEngine();
    const left = makeGestureHand("left");
    engine.update(makeGestureHand("tracking"), 0);
    engine.update(left, 16);
    engine.update(left, 32);
    engine.update(left, 132);
    engine.update(left, 232);
    engine.update(left, 332);
    expect(engine.update(left, 436).dragStart).toBe(true);

    expect(engine.update(null, 452)).toMatchObject({
      state: "tracking",
      cursor: expect.any(Object),
      dragStart: false,
      dragEnd: true,
      click: false,
      longPressProgress: 0,
      diagnostics: {
        trackingSource: "predicted",
        trackingQuality: 0.15,
      },
    });
    expect(engine.update(null, 468)).toMatchObject({ dragEnd: false, click: false });
    expect(engine.update(null, 548)).toMatchObject({
      state: "lost",
      cursor: null,
      diagnostics: { trackingSource: "lost" },
    });
  });

  it("连续异常指尖重合只能移动光标，不能制造捏合或点击", () => {
    const engine = new GestureEngine();
    const tracking = makeGestureHand("tracking");
    engine.update(tracking, 0);

    for (const at of [16, 32, 48]) {
      const broken = tracking.map((point) => ({ ...point }));
      broken[8] = { ...broken[4]!, x: broken[4]!.x + 0.001 };
      const output = engine.update(broken, at);

      expect(output).toMatchObject({ click: false, dragStart: false });
      expect(output.diagnostics).toMatchObject({
        trackingSource: "observed",
        rejectedLandmarkCount: 1,
      });
    }
  });

  it("忽略单帧指尖重合", () => {
    const engine = new GestureEngine();

    engine.update(makeGestureHand("tracking"), 0);
    expect(engine.update(makeGestureHand("left"), 16).phase).toBe("candidate");
    expect(engine.update(makeGestureHand("tracking"), 32).click).toBe(false);
    expect(engine.update(makeGestureHand("tracking"), 48).click).toBe(false);
  });

  it("真实接触不再被错误的世界坐标阻断", () => {
    const engine = new GestureEngine();
    const left = makeGestureHand("left");
    const misleadingWorld = makeGestureHand("left");
    misleadingWorld[8] = { ...misleadingWorld[4]!, z: 0.7 };

    engine.update(makeGestureHand("tracking"), 0, misleadingWorld);
    expect(engine.update(left, 16, misleadingWorld).click).toBe(false);
    expect(engine.update(left, 32, misleadingWorld)).toMatchObject({
      click: false,
      lockedGesture: "left",
      diagnostics: {
        worldLeftPinchRatio: null,
        pinchModelMode: "mediapipe",
      },
    });
    engine.update(makeGestureHand("tracking"), 48, misleadingWorld);
    expect(engine.update(makeGestureHand("tracking"), 64, misleadingWorld).click).toBe(true);
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

  it("张掌暂停后的短时丢点不会提前恢复系统控制", () => {
    const engine = new GestureEngine();
    const open = makeGestureHand("open-palm");
    const tracking = makeGestureHand("tracking");
    engine.update(open, 0);
    engine.update(open, 16);
    expect(engine.update(open, 32).state).toBe("paused");

    expect(engine.update(null, 48)).toMatchObject({
      state: "paused",
      click: false,
      diagnostics: { trackingSource: "predicted" },
    });
    expect(engine.update(tracking, 64).state).toBe("paused");
    expect(engine.update(tracking, 80).state).toBe("tracking");
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

  it("整手高速横移时不允许点击，静止后也必须重新完成释放冷却", () => {
    const engine = new GestureEngine();
    engine.update(makeGestureHand("tracking", { cursor: { x: 0.2, y: 0.4 } }), 0);
    engine.update(makeGestureHand("left", { cursor: { x: 0.8, y: 0.4 } }), 16);
    engine.update(makeGestureHand("left", { cursor: { x: 0.8, y: 0.4 } }), 32);
    engine.update(makeGestureHand("tracking", { cursor: { x: 0.8, y: 0.4 } }), 48);
    const released = engine.update(makeGestureHand("tracking", { cursor: { x: 0.8, y: 0.4 } }), 64);

    expect(released.click).toBe(false);
    expect(released.diagnostics.clickBlockingReason).toBe("suppressed");
  });

  it.each(["double", "scroll"] as const)("不启用已取消的 %s 动作", (gesture) => {
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
    expect(engine.update(null, 16)).toMatchObject({
      state: "tracking",
      click: false,
      diagnostics: { trackingSource: "predicted" },
    });
    expect(engine.update(makeGestureHand("left"), 32).click).toBe(false);
    expect(engine.update(makeGestureHand("left"), 20)).toMatchObject({
      state: "lost",
      click: false,
      diagnostics: { trackingSource: "lost" },
    });
  });

  it("记录不含图像数据且点击帧可回放", () => {
    const engine = new GestureEngine();
    const left = makeGestureHand("left");
    engine.update(makeGestureHand("tracking"), 0, left);
    engine.update(left, 16, left);
    engine.update(left, 32, left);
    engine.update(makeGestureHand("tracking"), 48, left);
    engine.update(makeGestureHand("tracking"), 64, left);

    const trace = engine.getTrace();
    expect(trace.frames.at(-1)?.events).toEqual(["click"]);
    expect(JSON.stringify(trace)).not.toContain("data:image");
    expect(JSON.stringify(trace)).not.toContain("imageData");
  });

  it("右键轨迹记录真实比例和单次释放事件", () => {
    const engine = new GestureEngine();
    const tracking = makeGestureHand("tracking");
    const right = makeGestureHand("right");
    engine.update(tracking, 0);
    engine.update(right, 16);
    engine.update(right, 32);
    engine.update(right, 48);
    engine.update(tracking, 64);
    engine.update(tracking, 80);

    const last = engine.getTrace().frames.at(-1)!;
    expect(last.events).toEqual(["rightClick"]);
    expect(last.features?.rightPinchRatio).not.toBe(1);
  });

  it("轨迹保留原始异常点但记录稳定层质量与安全门", () => {
    const engine = new GestureEngine();
    const tracking = makeGestureHand("tracking");
    engine.update(tracking, 0);
    const broken = tracking.map((point) => ({ ...point }));
    broken[8] = { ...broken[4]!, x: broken[4]!.x + 0.001 };

    engine.update(broken, 16);

    const frame = engine.getTrace().frames.at(-1)!;
    expect(frame.landmarks![8]).toEqual(broken[8]);
    expect(frame.quality).toBeCloseTo(0.88);
    expect(frame.features?.safetyGatePassed).toBe(false);
  });
});
