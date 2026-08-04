import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { GestureOutput } from "../gesture/types";
import { GestureDiagnostics } from "./GestureDiagnostics";

const output: GestureOutput = {
  state: "left-pinching",
  cursor: { x: 0.4, y: 0.3 },
  click: false,
  rightClick: false,
  doubleClick: false,
  scrollY: 0,
  dragStart: false,
  dragEnd: false,
  phase: "candidate",
  candidate: "left",
  lockedGesture: null,
  confirmationProgress: 0.75,
  diagnostics: {
    timestampMs: 120,
    quality: 1,
    palmScale: 0.234,
    leftPinchRatio: 0.21,
    worldLeftPinchRatio: 0.22,
    pinchDepthReliable: true,
    rightPinchRatio: 0.61,
    doublePinchRatio: 0.72,
    openPalmScore: 0.18,
    scrollPoseScore: 0.43,
  },
};

describe("GestureDiagnostics", () => {
  it("renders candidate, lock, progress, normalized ratios, scale, score, and quality", () => {
    render(<GestureDiagnostics output={output} />);

    expect(screen.getByText("候选确认")).toBeInTheDocument();
    expect(screen.getByText("左键")).toBeInTheDocument();
    expect(screen.getByText("3/4")).toBeInTheDocument();
    expect(screen.getByText("0.234")).toBeInTheDocument();
    expect(screen.getByText("0.210 / 0.610 / 0.720")).toBeInTheDocument();
    expect(screen.getByText("世界捏合比例")).toBeInTheDocument();
    expect(screen.getByText("0.220")).toBeInTheDocument();
    expect(screen.getByText("深度验证")).toBeInTheDocument();
    expect(screen.getByText("可靠")).toBeInTheDocument();
    expect(screen.getByText("0.430")).toBeInTheDocument();
    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("offers explicit local export only when a desktop callback is provided", async () => {
    const onSaveTrace = vi.fn().mockResolvedValue("saved");
    const { rerender } = render(<GestureDiagnostics output={output} />);
    expect(screen.queryByRole("button", { name: "保存诊断记录" })).not.toBeInTheDocument();

    rerender(<GestureDiagnostics output={output} onSaveTrace={onSaveTrace} />);
    fireEvent.click(screen.getByRole("button", { name: "保存诊断记录" }));

    expect(onSaveTrace).toHaveBeenCalledOnce();
    expect(await screen.findByText("诊断记录已保存到本机")).toBeInTheDocument();
  });
});
