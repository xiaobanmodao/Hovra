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
    trackingSource: "observed",
    trackingQuality: 1,
    rejectedLandmarkCount: 0,
    palmScale: 0.234,
    screenPinchGap: 0.019,
    imageAspectRatio: 16 / 9,
    worldPalmScale: null,
    palmFacingScore: null,
    leftPinchRatio: 0.21,
    worldLeftPinchRatio: null,
    pinchDepthReliable: true,
    rightPinchRatio: 0.61,
    doublePinchRatio: 0.72,
    openPalmScore: 0.18,
    scrollPoseScore: 0.43,
    pinchProbability: 0.81,
    pinchImageDepthGap: 0.07,
    pinchWorldQuality: 0.76,
    pinchQualityReasons: ["ratio-jitter"],
    pinchBlockingReason: "depth",
    pinchEnterVotes: 1,
    pinchRequiredVotes: 2,
    effectiveFps: 58.4,
    inferenceMs: 9.2,
    pinchModelMode: "mediapipe",
    visionPinchRatio: null,
    visionConfidence: null,
    visionAgeMs: null,
    visionInferenceMs: null,
    modelAgreement: null,
    pinchScreenRatio: 0.18,
    pinchSpatialRatio: 0.21,
    pinchEnterRatio: 0.33,
    pinchExitRatio: 0.5,
    cursorSpeed: 2.4,
    clickBlockingReason: "high-speed",
    fistCandidate: false,
  },
};

describe("GestureDiagnostics", () => {
  it("只展示与稳定内核实时判定一致的中文诊断", () => {
    render(<GestureDiagnostics output={output} />);

    expect(screen.getByText("识别引擎：稳定内核")).toBeInTheDocument();
    expect(screen.getByText("候选确认")).toBeInTheDocument();
    expect(screen.getByText("左键")).toBeInTheDocument();
    expect(screen.getByText("75%" )).toBeInTheDocument();
    expect(screen.getByText("0.234")).toBeInTheDocument();
    expect(screen.getByText("二维捏合比例")).toBeInTheDocument();
    expect(screen.getByText("0.180")).toBeInTheDocument();
    expect(screen.getByText("纵深捏合比例")).toBeInTheDocument();
    expect(screen.getByText("0.070")).toBeInTheDocument();
    expect(screen.getByText("空间捏合比例")).toBeInTheDocument();
    expect(screen.getByText("0.210")).toBeInTheDocument();
    expect(screen.getByText("接触阈值")).toBeInTheDocument();
    expect(screen.getByText("0.330")).toBeInTheDocument();
    expect(screen.getByText("释放阈值")).toBeInTheDocument();
    expect(screen.getByText("0.500")).toBeInTheDocument();
    expect(screen.getByText("连续接触确认")).toBeInTheDocument();
    expect(screen.getByText("1/2")).toBeInTheDocument();
    expect(screen.getByText("指尖在画面中重合，但纵深仍分离")).toBeInTheDocument();
    expect(screen.getByText("移动过快，已阻止点击")).toBeInTheDocument();
    expect(screen.getByText("2.40 屏/秒")).toBeInTheDocument();
    expect(screen.getByText("58.4 帧/秒")).toBeInTheDocument();
    expect(screen.getByText("9.2 毫秒")).toBeInTheDocument();
    expect(screen.queryByText("Apple Vision")).not.toBeInTheDocument();
    expect(screen.queryByText("世界坐标质量")).not.toBeInTheDocument();
  });

  it("用中文显示追踪来源、质量和异常关节数", () => {
    const predicted = {
      ...output.diagnostics,
      trackingSource: "predicted" as const,
      trackingQuality: 0.15,
      rejectedLandmarkCount: 2,
    };

    render(<GestureDiagnostics output={{ ...output, diagnostics: predicted }} />);

    expect(screen.getByText("追踪来源").nextElementSibling).toHaveTextContent("短时预测");
    expect(screen.getByText("追踪质量").nextElementSibling).toHaveTextContent("15%");
    expect(screen.getByText("异常关节点").nextElementSibling).toHaveTextContent("2");
  });

  it("offers explicit local export only when a desktop callback is provided", async () => {
    const onSaveTrace = vi.fn().mockResolvedValue("saved");
    const { rerender } = render(<GestureDiagnostics output={output} />);
    expect(screen.queryByRole("button", { name: "保存诊断记录" })).not.toBeInTheDocument();

    rerender(<GestureDiagnostics output={output} onSaveTrace={onSaveTrace} />);
    fireEvent.click(screen.getByRole("button", { name: "保存诊断记录" }));

    expect(onSaveTrace).toHaveBeenCalledOnce();
    expect(await screen.findByText("诊断记录已保存到本机")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "保存当前手部样本（仅本机）" })).not.toBeInTheDocument();
  });
});
