import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";
import type { Landmark } from "./gesture/types";

const vision = vi.hoisted(() => ({
  close: vi.fn(),
  createHandLandmarker: vi.fn(),
  detectFirstHand: vi.fn(),
}));

vi.mock("./vision/handLandmarker", () => ({
  createHandLandmarker: vision.createHandLandmarker,
  detectFirstHand: vision.detectFirstHand,
}));

import App from "./App";

const pinchedHandAt = (x: number, y: number): Landmark[] => {
  const hand = Array.from({ length: 21 }, () => ({ x: 0, y: 0 }));
  hand[4] = { x: x - 0.03, y };
  hand[8] = { x, y };
  return hand;
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
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    arc: vi.fn(),
    beginPath: vi.fn(),
    clearRect: vi.fn(),
    fill: vi.fn(),
    lineTo: vi.fn(),
    moveTo: vi.fn(),
    stroke: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vision.close.mockReset();
  vision.createHandLandmarker.mockReset();
  vision.detectFirstHand.mockReset();
});

it("renders the hand gesture demo heading", () => {
  render(<App />);
  expect(screen.getByRole("heading", { name: /hand gesture/i })).toBeInTheDocument();
});

it("marks a stalled frame lost when video readiness drops during a drag", async () => {
  const stream = Object.assign(new EventTarget(), {
    getTracks: () => [],
  }) as unknown as MediaStream;
  vi.stubGlobal("navigator", {
    ...navigator,
    mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(stream) },
  });

  let nextFrame: FrameRequestCallback | null = null;
  vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => {
    nextFrame = callback;
    return 1;
  }));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  vision.createHandLandmarker.mockResolvedValue({ close: vision.close });
  const cursorX = 1 - 50 / window.innerWidth;
  const cursorY = 50 / window.innerHeight;
  vision.detectFirstHand.mockReturnValue(pinchedHandAt(cursorX, cursorY));
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    if (this.classList.contains("draggable-card")) {
      return rect(20, 30, 120, 90);
    }
    return rect(0, 0, 0, 0);
  });

  render(<App />);
  const video = screen.getByLabelText(/mirrored camera preview/i) as HTMLVideoElement;
  Object.defineProperty(video, "readyState", {
    configurable: true,
    value: HTMLMediaElement.HAVE_CURRENT_DATA,
  });
  Object.defineProperty(video, "currentTime", {
    configurable: true,
    value: 1,
    writable: true,
  });
  fireEvent.loadedData(video);

  await waitFor(() => expect(vision.createHandLandmarker).toHaveBeenCalledOnce());
  await waitFor(() => expect(nextFrame).not.toBeNull());

  act(() => nextFrame?.(16));
  expect(vision.detectFirstHand).toHaveBeenCalledOnce();

  video.currentTime = 2;
  act(() => nextFrame?.(400));
  expect(vision.detectFirstHand).toHaveBeenCalledTimes(2);
  expect(screen.getByRole("status")).toHaveTextContent(/gesturedragging/i);
  const card = screen.getByTestId("draggable-card");
  expect(card).toHaveStyle({ left: "20px", top: "30px" });

  Object.defineProperty(video, "readyState", {
    configurable: true,
    value: HTMLMediaElement.HAVE_METADATA,
  });
  act(() => nextFrame?.(950));
  expect(vision.detectFirstHand).toHaveBeenCalledTimes(2);
  expect(screen.getByRole("status")).toHaveTextContent(/camera frame stalled/i);
  expect(screen.getByRole("status")).toHaveTextContent(/gesturelost/i);
  expect(card).toHaveStyle({ left: "20px", top: "30px" });
});

it("ends an active drag and cleans up recognition when the camera stream becomes inactive", async () => {
  const track = Object.assign(new EventTarget(), { stop: vi.fn() });
  const stream = Object.assign(new EventTarget(), {
    getTracks: () => [track],
  }) as unknown as MediaStream;
  vi.stubGlobal("navigator", {
    ...navigator,
    mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(stream) },
  });

  let nextFrame: FrameRequestCallback | null = null;
  const cancelAnimationFrame = vi.fn();
  vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => {
    nextFrame = callback;
    return 7;
  }));
  vi.stubGlobal("cancelAnimationFrame", cancelAnimationFrame);
  vision.createHandLandmarker.mockResolvedValue({ close: vision.close });
  const cursorX = 1 - 50 / window.innerWidth;
  const cursorY = 50 / window.innerHeight;
  vision.detectFirstHand.mockReturnValue(pinchedHandAt(cursorX, cursorY));
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    if (this.classList.contains("draggable-card")) {
      return rect(20, 30, 120, 90);
    }
    return rect(0, 0, 0, 0);
  });

  render(<App />);
  const video = screen.getByLabelText(/mirrored camera preview/i) as HTMLVideoElement;
  Object.defineProperty(video, "readyState", {
    configurable: true,
    value: HTMLMediaElement.HAVE_CURRENT_DATA,
  });
  Object.defineProperty(video, "currentTime", {
    configurable: true,
    value: 1,
    writable: true,
  });
  fireEvent.loadedData(video);
  await waitFor(() => expect(nextFrame).not.toBeNull());

  act(() => nextFrame?.(16));
  video.currentTime = 2;
  act(() => nextFrame?.(400));
  expect(screen.getByRole("status")).toHaveTextContent(/gesturedragging/i);
  const card = screen.getByTestId("draggable-card");
  expect(card).toHaveStyle({ left: "20px", top: "30px" });

  act(() => stream.dispatchEvent(new Event("inactive")));

  expect(screen.getByRole("status")).toHaveTextContent(/gesturelost/i);
  expect(card).toHaveStyle({ left: "20px", top: "30px" });
  expect(track.stop).toHaveBeenCalledOnce();
  expect(vision.close).toHaveBeenCalledOnce();
  expect(cancelAnimationFrame).toHaveBeenCalledWith(7);
});
