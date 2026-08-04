import { describe, expect, it } from "vitest";
import {
  gestureKindLabel,
  gesturePhaseLabel,
  gestureStateLabel,
  pinchBlockingReasonLabel,
  pinchQualityReasonLabel,
} from "./zh-CN";

describe("Chinese gesture labels", () => {
  it("shows every gesture state in Chinese instead of its internal enum", () => {
    expect(gestureStateLabel("tracking")).toBe("跟踪中");
    expect(gestureStateLabel("left-pinching")).toBe("左键捏合");
    expect(gestureStateLabel("right-pinching")).toBe("右键捏合");
    expect(gestureStateLabel("double-pinching")).toBe("双击捏合");
    expect(gestureStateLabel("dragging")).toBe("拖动中");
    expect(gestureStateLabel("scrolling")).toBe("滚动中");
    expect(gestureStateLabel("paused")).toBe("已暂停");
    expect(gestureStateLabel("lost")).toBe("未检测到手部");
  });

  it("shows every recognition phase and optional gesture in Chinese", () => {
    expect(gesturePhaseLabel("neutral")).toBe("空闲");
    expect(gesturePhaseLabel("candidate")).toBe("候选确认");
    expect(gesturePhaseLabel("active")).toBe("已确认");
    expect(gesturePhaseLabel("dragging")).toBe("拖动中");
    expect(gesturePhaseLabel("releasing")).toBe("释放确认");
    expect(gesturePhaseLabel("cooldown")).toBe("冷却中");
    expect(gesturePhaseLabel("lost")).toBe("未检测到手部");
    expect(gestureKindLabel("left")).toBe("左键");
    expect(gestureKindLabel("right")).toBe("右键");
    expect(gestureKindLabel("double")).toBe("双击");
    expect(gestureKindLabel("scroll")).toBe("滚动");
    expect(gestureKindLabel("open-palm")).toBe("张开手掌");
    expect(gestureKindLabel(null)).toBe("—");
  });

  it("translates every adaptive pinch diagnostic reason", () => {
    expect(pinchQualityReasonLabel("world-missing")).toBe("世界坐标缺失");
    expect(pinchQualityReasonLabel("stale-frame")).toBe("视频帧已过期");
    expect(pinchQualityReasonLabel("scale-jump")).toBe("手掌尺度突变");
    expect(pinchQualityReasonLabel("bone-jitter")).toBe("掌骨坐标抖动");
    expect(pinchQualityReasonLabel("ratio-jitter")).toBe("比例抖动");
    expect(pinchBlockingReasonLabel("none")).toBe("无");
    expect(pinchBlockingReasonLabel("approach")).toBe("尚未观察到靠近过程");
  });
});
