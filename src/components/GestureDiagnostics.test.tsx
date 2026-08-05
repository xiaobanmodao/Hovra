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
    screenPinchGap: 0.019,
    imageAspectRatio: 16 / 9,
    worldPalmScale: 0.112,
    palmFacingScore: 0.18,
    leftPinchRatio: 0.21,
    worldLeftPinchRatio: 0.22,
    pinchDepthReliable: true,
    rightPinchRatio: 0.61,
    doublePinchRatio: 0.72,
    openPalmScore: 0.18,
    scrollPoseScore: 0.43,
    pinchProbability: 0.81,
    pinchImageDepthGap: 0.07,
    pinchWorldQuality: 0.76,
    pinchQualityReasons: ["ratio-jitter"],
    pinchBlockingReason: "approach",
    pinchEnterVotes: 2,
    pinchRequiredVotes: 3,
    effectiveFps: 58.4,
    inferenceMs: 9.2,
  },
};

describe("GestureDiagnostics", () => {
  it("renders candidate, lock, progress, normalized ratios, scale, score, and quality", () => {
    render(<GestureDiagnostics output={output} />);

    expect(screen.getByText("候选确认")).toBeInTheDocument();
    expect(screen.getByText("左键")).toBeInTheDocument();
    expect(screen.getByText("3/4")).toBeInTheDocument();
    expect(screen.getByText("0.234")).toBeInTheDocument();
    expect(screen.getByText("二维指尖间隙")).toBeInTheDocument();
    expect(screen.getByText("0.019")).toBeInTheDocument();
    expect(screen.getByText("画面宽高比")).toBeInTheDocument();
    expect(screen.getByText("1.778")).toBeInTheDocument();
    expect(screen.getByText("世界手掌尺度")).toBeInTheDocument();
    expect(screen.getByText("0.112")).toBeInTheDocument();
    expect(screen.getByText("手掌朝向")).toBeInTheDocument();
    expect(screen.getByText("侧向（0.180）")).toBeInTheDocument();
    expect(screen.getByText("0.210 / 0.610 / 0.720")).toBeInTheDocument();
    expect(screen.getByText("世界捏合比例")).toBeInTheDocument();
    expect(screen.getByText("0.220")).toBeInTheDocument();
    expect(screen.getByText("深度验证")).toBeInTheDocument();
    expect(screen.getByText("可靠")).toBeInTheDocument();
    expect(screen.getByText("0.430")).toBeInTheDocument();
    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByText("接触概率")).toBeInTheDocument();
    expect(screen.getByText("81%")) .toBeInTheDocument();
    expect(screen.getByText("世界坐标质量")).toBeInTheDocument();
    expect(screen.getByText("76%")) .toBeInTheDocument();
    expect(screen.getByText("投票")).toBeInTheDocument();
    expect(screen.getByText("2/3")).toBeInTheDocument();
    expect(screen.getByText("比例抖动")).toBeInTheDocument();
    expect(screen.getByText("尚未观察到靠近过程")).toBeInTheDocument();
    expect(screen.getByText("58.4 帧/秒")).toBeInTheDocument();
    expect(screen.getByText("9.2 毫秒")).toBeInTheDocument();
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
