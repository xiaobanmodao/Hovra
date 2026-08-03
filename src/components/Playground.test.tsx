import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
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

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Playground", () => {
  it("counts a virtual click only when the cursor is inside the click target", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      return this.classList.contains("click-target")
        ? rect(20, 20, 80, 80)
        : rect(0, 0, 0, 0);
    });

    const { rerender } = render(
      <Playground cursor={{ x: 50, y: 50 }} output={{ ...idle, click: true }} />,
    );

    expect(screen.getByText(/clicks: 1/i)).toBeInTheDocument();

    rerender(<Playground cursor={{ x: 150, y: 150 }} output={{ ...idle, click: false }} />);
    rerender(<Playground cursor={{ x: 150, y: 150 }} output={{ ...idle, click: true }} />);

    expect(screen.getByText(/clicks: 1/i)).toBeInTheDocument();
  });

  it("moves a grabbed card with the cursor and retains its released position", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this.classList.contains("draggable-card")) {
        return rect(20, 30, 120, 90);
      }
      if (this.classList.contains("playground-surface")) {
        return rect(10, 20, 320, 240);
      }
      return rect(0, 0, 0, 0);
    });

    const { rerender } = render(
      <Playground
        cursor={{ x: 50, y: 50 }}
        output={{ ...idle, state: "pinching", dragStart: true }}
      />,
    );

    rerender(
      <Playground
        cursor={{ x: 200, y: 120 }}
        output={{ ...idle, state: "dragging" }}
      />,
    );

    const card = screen.getByTestId("draggable-card");
    expect(card).toHaveStyle({ left: "160px", top: "80px" });

    rerender(
      <Playground
        cursor={{ x: 200, y: 120 }}
        output={{ ...idle, state: "tracking", dragEnd: true }}
      />,
    );

    expect(card).toHaveStyle({ left: "160px", top: "80px" });
  });

  it("keeps the whole dragged card inside the playground surface", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this.classList.contains("draggable-card")) {
        return rect(20, 30, 120, 90);
      }
      if (this.classList.contains("playground-surface")) {
        return rect(10, 20, 320, 240);
      }
      return rect(0, 0, 0, 0);
    });

    const { rerender } = render(
      <Playground
        cursor={{ x: 50, y: 50 }}
        output={{ ...idle, state: "pinching", dragStart: true }}
      />,
    );

    rerender(
      <Playground
        cursor={{ x: 500, y: 500 }}
        output={{ ...idle, state: "dragging" }}
      />,
    );

    const card = screen.getByTestId("draggable-card");
    expect(card).toHaveStyle({ left: "200px", top: "150px" });

    rerender(
      <Playground
        cursor={{ x: -100, y: -100 }}
        output={{ ...idle, state: "dragging" }}
      />,
    );

    expect(card).toHaveStyle({ left: "0px", top: "0px" });
  });
});
