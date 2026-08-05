import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import type { GestureDesktopApi } from "./electron.d";
import { makeGestureHand } from "./gesture/fixtures/stable-gesture-sequences";
import type { Landmark } from "./gesture/types";
import type { DetectedHand } from "./vision/handLandmarker";
import { PINCH_CALIBRATION_STORAGE_KEY } from "./gesture/pinchCalibration";

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

const handAt = (gesture: "tracking" | "left" | "right" | "double" | "scroll" | "open-palm", x = 0.45, y = 0.45): Landmark[] => (
  makeGestureHand(gesture, { cursor: { x, y } })
);

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    arc: vi.fn(), beginPath: vi.fn(), clearRect: vi.fn(), fill: vi.fn(),
    lineTo: vi.fn(), moveTo: vi.fn(), stroke: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
});

it("loads and clears a valid local pinch calibration profile", () => {
  localStorage.setItem(PINCH_CALIBRATION_STORAGE_KEY, JSON.stringify({
    version: 2,
    createdAt: "2026-08-04T12:00:00.000Z",
    boundaries: {
      imageContact: 0.3,
      imageSeparate: 0.5,
      worldContact: 0.3,
      worldSeparate: 0.55,
      depthContact: 0.15,
      depthSeparate: 0.35,
    },
    baselineNoise: 0.02,
  }));

  render(<App />);

  expect(screen.getByText("个人点击参数已启用")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "清除个人点击参数" }));
  expect(localStorage.getItem(PINCH_CALIBRATION_STORAGE_KEY)).toBeNull();
});

afterEach(() => {
  cleanup();
  delete window.gestureDesktop;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vision.close.mockReset();
  vision.createHandLandmarker.mockReset();
  vision.detectFirstHand.mockReset();
});

const desktopApi = (): GestureDesktopApi => ({
  getPermissionStatus: vi.fn().mockResolvedValue("granted"),
  activate: vi.fn().mockResolvedValue(true),
  move: vi.fn().mockResolvedValue(undefined),
  drag: vi.fn().mockResolvedValue(undefined),
  click: vi.fn().mockResolvedValue(undefined),
  rightClick: vi.fn().mockResolvedValue(undefined),
  doubleClick: vi.fn().mockResolvedValue(undefined),
  scroll: vi.fn().mockResolvedValue(undefined),
  mouseDown: vi.fn().mockResolvedValue(undefined),
  mouseUp: vi.fn().mockResolvedValue(undefined),
  releaseAndPause: vi.fn().mockResolvedValue(undefined),
  detectAppleHand: vi.fn().mockResolvedValue(null),
  saveGestureTrace: vi.fn().mockResolvedValue("saved"),
  saveHandSample: vi.fn().mockResolvedValue("saved"),
  openAccessibilitySettings: vi.fn().mockResolvedValue(undefined),
  onSafetyPause: vi.fn(() => vi.fn()),
});

const renderDesktopApp = async (bridge = desktopApi()) => {
  const stream = Object.assign(new EventTarget(), { getTracks: () => [] }) as unknown as MediaStream;
  vi.stubGlobal("navigator", { ...navigator, mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(stream) } });
  let nextFrame: FrameRequestCallback | null = null;
  vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => {
    nextFrame = callback;
    return 1;
  }));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  vision.createHandLandmarker.mockResolvedValue({ close: vision.close });
  let detectedHand: DetectedHand | null = {
    landmarks: handAt("tracking"),
    worldLandmarks: handAt("tracking"),
  };
  vision.detectFirstHand.mockImplementation(() => detectedHand);
  window.gestureDesktop = bridge;

  const rendered = render(<App />);
  const video = screen.getByLabelText("镜像摄像头预览") as HTMLVideoElement;
  Object.defineProperty(video, "readyState", { configurable: true, value: HTMLMediaElement.HAVE_CURRENT_DATA });
  Object.defineProperty(video, "currentTime", { configurable: true, value: 0, writable: true });
  fireEvent.loadedData(video);
  await waitFor(() => expect(nextFrame).not.toBeNull());

  let videoTime = 0;
  const runFrame = (
    nowMs: number,
    hand: Landmark[] | null = detectedHand?.landmarks ?? null,
    worldHand: Landmark[] | null = hand,
  ) => {
    detectedHand = hand ? { landmarks: hand, worldLandmarks: worldHand } : null;
    videoTime += 1;
    video.currentTime = videoTime;
    act(() => nextFrame?.(nowMs));
  };
  const runAnimationFrame = (nowMs: number) => act(() => nextFrame?.(nowMs));
  runFrame(0);
  const enable = await screen.findByRole("button", { name: "启用系统控制" });
  fireEvent.click(enable);
  await screen.findByText("已启用");

  return { ...rendered, bridge, runFrame, runAnimationFrame, video };
};

it("renders the simplified interaction description", () => {
  render(<App />);
  expect(screen.getByRole("heading", { name: "手势控制" })).toBeInTheDocument();
  expect(screen.getByText("单手即可控制移动、左键点击和张手停止。")).toBeInTheDocument();
});

