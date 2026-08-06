import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { StabilitySession } from "../gesture/stabilityTest";
import type { StabilityReport } from "../gesture/stabilityTuning";
import { StabilityTestPanel } from "./StabilityTestPanel";

const idle: StabilitySession = {
  phase: "idle", startedAt: 0, lastObservedAt: null, stepIndex: 0,
  stepElapsedMs: 0, samples: [], quality: { valid: false, message: "尚未开始" },
};
const running: StabilitySession = {
  ...idle, phase: "positive", quality: { valid: false, message: "手掌未完整进入画面" },
};
const report = (safe: boolean): StabilityReport => ({
  metrics: { positives: 20, truePositives: 19, falsePositives: 0, duplicateClicks: 0,
    recall: 0.95, p95ActivationLatencyMs: 80, effectiveFps: 30, p95InferenceMs: 9 },
  scenarios: {}, passed: true,
  recommendation: safe
    ? { safe: true, enterRatio: 0.35, exitRatio: 0.52, reason: "样本边界清晰，可安全应用" }
    : { safe: false, enterRatio: null, exitRatio: null, reason: "测试样本不足" },
});
const callbacks = () => ({ onStart: vi.fn(), onCancel: vi.fn(), onApply: vi.fn(), onRestore: vi.fn(), onSave: vi.fn() });

describe("StabilityTestPanel", () => {
  it("从中文入口开始测试", () => {
    const actions = callbacks();
    render(<StabilityTestPanel session={idle} report={null} applied={false} canStart {...actions} />);
    fireEvent.click(screen.getByRole("button", { name: "开始稳定性测试" }));
    expect(actions.onStart).toHaveBeenCalledOnce();
    expect(screen.getByText(/约 4 分钟/)).toBeInTheDocument();
  });

  it("运行时显示当前动作、进度和质量原因", () => {
    render(<StabilityTestPanel session={running} report={null} applied={false} canStart {...callbacks()} />);
    expect(screen.getByRole("heading", { name: "稳定性测试" })).toBeInTheDocument();
    expect(screen.getByText("正面捏合")).toBeInTheDocument();
    expect(screen.getByText("手掌未完整进入画面")).toBeInTheDocument();
    expect(screen.getByText(/第 1 次，共 20 次/)).toBeInTheDocument();
    expect(screen.getByAltText("拇指与食指捏合示意图")).toBeInTheDocument();
  });

  it("不安全建议不能应用", () => {
    render(<StabilityTestPanel session={{ ...idle, phase: "complete" }} report={report(false)} applied={false} canStart {...callbacks()} />);
    expect(screen.getByRole("button", { name: "应用推荐设置" })).toBeDisabled();
    expect(screen.getByText("测试样本不足")).toBeInTheDocument();
  });

  it("显示结果并允许应用和恢复", () => {
    const actions = callbacks();
    const { rerender } = render(<StabilityTestPanel session={{ ...idle, phase: "complete" }} report={report(true)} applied={false} canStart {...actions} />);
    expect(screen.getByText("95.0%")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "应用推荐设置" }));
    expect(actions.onApply).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "保存测试报告" }));
    expect(actions.onSave).toHaveBeenCalledOnce();
    rerender(<StabilityTestPanel session={{ ...idle, phase: "complete" }} report={report(true)} applied canStart {...actions} />);
    expect(screen.getByRole("button", { name: "恢复测试前设置" })).toBeEnabled();
  });
});
