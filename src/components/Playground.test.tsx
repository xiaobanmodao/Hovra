import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GestureOutput } from "../gesture/types";
import { Playground } from "./Playground";

const idle: GestureOutput = {
  state: "tracking",
  cursor: null,
  click: false,
  dragStart: false,
  dragEnd: false,
};

const rect = (left: number, top: number, width: number, height: number): DOMRect => ({
  bottom: top + height,
  height,
  left,
  right: left + width,
  top,
  width,
  x: left,
  y: top,
  toJSON: () => ({}),
});

beforeEach(() => {
  vi.stubGlobal("innerWidth", 1024);
  vi.stubGlobal("innerHeight", 768);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Playground", () => {
  it("counts clicks at the target's fixed viewport position only", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      return this.classList.contains("click-target")
        ? rect(848, 32, 144, 144)
        : rect(0, 0, 0, 0);
    });

    const { container, rerender } = render(
      <Playground cursor={{ x: 900, y: 100 }} output={{ ...idle, click: true }} />,
    );

    expect(container.querySelector(".interaction-layer")).toBeInTheDocument();
    expect(screen.getByText(/pinch here/i).parentElement).toHaveStyle({
      left: "848px",
      top: "32px",
    });
    expect(screen.getByText(/clicks: 1/i)).toBeInTheDocument();

    rerender(<Playground cursor={{ x: 20, y: 20 }} output={{ ...idle, click: false }} />);
    rerender(<Playground cursor={{ x: 20, y: 20 }} output={{ ...idle, click: true }} />);

    expect(screen.getByText(/clicks: 1/i)).toBeInTheDocument();
  });

  it("clamps a grabbed card to the viewport margin and retains its released position", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      return this.classList.contains("draggable-card")
        ? rect(136, 205, 224, 104)
        : rect(0, 0, 0, 0);
    });

    const { rerender } = render(
      <Playground
        cursor={{ x: 180, y: 240 }}
        output={{ ...idle, state: "pinching", dragStart: true }}
      />,
    );

    rerender(
      <Playground
        cursor={{ x: 980, y: 760 }}
        output={{ ...idle, state: "dragging" }}
      />,
    );

    const card = screen.getByTestId("draggable-card");
    expect(card).toHaveStyle({ left: "784px", top: "648px" });

    rerender(
      <Playground
        cursor={{ x: 980, y: 760 }}
        output={{ ...idle, state: "tracking", dragEnd: true }}
      />,
    );

    expect(card).toHaveStyle({ left: "784px", top: "648px" });
  });
});
