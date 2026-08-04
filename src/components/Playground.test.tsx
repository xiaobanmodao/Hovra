import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GestureOutput } from "../gesture/types";
import { Playground } from "./Playground";

const idle: GestureOutput = {
  state: "tracking",
  cursor: null,
  click: false,
  rightClick: false,
  doubleClick: false,
  scrollY: 0,
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
  it("clamps the card to the origin when it mounts in an undersized viewport", () => {
    vi.stubGlobal("innerWidth", 180);
    vi.stubGlobal("innerHeight", 100);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      return this.classList.contains("draggable-card")
        ? rect(136, 205, 224, 104)
        : rect(0, 0, 0, 0);
    });

    render(<Playground cursor={null} output={idle} />);

    expect(screen.getByTestId("draggable-card")).toHaveStyle({ left: "0px", top: "0px" });
  });

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
        output={{ ...idle, state: "left-pinching", dragStart: true }}
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

  it("keeps both fixed interaction objects visible when the viewport shrinks", () => {
    const addEventListener = vi.spyOn(window, "addEventListener");
    const removeEventListener = vi.spyOn(window, "removeEventListener");
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      return this.classList.contains("draggable-card")
        ? rect(136, 205, 224, 104)
        : this.classList.contains("click-target")
          ? rect(848, 32, 144, 144)
          : rect(0, 0, 0, 0);
    });

    const { rerender, unmount } = render(
      <Playground
        cursor={{ x: 180, y: 240 }}
        output={{ ...idle, state: "left-pinching", dragStart: true }}
      />,
    );

    rerender(
      <Playground
        cursor={{ x: 980, y: 760 }}
        output={{ ...idle, state: "dragging" }}
      />,
    );

    vi.stubGlobal("innerWidth", 600);
    vi.stubGlobal("innerHeight", 180);
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });

    expect(screen.getByText(/pinch here/i).parentElement).toHaveStyle({
      left: "440px",
      top: "20px",
    });
    expect(screen.getByTestId("draggable-card")).toHaveStyle({
      left: "360px",
      top: "60px",
    });

    const resizeListener = addEventListener.mock.calls.find(([eventName]) => eventName === "resize")?.[1];
    expect(resizeListener).toEqual(expect.any(Function));

    unmount();
    expect(removeEventListener).toHaveBeenCalledWith("resize", resizeListener);
  });

  it("reports right-click, double-click, and accumulated scroll diagnostics", () => {
    const { rerender } = render(<Playground cursor={null} output={idle} />);

    rerender(<Playground cursor={null} output={{ ...idle, rightClick: true }} />);
    rerender(<Playground cursor={null} output={{ ...idle, rightClick: false }} />);
    rerender(<Playground cursor={null} output={{ ...idle, doubleClick: true }} />);
    rerender(<Playground cursor={null} output={{ ...idle, doubleClick: false, scrollY: 4 }} />);

    expect(screen.getByText("Right clicks: 1")).toBeInTheDocument();
    expect(screen.getByText("Double clicks: 1")).toBeInTheDocument();
    expect(screen.getByText("Scroll: 4")).toBeInTheDocument();
    expect(screen.getByText(/thumb \+ middle/i)).toBeInTheDocument();
  });
});
