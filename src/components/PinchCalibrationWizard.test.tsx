import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi, type Mock } from "vitest";

import type {
  PinchCalibrationProfile,
  PinchCalibrationSample,
} from "../gesture/pinchCalibration";
import { calibrationFailureGuidance } from "../gesture/pinchCalibrationGuidance";
import { PinchCalibrationWizard } from "./PinchCalibrationWizard";

const contact: PinchCalibrationSample = { imageRatio: 0.24, worldRatio: 0.23, depthGap: 0.08 };
const falseOverlap: PinchCalibrationSample = { imageRatio: 0.25, worldRatio: 0.62, depthGap: 0.4 };

type WizardCallbacks = {
  onComplete: Mock<(profile: PinchCalibrationProfile) => void>;
  onCancel: Mock<() => void>;
};

afterEach(() => vi.useRealTimers());

describe("PinchCalibrationWizard", () => {
  it("turns failed calibration channels into specific Chinese corrections", () => {
    expect(calibrationFailureGuidance(["world", "depth"])).toEqual([
      "三维距离不足：假重合时增加两指的实际空间距离。",
      "前后深度不足：让两指沿摄像头前后方向分开更多。",
    ]);
  });

  it("shows the correct realistic hand guide for each calibration stage", () => {
    vi.useFakeTimers();
    const callbacks = createCallbacks();
    const view = renderWizard(null, callbacks);

    enterFrontStage();
    expect(screen.getByRole("img", { name: "正面使用拇指和食指真实接触" })).toBeInTheDocument();
    expect(screen.getByText("只使用拇指和食指；其余三指不要弯曲参与。"))
      .toBeInTheDocument();

    recordStableSamples(view.rerender, callbacks, contact, 5, "记录当前接触");
    expect(screen.getByRole("img", { name: "侧面使用拇指和食指真实接触" }))
      .toBeInTheDocument();

    recordStableSamples(view.rerender, callbacks, contact, 5, "记录当前接触");
    expect(screen.getByRole("img", { name: "拇指和食指画面重合但实际前后分开" }))
      .toBeInTheDocument();
    expect(screen.getByText("让两指在画面中重合，但实际前后分开 2–3 厘米，不要接触。"))
      .toBeInTheDocument();
    expect(screen.getByText("保持前后分开")).toBeInTheDocument();
  });

  it("enables recording only after four stable frames and resets after capture", () => {
    vi.useFakeTimers();
    const callbacks = createCallbacks();
    const view = renderWizard(null, callbacks);
    enterFrontStage();

    const recordButton = () => screen.getByRole("button", { name: "记录当前接触" });
    expect(recordButton()).toBeDisabled();
    expect(screen.getByText("未检测到完整手部")).toBeInTheDocument();

    feedFrames(view.rerender, callbacks, contact, 3);
    expect(recordButton()).toBeDisabled();
    expect(screen.getByText("保持姿势稳定 3/4")).toBeInTheDocument();

    feedFrames(view.rerender, callbacks, contact, 1);
    expect(recordButton()).toBeEnabled();
    expect(screen.getByText("可以记录")).toBeInTheDocument();
    expect(screen.getByText("画面距离")).toBeInTheDocument();
    expect(screen.getByText("三维距离")).toBeInTheDocument();
    expect(screen.getByText("前后深度")).toBeInTheDocument();

    fireEvent.click(recordButton());
    expect(screen.getByText("已记录 1/5")).toBeInTheDocument();
    expect(recordButton()).toBeDisabled();
  });

  it("collects baseline, five front, five side, and three false-overlap samples", () => {
    vi.useFakeTimers();
    const callbacks = createCallbacks();
    const view = renderWizard(null, callbacks);

    enterFrontStage();
    recordStableSamples(view.rerender, callbacks, contact, 5, "记录当前接触");
    recordStableSamples(view.rerender, callbacks, contact, 5, "记录当前接触");
    recordStableSamples(
      view.rerender,
      callbacks,
      falseOverlap,
      3,
      "记录当前未接触样本",
    );

    expect(callbacks.onComplete).toHaveBeenCalledOnce();
    expect(callbacks.onComplete.mock.calls[0]![0].boundaries.worldSeparate).toBeGreaterThan(0.5);
    expect(screen.getByRole("status")).toHaveTextContent("校准完成");
  });

  it("shows a specific correction when the current action is not recordable", () => {
    vi.useFakeTimers();
    const callbacks = createCallbacks();
    const view = renderWizard(null, callbacks);
    enterFrontStage();

    feedFrames(
      view.rerender,
      callbacks,
      { imageRatio: 0.42, worldRatio: 0.23, depthGap: 0.08 },
      1,
    );

    expect(screen.getByText("让拇指和食指真正接触")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "记录当前接触" })).toBeDisabled();
    expect(screen.getAllByText("未通过").length).toBeGreaterThan(0);
    expect(screen.getByText("0.42 ≤ 0.39")).toBeInTheDocument();
  });

  it("cancels without creating a profile", () => {
    const callbacks = createCallbacks();
    renderWizard(contact, callbacks);

    fireEvent.click(screen.getByRole("button", { name: "取消校准" }));

    expect(callbacks.onCancel).toHaveBeenCalledOnce();
    expect(callbacks.onComplete).not.toHaveBeenCalled();
  });
});

function createCallbacks(): WizardCallbacks {
  return {
    onComplete: vi.fn<(profile: PinchCalibrationProfile) => void>(),
    onCancel: vi.fn<() => void>(),
  };
}

function renderWizard(currentSample: PinchCalibrationSample | null, callbacks: WizardCallbacks) {
  return render(
    <PinchCalibrationWizard
      currentSample={currentSample}
      onComplete={callbacks.onComplete}
      onCancel={callbacks.onCancel}
    />,
  );
}

function enterFrontStage(): void {
  fireEvent.click(screen.getByRole("button", { name: "开始三秒基线采集" }));
  expect(screen.getByRole("img", { name: "张开手掌并缓慢左右移动" })).toBeInTheDocument();
  act(() => vi.advanceTimersByTime(3_000));
}

function feedFrames(
  rerender: ReturnType<typeof render>["rerender"],
  callbacks: WizardCallbacks,
  frame: PinchCalibrationSample,
  count: number,
): void {
  for (let index = 0; index < count; index += 1) {
    rerender(
      <PinchCalibrationWizard
        currentSample={{ ...frame }}
        onComplete={callbacks.onComplete}
        onCancel={callbacks.onCancel}
      />,
    );
  }
}

function recordStableSamples(
  rerender: ReturnType<typeof render>["rerender"],
  callbacks: WizardCallbacks,
  frame: PinchCalibrationSample,
  count: number,
  buttonName: string,
): void {
  for (let sampleIndex = 0; sampleIndex < count; sampleIndex += 1) {
    feedFrames(rerender, callbacks, frame, 4);
    const button = screen.getByRole("button", { name: buttonName });
    expect(button).toBeEnabled();
    fireEvent.click(button);
  }
}
