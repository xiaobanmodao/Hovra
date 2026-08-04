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
    rightPinchRatio: 0.61,
    doublePinchRatio: 0.72,
    openPalmScore: 0.18,
    scrollPoseScore: 0.43,
  },
};

describe("GestureDiagnostics", () => {
  it("renders candidate, lock, progress, normalized ratios, scale, score, and quality", () => {
    render(<GestureDiagnostics output={output} />);

    expect(screen.getByText("candidate")).toBeInTheDocument();
    expect(screen.getByText("left")).toBeInTheDocument();
    expect(screen.getByText("3/4")).toBeInTheDocument();
    expect(screen.getByText("0.234")).toBeInTheDocument();
    expect(screen.getByText("0.210 / 0.610 / 0.720")).toBeInTheDocument();
    expect(screen.getByText("0.430")).toBeInTheDocument();
    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("offers explicit local export only when a desktop callback is provided", async () => {
    const onSaveTrace = vi.fn().mockResolvedValue("saved");
    const { rerender } = render(<GestureDiagnostics output={output} />);
    expect(screen.queryByRole("button", { name: /save diagnostic trace/i })).not.toBeInTheDocument();

    rerender(<GestureDiagnostics output={output} onSaveTrace={onSaveTrace} />);
    fireEvent.click(screen.getByRole("button", { name: /save diagnostic trace/i }));

    expect(onSaveTrace).toHaveBeenCalledOnce();
    expect(await screen.findByText("Trace saved locally")).toBeInTheDocument();
  });
});
