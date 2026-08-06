import { describe, expect, it } from "vitest";

import {
  PinchClickStateMachine,
  type PinchClickEvidence,
} from "./pinchClickStateMachine";

const point = (x = 0.5, y = 0.5) => ({ x, y, z: 0 });
const separated = (x = 0.5, y = 0.5): PinchClickEvidence => ({
  contact: false,
  separated: true,
  blockingReason: "image",
  cursor: point(x, y),
  motionCursor: point(x, y),
  suppressed: false,
});
const contact = (x = 0.5, y = 0.5): PinchClickEvidence => ({
  contact: true,
  separated: false,
  blockingReason: "none",
  cursor: point(x, y),
  motionCursor: point(x, y),
  suppressed: false,
});

describe("PinchClickStateMachine", () => {
  it("启动或跟踪恢复时已经处于捏合，必须先完整释放才能布防", () => {
    const machine = new PinchClickStateMachine();
    machine.update(contact(), 0);
    machine.update(contact(), 16);
    machine.update(separated(), 32);
    expect(machine.update(separated(), 48).clicked).toBe(false);

    machine.update(separated(), 64);
    machine.update(contact(), 80);
    machine.update(contact(), 96);
    machine.update(separated(), 112);
    expect(machine.update(separated(), 128).clicked).toBe(true);
  });

  it("稳定捏合后只在稳定释放时点击一次，并使用捏合前锁定位置", () => {
    const machine = new PinchClickStateMachine();
    machine.update(separated(0.42, 0.36), 0);
    expect(machine.update(contact(0.44, 0.37), 16)).toMatchObject({
      phase: "candidate", clicked: false, contactFrames: 1,
    });
    expect(machine.update(contact(0.45, 0.38), 32)).toMatchObject({
      phase: "active", clicked: false, active: true,
    });
    expect(machine.update(separated(0.46, 0.39), 48)).toMatchObject({
      phase: "releasing", clicked: false,
    });
    expect(machine.update(separated(0.46, 0.39), 64)).toMatchObject({
      phase: "cooldown",
      clicked: true,
      clickCursor: { x: 0.42, y: 0.36 },
    });
    expect(machine.update(separated(0.46, 0.39), 80).clicked).toBe(false);
  });

  it("稳定捏合达到阈值只开始一次长按，释放时结束且不点击", () => {
    const machine = new PinchClickStateMachine({ longPressMs: 420 });
    machine.update(separated(0.42, 0.36), 0);
    machine.update(contact(0.44, 0.37), 16);
    machine.update(contact(0.44, 0.37), 32);
    machine.update(contact(0.44, 0.37), 132);
    machine.update(contact(0.44, 0.37), 232);
    machine.update(contact(0.44, 0.37), 332);

    expect(machine.update(contact(0.44, 0.37), 435)).toMatchObject({
      holdStarted: false,
      holdEnded: false,
      holding: false,
    });
    expect(machine.update(contact(0.44, 0.37), 436)).toMatchObject({
      phase: "dragging",
      holdStarted: true,
      holdEnded: false,
      holding: true,
      holdCursor: { x: 0.42, y: 0.36 },
      clicked: false,
    });
    expect(machine.update(contact(0.6, 0.37), 452)).toMatchObject({
      phase: "dragging",
      holdStarted: false,
      holdEnded: false,
      holding: true,
      clicked: false,
    });
    expect(machine.update(separated(0.6, 0.37), 468)).toMatchObject({
      phase: "releasing",
      holdEnded: false,
      holding: true,
    });
    expect(machine.update(separated(0.6, 0.37), 484)).toMatchObject({
      phase: "cooldown",
      holdStarted: false,
      holdEnded: true,
      holding: false,
      clicked: false,
    });
  });

  it("长按进度使用真实时间并在按下帧精确到 1", () => {
    const machine = new PinchClickStateMachine({ longPressMs: 420 });
    machine.update(separated(), 0);
    expect(machine.update(contact(), 16).holdProgress).toBe(0);
    machine.update(contact(), 32);
    machine.update(contact(), 132);
    expect(machine.update(contact(), 226).holdProgress).toBeCloseTo(0.5, 6);
    machine.update(contact(), 332);
    expect(machine.update(contact(), 435).holdProgress).toBeCloseTo(419 / 420, 6);
    expect(machine.update(contact(), 436)).toMatchObject({
      holdStarted: true,
      holding: true,
      holdProgress: 1,
    });
    expect(machine.update(separated(), 452).holdProgress).toBe(1);
    expect(machine.update(separated(), 468)).toMatchObject({
      holdEnded: true,
      holdProgress: 0,
    });
  });

  it("非长按释放和安全中断立即清空进度", () => {
    const release = new PinchClickStateMachine();
    release.update(separated(), 0);
    release.update(contact(), 16);
    release.update(contact(), 32);
    expect(release.update(separated(), 48).holdProgress).toBe(0);

    const blocked = new PinchClickStateMachine();
    blocked.update(separated(), 0);
    blocked.update(contact(), 16);
    expect(blocked.update({ ...contact(), suppressed: true }, 32).holdProgress).toBe(0);

    const interrupted = new PinchClickStateMachine({ longPressMs: 150, maxFrameGapMs: 250 });
    interrupted.update(separated(), 0);
    interrupted.update(contact(), 16);
    interrupted.update(contact(), 32);
    interrupted.update(contact(), 116);
    expect(interrupted.update(contact(), 166).holdProgress).toBe(1);
    expect(interrupted.update(null, 182)).toMatchObject({
      holdEnded: true,
      holdProgress: 0,
    });
  });

  it("长按时丢手会立即产生一次安全抬起边沿", () => {
    const machine = new PinchClickStateMachine({ longPressMs: 150, maxFrameGapMs: 250 });
    machine.update(separated(), 0);
    machine.update(contact(), 16);
    machine.update(contact(), 32);
    machine.update(contact(), 116);
    expect(machine.update(contact(), 166).holdStarted).toBe(true);

    expect(machine.update(null, 182)).toMatchObject({
      phase: "lost",
      holdEnded: true,
      holding: false,
      clicked: false,
    });
    expect(machine.update(null, 198).holdEnded).toBe(false);
  });

  it("长按时张掌或握拳抑制会立即产生一次安全抬起边沿", () => {
    const machine = new PinchClickStateMachine({ longPressMs: 150, maxFrameGapMs: 250 });
    machine.update(separated(), 0);
    machine.update(contact(), 16);
    machine.update(contact(), 32);
    machine.update(contact(), 116);
    expect(machine.update(contact(), 166).holdStarted).toBe(true);

    expect(machine.update({ ...contact(), suppressed: true }, 182)).toMatchObject({
      phase: "cooldown",
      holdEnded: true,
      holding: false,
      clicked: false,
      blockingReason: "suppressed",
    });
    expect(machine.update({ ...contact(), suppressed: true }, 198).holdEnded).toBe(false);
  });

  it("单帧重合和未完成释放都不能点击", () => {
    const machine = new PinchClickStateMachine();
    machine.update(separated(), 0);
    machine.update(contact(), 16);
    expect(machine.update(separated(), 32).clicked).toBe(false);
    machine.update(contact(), 48);
    machine.update(contact(), 64);
    expect(machine.update(separated(), 80).clicked).toBe(false);
  });

  it("高速移动时取消候选且随后释放也不点击", () => {
    const machine = new PinchClickStateMachine({ maxCursorSpeed: 2 });
    machine.update(separated(0.1), 0);
    const blocked = machine.update(contact(0.7), 16);

    expect(blocked).toMatchObject({ clicked: false, blockingReason: "high-speed" });
    machine.update(contact(0.7), 32);
    machine.update(separated(0.7), 48);
    expect(machine.update(separated(0.7), 64).clicked).toBe(false);
  });

  it("张掌或握拳抑制后必须经过冷却和连续干净帧才能重新布防", () => {
    const machine = new PinchClickStateMachine({ suppressionCooldownMs: 80, requiredCleanFrames: 3 });
    machine.update({ ...separated(), suppressed: true }, 0);
    expect(machine.update(contact(), 16)).toMatchObject({ phase: "cooldown", clicked: false });
    machine.update(separated(), 80);
    machine.update(separated(), 96);
    expect(machine.update(contact(), 112).clicked).toBe(false);
    machine.update(separated(), 128);
    machine.update(separated(), 144);
    machine.update(separated(), 160);
    machine.update(contact(), 176);
    machine.update(contact(), 192);
    machine.update(separated(), 208);
    expect(machine.update(separated(), 224).clicked).toBe(true);
  });

  it("长按开始前移动范围过大和跟踪断帧都取消点击", () => {
    const travel = new PinchClickStateMachine({ maxCursorSpeed: 10, maxTravel: 0.08 });
    travel.update(separated(0.4), 0);
    travel.update(contact(0.4), 16);
    travel.update(contact(0.4), 32);
    expect(travel.update(contact(0.51), 48).blockingReason).toBe("travel");
    travel.update(separated(0.51), 64);
    expect(travel.update(separated(0.51), 80).clicked).toBe(false);
  });
});
