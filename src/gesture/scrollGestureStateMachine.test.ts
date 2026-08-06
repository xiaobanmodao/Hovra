import { describe, expect, it } from "vitest";

import {
  ScrollGestureStateMachine,
  type ScrollGestureEvidence,
} from "./scrollGestureStateMachine";

const evidence = (
  y = 0.5,
  overrides: Partial<ScrollGestureEvidence> = {},
): ScrollGestureEvidence => ({
  contact: true,
  retained: true,
  anchor: { x: 0.5, y, z: 0 },
  palmScale: 0.2,
  suppressed: false,
  ...overrides,
});

const activate = (machine: ScrollGestureStateMachine): void => {
  [0, 16, 32, 48, 64].forEach((at) => machine.update(evidence(), at));
};

describe("ScrollGestureStateMachine", () => {
  it("连续五帧才进入且候选阶段永远不滚动", () => {
    const machine = new ScrollGestureStateMachine();

    for (const [index, at] of [0, 16, 32, 48].entries()) {
      expect(machine.update(evidence(0.5 - index * 0.02), at)).toMatchObject({
        phase: "candidate",
        active: false,
        activated: false,
        contactFrames: index + 1,
        requiredContactFrames: 5,
        scrollY: 0,
      });
    }
    expect(machine.update(evidence(0.42), 64)).toMatchObject({
      phase: "active",
      active: true,
      activated: true,
      contactFrames: 5,
      scrollY: 0,
    });
  });

  it("锁定后上下移动产生方向相反的有界整数", () => {
    const machine = new ScrollGestureStateMachine();
    activate(machine);

    const upward = machine.update(evidence(0.46), 80);
    const downward = machine.update(evidence(0.51), 96);
    const clamped = machine.update(evidence(-1), 112);

    expect(upward.scrollY).toBeGreaterThan(0);
    expect(downward.scrollY).toBeLessThan(0);
    expect(Number.isInteger(upward.scrollY)).toBe(true);
    expect(Math.abs(clamped.scrollY)).toBe(12);
  });

  it("死区不更新基准，慢速移动和小数残差最终仍产生一步", () => {
    const machine = new ScrollGestureStateMachine();
    activate(machine);

    expect(machine.update(evidence(0.498), 80).scrollY).toBe(0);
    expect(machine.update(evidence(0.496), 96).scrollY).toBe(0);
    expect(machine.update(evidence(0.494), 112).scrollY).toBe(0);
    expect(machine.update(evidence(0.492), 128).scrollY).toBe(1);
  });

  it("连续三个退出帧才释放且退出期绝不滚动", () => {
    const machine = new ScrollGestureStateMachine();
    activate(machine);

    expect(machine.update(evidence(0.4, { retained: false }), 80)).toMatchObject({
      phase: "releasing",
      releaseFrames: 1,
      active: true,
      released: false,
      scrollY: 0,
    });
    expect(machine.update(evidence(0.3, { retained: false }), 96)).toMatchObject({
      phase: "releasing",
      releaseFrames: 2,
      active: true,
      scrollY: 0,
    });
    expect(machine.update(evidence(0.2, { retained: false }), 112)).toMatchObject({
      phase: "neutral",
      active: false,
      released: true,
      scrollY: 0,
    });
  });

  it("释放确认前恢复姿势会重设基准而不跳动", () => {
    const machine = new ScrollGestureStateMachine();
    activate(machine);
    machine.update(evidence(0.5, { retained: false }), 80);

    expect(machine.update(evidence(0.2), 96)).toMatchObject({
      phase: "active",
      active: true,
      scrollY: 0,
    });
    expect(machine.update(evidence(0.16), 112).scrollY).toBeGreaterThan(0);
  });

  it("候选中断、抑制、丢帧和非法时间立即安全复位", () => {
    const machine = new ScrollGestureStateMachine();
    machine.update(evidence(), 0);
    expect(machine.update(evidence(0.5, { contact: false }), 16).phase).toBe("neutral");

    activate(machine);
    expect(machine.update(evidence(0.4, { suppressed: true }), 80)).toMatchObject({
      phase: "neutral", active: false, scrollY: 0,
    });

    activate(machine);
    expect(machine.update(null, 80)).toMatchObject({ phase: "neutral", active: false });

    activate(machine);
    expect(machine.update(evidence(0.4), 20)).toMatchObject({ phase: "neutral", active: false });
  });

  it("拒绝无效锚点、掌部尺度和非法配置", () => {
    const machine = new ScrollGestureStateMachine();
    expect(machine.update(evidence(Number.NaN), 0).phase).toBe("neutral");
    expect(machine.update(evidence(0.5, { palmScale: 0 }), 16).phase).toBe("neutral");
    expect(() => new ScrollGestureStateMachine({ requiredContactFrames: 0 })).toThrow();
    expect(() => new ScrollGestureStateMachine({ maxStep: 1.5 })).toThrow();
  });
});
