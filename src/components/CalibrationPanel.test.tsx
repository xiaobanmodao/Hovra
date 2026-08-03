import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_GESTURE_SETTINGS } from "../gesture/config";
import type { GestureSettings, GestureState } from "../gesture/types";
import type { Point } from "../cursor/cursorController";
import { CalibrationPanel } from "./CalibrationPanel";

type HarnessProps = {
  initialSettings?: GestureSettings;
  onSettingsChange?: (next: GestureSettings) => void;
  pinchDistance?: number | null;
  gestureState?: GestureState;
  cursor?: Point | null;
};

function CalibrationPanelHarness({
  initialSettings = { ...DEFAULT_GESTURE_SETTINGS },
  onSettingsChange = () => undefined,
  pinchDistance = 0.041,
  gestureState = "tracking",
  cursor = { x: 320, y: 240 },
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
      pinchDistance={pinchDistance}
      gestureState={gestureState}
      cursor={cursor}
    />
  );
}

describe("CalibrationPanel", () => {
  it("displays live diagnostics and the default calibration values", () => {
    render(<CalibrationPanelHarness />);

    expect(screen.getByText("Pinch distance")).toBeInTheDocument();
    expect(screen.getByText("0.041")).toBeInTheDocument();
    expect(screen.getByText("tracking")).toBeInTheDocument();
    expect(screen.getByText("320, 240")).toBeInTheDocument();
    expect(screen.getByText("0.055")).toBeInTheDocument();
    expect(screen.getByText("0.20")).toBeInTheDocument();
    expect(screen.getByText("350 ms")).toBeInTheDocument();
  });

  it("shows an em dash when pinch distance and cursor diagnostics are unavailable", () => {
    render(<CalibrationPanelHarness pinchDistance={null} cursor={null} />);

    expect(screen.getByText("Pinch distance").nextElementSibling).toHaveTextContent("—");
    expect(screen.getByText("Cursor").nextElementSibling).toHaveTextContent("—");
  });

  it("steps the pinch threshold and never reports a value above 0.100", () => {
    const onSettingsChange = vi.fn();
    render(<CalibrationPanelHarness onSettingsChange={onSettingsChange} />);

    const increment = screen.getByRole("button", { name: "Increase pinch threshold" });
    for (let click = 0; click < 20; click += 1) {
      fireEvent.click(increment);
    }

    const reportedValues = onSettingsChange.mock.calls.map(([settings]) => settings.pinchDistance);
    expect(reportedValues[0]).toBe(0.06);
    expect(reportedValues[reportedValues.length - 1]).toBe(0.1);
    expect(reportedValues.every((value) => value <= 0.1)).toBe(true);
    expect(increment).toBeDisabled();
  });

  it.each([
    {
      label: "pinch threshold",
      key: "pinchDistance" as const,
      min: 0.025,
      max: 0.1,
      step: 0.005,
    },
    {
      label: "cursor smoothing",
      key: "cursorSmoothingFactor" as const,
      min: 0.05,
      max: 1,
      step: 0.05,
    },
    {
      label: "drag hold",
      key: "dragHoldMs" as const,
      min: 150,
      max: 1000,
      step: 50,
    },
  ])("applies the exact $label step and disables controls at both bounds", ({
    label,
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

    const decrement = screen.getByRole("button", { name: `Decrease ${label}` });
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

    const increment = screen.getByRole("button", { name: `Increase ${label}` });
    fireEvent.click(increment);
    expect(onSettingsChange).toHaveBeenLastCalledWith(expect.objectContaining({ [key]: max }));
    expect(increment).toBeDisabled();
  });

  it("resets changed settings with a fresh copy of the defaults", () => {
    const onSettingsChange = vi.fn();
    render(<CalibrationPanelHarness onSettingsChange={onSettingsChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Increase drag hold" }));
    expect(onSettingsChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ dragHoldMs: 400 }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Reset calibration" }));
    const lastCall = onSettingsChange.mock.calls[onSettingsChange.mock.calls.length - 1];
    const resetSettings = lastCall?.[0];
    expect(resetSettings).toEqual(DEFAULT_GESTURE_SETTINGS);
    expect(resetSettings).not.toBe(DEFAULT_GESTURE_SETTINGS);
  });

  it("hides panel content when collapsed while leaving the toggle available", () => {
    render(<CalibrationPanelHarness />);

    const toggle = screen.getByRole("button", { name: "Collapse calibration panel" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const contentId = toggle.getAttribute("aria-controls");
    expect(contentId).not.toBeNull();

    fireEvent.click(toggle);

    const collapsedToggle = screen.getByRole("button", { name: "Expand calibration panel" });
    expect(collapsedToggle).toHaveAttribute("aria-expanded", "false");
    const collapsedContent = document.getElementById(contentId as string);
    expect(collapsedContent).toBeInTheDocument();
    expect(collapsedContent).not.toBeVisible();
    expect(screen.getByText("Pinch distance")).not.toBeVisible();
  });
});
