import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  CALIBRATION_CONTROL_METADATA,
  DEFAULT_GESTURE_SETTINGS,
} from "../gesture/config";
import type { GestureSettings, GestureState } from "../gesture/types";
import type { Point } from "../cursor/cursorController";
import { CalibrationPanel } from "./CalibrationPanel";

type HarnessProps = {
  initialSettings?: GestureSettings;
  onSettingsChange?: (next: GestureSettings) => void;
  pinchRatio?: number | null;
  gestureState?: GestureState;
  cursor?: Point | null;
  disabled?: boolean;
};

function CalibrationPanelHarness({
  initialSettings = { ...DEFAULT_GESTURE_SETTINGS },
  onSettingsChange = () => undefined,
  pinchRatio = 0.041,
  gestureState = "tracking",
  cursor = { x: 320, y: 240 },
  disabled = false,
}: HarnessProps) {
  const [settings, setSettings] = useState(initialSettings);

  const handleSettingsChange = (next: GestureSettings) => {
    onSettingsChange(next);
    setSettings(next);
  };

  return (
    <CalibrationPanel
      settings={settings}
      onSettingsChange={handleSettingsChange}
      pinchRatio={pinchRatio}
      gestureState={gestureState}
      cursor={cursor}
      disabled={disabled}
    />
  );
}

describe("CalibrationPanel", () => {
  it("displays live diagnostics and the default calibration values", () => {
    render(<CalibrationPanelHarness />);

    expect(screen.getByText("空间捏合比例")).toBeInTheDocument();
    expect(screen.getByText("0.041")).toBeInTheDocument();
    expect(screen.getByText("跟踪中")).toBeInTheDocument();
    expect(screen.getByText("320, 240")).toBeInTheDocument();
    expect(screen.getByText("0.50")).toBeInTheDocument();
    expect(screen.getByText("0.40")).toBeInTheDocument();
    expect(screen.queryByText("350 毫秒")).not.toBeInTheDocument();
  });

  it("shows an em dash when pinch distance and cursor diagnostics are unavailable", () => {
    render(<CalibrationPanelHarness pinchRatio={null} cursor={null} />);

    expect(screen.getByText("空间捏合比例").nextElementSibling).toHaveTextContent("—");
    expect(screen.getByText("光标").nextElementSibling).toHaveTextContent("—");
  });

  it("steps gesture sensitivity and never reports a value above 1", () => {
    const onSettingsChange = vi.fn();
    render(<CalibrationPanelHarness onSettingsChange={onSettingsChange} />);

    const increment = screen.getByRole("button", { name: "调高点击灵敏度" });
    for (let click = 0; click < 20; click += 1) {
      fireEvent.click(increment);
    }

    const reportedValues = onSettingsChange.mock.calls.map(([settings]) => settings.gestureSensitivity);
    expect(reportedValues[0]).toBe(0.55);
    expect(reportedValues[reportedValues.length - 1]).toBe(1);
    expect(reportedValues.every((value) => value <= 1)).toBe(true);
    expect(increment).toBeDisabled();
  });

  it("adjusts the normalized horizontal cursor offset in one-percent steps", () => {
    const onSettingsChange = vi.fn();
    render(<CalibrationPanelHarness onSettingsChange={onSettingsChange} />);

    fireEvent.click(screen.getByRole("button", { name: "调高水平光标偏移" }));

    expect(onSettingsChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ cursorOffsetX: 0.01 }),
    );
  });

  it.each(Object.values(CALIBRATION_CONTROL_METADATA))(
    "applies the exact $label step and disables controls at both bounds",
    ({
    label,
    accessibleLabel,
    key,
    min,
    max,
    step,
    }) => {
    const onSettingsChange = vi.fn();
    const initialSettings = { ...DEFAULT_GESTURE_SETTINGS, [key]: min + step };
    const { rerender } = render(
      <CalibrationPanelHarness
        key={`minimum-${label}`}
        initialSettings={initialSettings}
        onSettingsChange={onSettingsChange}
      />,
    );

    const decrement = screen.getByRole("button", { name: `调低${accessibleLabel}` });
    fireEvent.click(decrement);
    expect(onSettingsChange).toHaveBeenLastCalledWith(expect.objectContaining({ [key]: min }));
    expect(decrement).toBeDisabled();

    onSettingsChange.mockClear();
    rerender(
      <CalibrationPanelHarness
        key={`maximum-${label}`}
        initialSettings={{ ...DEFAULT_GESTURE_SETTINGS, [key]: max - step }}
        onSettingsChange={onSettingsChange}
      />,
    );

    const increment = screen.getByRole("button", { name: `调高${accessibleLabel}` });
    fireEvent.click(increment);
    expect(onSettingsChange).toHaveBeenLastCalledWith(expect.objectContaining({ [key]: max }));
    expect(increment).toBeDisabled();
    },
  );

  it("resets changed settings with a fresh copy of the defaults", () => {
    const onSettingsChange = vi.fn();
    render(<CalibrationPanelHarness onSettingsChange={onSettingsChange} />);

    fireEvent.click(screen.getByRole("button", { name: "调高点击灵敏度" }));
    expect(onSettingsChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ gestureSensitivity: 0.55 }),
    );

    fireEvent.click(screen.getByRole("button", { name: "恢复默认设置" }));
    const lastCall = onSettingsChange.mock.calls[onSettingsChange.mock.calls.length - 1];
    const resetSettings = lastCall?.[0];
    expect(resetSettings).toEqual(DEFAULT_GESTURE_SETTINGS);
    expect(resetSettings).not.toBe(DEFAULT_GESTURE_SETTINGS);
  });

  it("hides panel content when collapsed while leaving the toggle available", () => {
    render(<CalibrationPanelHarness />);

    const toggle = screen.getByRole("button", { name: "收起控制参数面板" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const contentId = toggle.getAttribute("aria-controls");
    expect(contentId).not.toBeNull();

    fireEvent.click(toggle);

    const collapsedToggle = screen.getByRole("button", { name: "展开控制参数面板" });
    expect(collapsedToggle).toHaveAttribute("aria-expanded", "false");
    const collapsedContent = document.getElementById(contentId as string);
    expect(collapsedContent).toBeInTheDocument();
    expect(collapsedContent).not.toBeVisible();
    expect(screen.getByText("空间捏合比例")).not.toBeVisible();
  });

  it("does not expose the removed personal calibration workflow", () => {
    render(<CalibrationPanelHarness />);

    expect(screen.queryByRole("button", { name: "开始个人点击校准" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "个人点击校准" })).not.toBeInTheDocument();
  });

  it("稳定性测试期间禁用全部参数按钮", () => {
    render(<CalibrationPanelHarness disabled />);
    expect(screen.getByRole("button", { name: "调高点击灵敏度" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "恢复默认设置" })).toBeDisabled();
  });
});
