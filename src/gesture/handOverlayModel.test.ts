import { describe, expect, it } from "vitest";

import { makeGestureHand } from "./fixtures/stable-gesture-sequences";
import { buildHandOverlayModel } from "./handOverlayModel";

describe("受约束 2.5D 手部覆盖模型", () => {
  it("生成完整掌面、21 个关节和由远到近排序的 20 个骨段", () => {
    const image = makeGestureHand("open-palm").map((point, index) => ({ ...point, z: index * 0.002 }));
    const model = buildHandOverlayModel(image, image, { phase: "neutral", blockingReason: null });

    expect(model?.palm.indices).toEqual([0, 5, 9, 13, 17]);
    expect(model?.joints).toHaveLength(21);
    expect(model?.bones).toHaveLength(20);
    expect(model!.bones.every((bone, index, bones) => index === 0 || bones[index - 1]!.depth >= bone.depth)).toBe(true);
  });

  it("骨段向指尖逐级变细并约束模型偶发的异常拉长", () => {
    const image = makeGestureHand("open-palm");
    image[8] = { ...image[8]!, x: image[7]!.x + 4, y: image[7]!.y + 4 };
    const model = buildHandOverlayModel(image, null, { phase: "neutral", blockingReason: null });
    const indexBase = model!.bones.find((bone) => bone.from === 5 && bone.to === 6)!;
    const indexTip = model!.bones.find((bone) => bone.from === 7 && bone.to === 8)!;
    const tipDistance = Math.hypot(
      model!.points[8]!.x - model!.points[7]!.x,
      model!.points[8]!.y - model!.points[7]!.y,
    );

    expect(indexTip.width).toBeLessThan(indexBase.width);
    expect(tipDistance).toBeLessThan(model!.palmScale * 0.6);
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

  it("点数不足或非法坐标时安全降级为无覆盖层", () => {
    expect(buildHandOverlayModel(makeGestureHand("tracking").slice(0, 20))).toBeNull();
    const invalid = makeGestureHand("tracking");
    invalid[4] = { ...invalid[4]!, z: Number.NaN };
    expect(buildHandOverlayModel(invalid)).toBeNull();
  });
});