it("moves the desktop pointer from a tracking hand", async () => {
  const { bridge, runFrame } = await renderDesktopApp();
  runFrame(16, handAt("tracking", 0.55, 0.4));

  await waitFor(() => expect(bridge.move).toHaveBeenCalledWith(
    expect.any(Number), expect.any(Number), "tracking",
  ));
});

it("sends a bounded camera frame to the native Apple Vision model", async () => {
  const { bridge, runFrame, video } = await renderDesktopApp();
  Object.defineProperty(video, "videoWidth", { configurable: true, value: 1280 });
  Object.defineProperty(video, "videoHeight", { configurable: true, value: 720 });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => {
    callback(new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: "image/jpeg" }));
  });
  await act(async () => Promise.resolve());

  runFrame(100);

  await waitFor(() => expect(bridge.detectAppleHand).toHaveBeenCalledWith(
    expect.any(Uint8Array),
    100,
  ));
});

it("dispatches one left click after a stable world-space pinch", async () => {
  const { bridge, runFrame } = await renderDesktopApp();
  runFrame(16, handAt("left"));
  runFrame(32, handAt("left"));
  runFrame(48, handAt("left"));
  runFrame(64, handAt("left"));
  runFrame(80, handAt("tracking"));
  runFrame(96, handAt("tracking"));

  await waitFor(() => expect(bridge.click).toHaveBeenCalledOnce());
  expect(bridge.rightClick).not.toHaveBeenCalled();
  expect(bridge.doubleClick).not.toHaveBeenCalled();
  expect(bridge.scroll).not.toHaveBeenCalled();
  expect(bridge.mouseDown).not.toHaveBeenCalled();
});

it("does not click when fingertips overlap only in the camera image", async () => {
  const { bridge, runFrame } = await renderDesktopApp();
  const imageOverlap = handAt("left");
  const worldSeparated = handAt("left");
  worldSeparated[8] = { ...worldSeparated[4]!, z: 0.3 };

  runFrame(16, imageOverlap, worldSeparated);
  runFrame(32, imageOverlap, worldSeparated);
  runFrame(48, handAt("tracking"), handAt("tracking"));
  runFrame(64, handAt("tracking"), handAt("tracking"));

  expect(bridge.click).not.toHaveBeenCalled();
});

it("uses the stricter multi-signal path when world depth is unavailable", async () => {
  const { bridge, runFrame } = await renderDesktopApp();
  runFrame(16, handAt("tracking", 0.55, 0.4), null);
  runFrame(32, handAt("left"), null);
  runFrame(48, handAt("left"), null);
  runFrame(64, handAt("left"), null);
  runFrame(80, handAt("left"), null);
  runFrame(96, handAt("tracking"), null);
  runFrame(112, handAt("tracking"), null);

  await waitFor(() => expect(bridge.move).toHaveBeenCalled());
  await waitFor(() => expect(bridge.click).toHaveBeenCalledOnce());
});

it.each(["right", "double", "scroll"] as const)("does not dispatch the disabled %s action", async (gesture) => {
  const { bridge, runFrame } = await renderDesktopApp();
  for (let at = 16; at <= 128; at += 16) runFrame(at, handAt(gesture));

  expect(bridge.rightClick).not.toHaveBeenCalled();
  expect(bridge.doubleClick).not.toHaveBeenCalled();
  expect(bridge.scroll).not.toHaveBeenCalled();
  expect(bridge.mouseDown).not.toHaveBeenCalled();
});

it("stops desktop pointer movement after an open palm is confirmed", async () => {
  const { bridge, runFrame } = await renderDesktopApp();
  runFrame(16, handAt("tracking"));
  await waitFor(() => expect(bridge.move).toHaveBeenCalled());
  runFrame(32, handAt("open-palm"));
  const movementsBeforeStop = vi.mocked(bridge.move).mock.calls.length;
  runFrame(48, handAt("open-palm"));
  runFrame(64, handAt("open-palm"));

  expect(vi.mocked(bridge.move).mock.calls).toHaveLength(movementsBeforeStop);
  expect(screen.getByRole("status", { name: "摄像头、追踪器和手势状态" })).toHaveTextContent(/手势已暂停/);
});

it("marks the tracker stale if the camera stops yielding frames", async () => {
  const { runAnimationFrame, video } = await renderDesktopApp();
  Object.defineProperty(video, "readyState", { configurable: true, value: HTMLMediaElement.HAVE_METADATA });
  runAnimationFrame(600);

  expect(screen.getByRole("status", { name: "摄像头、追踪器和手势状态" })).toHaveTextContent(/摄像头画面停滞/);
});

it("releases desktop control during unmount", async () => {
  const { bridge, unmount } = await renderDesktopApp();
  unmount();
  expect(bridge.releaseAndPause).toHaveBeenCalledOnce();
});
