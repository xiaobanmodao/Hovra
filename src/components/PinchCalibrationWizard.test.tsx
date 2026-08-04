import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { PinchCalibrationSample } from "../gesture/pinchCalibration";
import { PinchCalibrationWizard } from "./PinchCalibrationWizard";

const contact: PinchCalibrationSample = { imageRatio: 0.24, worldRatio: 0.23, depthGap: 0.08 };
const falseOverlap: PinchCalibrationSample = { imageRatio: 0.25, worldRatio: 0.62, depthGap: 0.4 };

afterEach(() => vi.useRealTimers());

describe("PinchCalibrationWizard", () => {
  it("shows the correct realistic hand guide for each calibration stage", () => {
    vi.useFakeTimers();
    render(
      <PinchCalibrationWizard currentSample={contact} onComplete={vi.fn()} onCancel={vi.fn()} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "开始三秒基线采集" }));
    expect(screen.getByRole("img", { name: "张开手掌并缓慢左右移动" })).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(3_000));
    expect(screen.getByRole("img", { name: "正面使用拇指和食指真实接触" })).toBeInTheDocument();
    expect(screen.getByText("只使用拇指和食指；其余三指不要弯曲参与。"))
      .toBeInTheDocument();

    for (let count = 0; count < 5; count += 1) {
      fireEvent.click(screen.getByRole("button", { name: "记录当前接触" }));
    }
    expect(screen.getByRole("img", { name: "侧面使用拇指和食指真实接触" }))
      .toBeInTheDocument();

    for (let count = 0; count < 5; count += 1) {
      fireEvent.click(screen.getByRole("button", { name: "记录当前接触" }));
    }
    expect(screen.getByRole("img", { name: "拇指和食指画面重合但实际前后分开" }))
      .toBeInTheDocument();
    expect(screen.getByText("让两指在画面中重合，但实际前后分开 2–3 厘米，不要接触。"))
      .toBeInTheDocument();
    expect(screen.getByText("保持前后分开")).toBeInTheDocument();
  });

  it("collects baseline, five front, five side, and three false-overlap samples", () => {
    vi.useFakeTimers();
    const onComplete = vi.fn();
    const { rerender } = render(
      <PinchCalibrationWizard currentSample={contact} onComplete={onComplete} onCancel={vi.fn()} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "开始三秒基线采集" }));
    expect(screen.getByText(/自然移动手掌/)).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(3_000));
    expect(screen.getByText(/正面捏合/)).toBeInTheDocument();

    for (let count = 0; count < 5; count += 1) {
      fireEvent.click(screen.getByRole("button", { name: "记录当前接触" }));
    }
    expect(screen.getByText(/侧向或斜向捏合/)).toBeInTheDocument();
    for (let count = 0; count < 5; count += 1) {
      fireEvent.click(screen.getByRole("button", { name: "记录当前接触" }));
    }
    expect(screen.getByText(/画面重合但不要接触/)).toBeInTheDocument();

    rerender(
      <PinchCalibrationWizard currentSample={falseOverlap} onComplete={onComplete} onCancel={vi.fn()} />,
    );
    for (let count = 0; count < 3; count += 1) {
      fireEvent.click(screen.getByRole("button", { name: "记录当前未接触样本" }));
    }

    expect(onComplete).toHaveBeenCalledOnce();
    expect(onComplete.mock.calls[0]![0].boundaries.worldSeparate).toBeGreaterThan(0.5);
    expect(screen.getByRole("status")).toHaveTextContent("校准完成");
  });

  it("disables sample recording when no valid hand features are available", () => {
    vi.useFakeTimers();
    render(<PinchCalibrationWizard currentSample={null} onComplete={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "开始三秒基线采集" }));
    act(() => vi.advanceTimersByTime(3_000));

    expect(screen.getByRole("button", { name: "记录当前接触" })).toBeDisabled();
    expect(screen.getByText("请先把手完整放入画面")).toBeInTheDocument();
  });

  it("cancels without creating a profile", () => {
    const onCancel = vi.fn();
    const onComplete = vi.fn();
    render(<PinchCalibrationWizard currentSample={contact} onComplete={onComplete} onCancel={onCancel} />);

    fireEvent.click(screen.getByRole("button", { name: "取消校准" }));

    expect(onCancel).toHaveBeenCalledOnce();
    expect(onComplete).not.toHaveBeenCalled();
  });
});
