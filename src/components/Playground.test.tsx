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
  diagnostics: {
    timestampMs: 0,
    quality: 1,
    palmScale: null,
    leftPinchRatio: null,
    rightPinchRatio: null,
    doublePinchRatio: null,
    openPalmScore: null,
    scrollPoseScore: null,
  },
};

beforeEach(() => {
  vi.stubGlobal("innerWidth", 1024);
  vi.stubGlobal("innerHeight", 768);
});

describe("Playground", () => {
  it("shows only the movement, left-click, and open-palm stop instructions", () => {
    render(<Playground cursor={null} output={idle} />);

    expect(screen.getByText(/移动光标/)).toBeInTheDocument();
    expect(screen.getByText(/拇指 \+ 食指：左键点击/)).toBeInTheDocument();
    expect(screen.getByText(/张开手掌：停止/)).toBeInTheDocument();
    expect(screen.queryByText(/右键次数/)).not.toBeInTheDocument();
    expect(screen.queryByText(/双击次数/)).not.toBeInTheDocument();
    expect(screen.queryByText(/滚动：/)).not.toBeInTheDocument();
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
});
