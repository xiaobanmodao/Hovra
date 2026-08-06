import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { GestureOutput } from "../gesture/types";
import { Playground } from "./Playground";

const idle: GestureOutput = {
  state: "tracking",
  cursor: null,
  click: false,
  rightClick: false,
  doubleClick: false,
  scrollY: 0,
  dragStart: false,
  dragEnd: false,
  phase: "neutral",
  candidate: null,
  lockedGesture: null,
  confirmationProgress: 0,
  longPressProgress: 0,
  diagnostics: {
    timestampMs: 0,
    quality: 1,
    trackingSource: "observed",
    trackingQuality: 1,
    rejectedLandmarkCount: 0,
    palmScale: null,
    screenPinchGap: null,
    imageAspectRatio: 1,
    worldPalmScale: null,
    palmFacingScore: null,
    leftPinchRatio: null,
    worldLeftPinchRatio: null,
    pinchDepthReliable: false,
    rightPinchRatio: null,
    doublePinchRatio: null,
    openPalmScore: null,
    scrollPoseScore: null,
    pinchProbability: null,
    pinchImageDepthGap: null,
    pinchWorldQuality: 0,
    pinchQualityReasons: [],
    pinchBlockingReason: null,
    pinchEnterVotes: 0,
    pinchRequiredVotes: 2,
    effectiveFps: null,
    inferenceMs: null,
    pinchModelMode: "mediapipe",
    visionPinchRatio: null,
    visionConfidence: null,
    visionAgeMs: null,
    visionInferenceMs: null,
    modelAgreement: null,
  },
};

beforeEach(() => {
  vi.stubGlobal("innerWidth", 1024);
  vi.stubGlobal("innerHeight", 768);
});

describe("Playground", () => {
  it("显示移动、左右键、长按、滚动和张掌停止说明", () => {
    render(<Playground cursor={null} output={idle} />);

    expect(screen.getByText(/移动光标/)).toBeInTheDocument();
    expect(screen.getByText(/拇指 \+ 食指：左键点击/)).toBeInTheDocument();
    expect(screen.getByText(/拇指 \+ 中指：右键/)).toBeInTheDocument();
    expect(screen.getByText(/保持捏合：长按/)).toBeInTheDocument();
    expect(screen.getByText(/食指 \+ 中指：上下滚动/)).toBeInTheDocument();
    expect(screen.getByText(/张开手掌：停止/)).toBeInTheDocument();
    expect(screen.getByText("右键次数：0")).toBeInTheDocument();
    expect(screen.getByText("累计滚动：0")).toBeInTheDocument();
    expect(screen.queryByText(/双击次数/)).not.toBeInTheDocument();
    expect(screen.queryByTestId("draggable-card")).not.toBeInTheDocument();
  });

  it("counts a left click only when the virtual cursor is over the target", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      bottom: 176,
      height: 144,
      left: 848,
      right: 992,
      top: 32,
      width: 144,
      x: 848,
      y: 32,
      toJSON: () => ({}),
    } as DOMRect);

    const { rerender } = render(
      <Playground cursor={{ x: 900, y: 100 }} output={{ ...idle, click: true }} />,
    );
    expect(screen.getByText("点击次数：1")).toBeInTheDocument();

    rerender(<Playground cursor={{ x: 20, y: 20 }} output={{ ...idle, click: false }} />);
    rerender(<Playground cursor={{ x: 20, y: 20 }} output={{ ...idle, click: true }} />);
    expect(screen.getByText("点击次数：1")).toBeInTheDocument();
  });

  it("只在虚拟光标位于目标内时统计右键", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      bottom: 176,
      height: 144,
      left: 848,
      right: 992,
      top: 32,
      width: 144,
      x: 848,
      y: 32,
      toJSON: () => ({}),
    } as DOMRect);

    const { rerender } = render(
      <Playground cursor={{ x: 900, y: 100 }} output={{ ...idle, rightClick: true }} />,
    );
    expect(screen.getByText("右键次数：1")).toBeInTheDocument();

    rerender(<Playground cursor={{ x: 20, y: 20 }} output={{ ...idle, rightClick: false }} />);
    rerender(<Playground cursor={{ x: 20, y: 20 }} output={{ ...idle, rightClick: true }} />);
    expect(screen.getByText("右键次数：1")).toBeInTheDocument();
  });

  it("累计显示每一帧有符号滚动量", () => {
    const { rerender } = render(
      <Playground cursor={null} output={{ ...idle, scrollY: 3 }} />,
    );
    expect(screen.getByText("累计滚动：3")).toBeInTheDocument();

    rerender(<Playground cursor={null} output={{ ...idle, scrollY: 0 }} />);
    rerender(<Playground cursor={null} output={{ ...idle, scrollY: -1 }} />);
    expect(screen.getByText("累计滚动：2")).toBeInTheDocument();
  });
});
