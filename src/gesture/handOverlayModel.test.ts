import { describe, expect, it } from "vitest";

import { makeGestureHand } from "./fixtures/stable-gesture-sequences";
import { buildHandOverlayModel } from "./handOverlayModel";

describe("精确对齐的 2.5D 手部覆盖模型", () => {
  it("生成完整掌面、21 个关节和由远到近排序的 20 个骨段", () => {
    const image = makeGestureHand("open-palm").map((point, index) => ({ ...point, z: index * 0.002 }));
    const model = buildHandOverlayModel(image, image, { phase: "neutral", blockingReason: null });

    expect(model?.palm.indices).toEqual([0, 5, 9, 13, 17]);
    expect(model?.joints).toHaveLength(21);
    expect(model?.bones).toHaveLength(20);
    expect(model!.bones.every((bone, index, bones) => index === 0 || bones[index - 1]!.depth >= bone.depth)).toBe(true);
  });

  it("骨段向指尖逐级变细且 21 个覆盖点保留模型原始二维坐标", () => {
    const image = makeGestureHand("open-palm");
    image[8] = { ...image[8]!, x: image[7]!.x + 4, y: image[7]!.y + 4 };
    const model = buildHandOverlayModel(image, null, { phase: "neutral", blockingReason: null });
    const indexBase = model!.bones.find((bone) => bone.from === 5 && bone.to === 6)!;
    const indexTip = model!.bones.find((bone) => bone.from === 7 && bone.to === 8)!;

    expect(indexTip.width).toBeLessThan(indexBase.width);
    expect(model!.points.map(({ x, y }) => ({ x, y }))).toEqual(
      image.map(({ x, y }) => ({ x, y })),
    );
  });

  it("世界坐标只提供纵深，不改变任何关节的二维位置", () => {
    const image = makeGestureHand("open-palm");
    const world = image.map((point, index) => ({
      x: point.x + 10,
      y: point.y - 10,
      z: index * 0.01,
    }));
    const model = buildHandOverlayModel(image, world);

    expect(model!.points.map(({ x, y }) => ({ x, y }))).toEqual(
      image.map(({ x, y }) => ({ x, y })),
    );
    expect(model!.points.map(({ z }) => z)).toEqual(world.map(({ z }) => z));
  });

  it("候选捏合显示拇指与食指连接带并区分可点击和阻止状态", () => {
    const hand = makeGestureHand("left");
    const ready = buildHandOverlayModel(hand, null, { phase: "candidate", blockingReason: null });
    const blocked = buildHandOverlayModel(hand, null, { phase: "candidate", blockingReason: "high-speed" });

    expect(ready?.pinchBridge).toMatchObject({ from: 4, to: 8, state: "ready" });
    expect(ready?.statusLabel).toBe("捏合候选：保持稳定后释放");
    expect(blocked?.pinchBridge?.state).toBe("blocked");
    expect(blocked?.statusLabel).toContain("移动过快");
  });

  it("长按阶段保持指尖连接并明确提示松开释放", () => {
    const hand = makeGestureHand("left");
    const holding = buildHandOverlayModel(hand, null, {
      phase: "dragging",
      state: "dragging",
      blockingReason: null,
    });

    expect(holding?.pinchBridge).toMatchObject({ from: 4, to: 8, state: "active" });
    expect(holding?.statusLabel).toBe("长按中：松开以释放");
  });

  it("滚动候选和锁定阶段不画捏合连接并显示滚动提示", () => {
    const hand = makeGestureHand("scroll");
    const candidate = buildHandOverlayModel(hand, null, {
      phase: "candidate",
      gesture: "scroll",
      state: "tracking",
      blockingReason: null,
    });
    const active = buildHandOverlayModel(hand, null, {
      phase: "active",
      gesture: "scroll",
      state: "scrolling",
      blockingReason: null,
    });

    expect(candidate?.pinchBridge).toBeNull();
    expect(candidate?.statusLabel).toBe("双指滚动候选：保持姿势");
    expect(active?.pinchBridge).toBeNull();
    expect(active?.statusLabel).toBe("双指滚动中：上下移动手掌");
  });

  it("点数不足或非法坐标时安全降级为无覆盖层", () => {
    expect(buildHandOverlayModel(makeGestureHand("tracking").slice(0, 20))).toBeNull();
    const invalid = makeGestureHand("tracking");
    invalid[4] = { ...invalid[4]!, z: Number.NaN };
    expect(buildHandOverlayModel(invalid)).toBeNull();
  });
});
