import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import type { GestureDesktopApi } from "./electron.d";
import { makeGestureHand } from "./gesture/fixtures/stable-gesture-sequences";
import type { Landmark } from "./gesture/types";
import type { DetectedHand } from "./vision/handLandmarker";

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

it("不再显示会干扰稳定内核的个人点击校准", () => {
  render(<App />);

  expect(screen.queryByRole("button", { name: "开始个人点击校准" })).not.toBeInTheDocument();
  expect(screen.queryByText("个人点击参数已启用")).not.toBeInTheDocument();
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
  saveGestureTrace: vi.fn().mockResolvedValue("saved"),
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
  expect(screen.getByRole("heading", { name: "Hovra" })).toBeInTheDocument();
  expect(screen.getByText("单手即可控制移动、左键点击和张手停止。")).toBeInTheDocument();
});

it("moves the desktop pointer from a tracking hand", async () => {
  const { bridge, runFrame } = await renderDesktopApp();
  runFrame(16, handAt("tracking", 0.55, 0.4));

  await waitFor(() => expect(bridge.move).toHaveBeenCalledWith(
    expect.any(Number), expect.any(Number), "tracking",
  ));
});

it("实时帧只走同步 MediaPipe，不再编码或发送 Apple Vision 图像", async () => {
  const { runFrame, video } = await renderDesktopApp();
  Object.defineProperty(video, "videoWidth", { configurable: true, value: 1280 });
  Object.defineProperty(video, "videoHeight", { configurable: true, value: 720 });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
  const toBlob = vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => {
    callback(new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: "image/jpeg" }));
  });
  await act(async () => Promise.resolve());

  runFrame(100);

  expect(vision.detectFirstHand).toHaveBeenCalled();
  expect(toBlob).not.toHaveBeenCalled();
});

it("第二个真实接触帧立即点击一次且系统控制保持开启", async () => {
  const { bridge, runFrame } = await renderDesktopApp();
  runFrame(16, handAt("left"));
  runFrame(32, handAt("left"));

  await waitFor(() => expect(bridge.click).toHaveBeenCalledOnce());
  expect(screen.getByText("已启用")).toBeInTheDocument();
  runFrame(48, handAt("left"));
  runFrame(64, handAt("tracking"));
  runFrame(80, handAt("tracking", 0.55, 0.4));
  await waitFor(() => expect(bridge.move).toHaveBeenCalled());
  expect(bridge.click).toHaveBeenCalledOnce();
  expect(bridge.rightClick).not.toHaveBeenCalled();
  expect(bridge.doubleClick).not.toHaveBeenCalled();
  expect(bridge.scroll).not.toHaveBeenCalled();
  expect(bridge.mouseDown).not.toHaveBeenCalled();
});

it("指尖只在画面重合但同帧纵深分离时不点击", async () => {
  const { bridge, runFrame } = await renderDesktopApp();
  const imageOverlap = handAt("left");
  imageOverlap[4] = { ...imageOverlap[4]!, z: -0.12 };
  imageOverlap[8] = { ...imageOverlap[8]!, z: 0.12 };

  runFrame(16, imageOverlap, handAt("left"));
  runFrame(32, imageOverlap, handAt("left"));
  runFrame(48, handAt("tracking"), handAt("tracking"));
  runFrame(64, handAt("tracking"), handAt("tracking"));

  expect(bridge.click).not.toHaveBeenCalled();
});

it("世界坐标缺失或错误都不再阻断同帧真实接触", async () => {
  const { bridge, runFrame } = await renderDesktopApp();
  const misleadingWorld = handAt("left");
  misleadingWorld[8] = { ...misleadingWorld[4]!, z: 0.7 };
  runFrame(16, handAt("left"), misleadingWorld);
  runFrame(32, handAt("left"), misleadingWorld);

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
  runFrame(48, handAt("open-palm"));
  const movementsBeforeStop = vi.mocked(bridge.move).mock.calls.length;
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

it("开始稳定性测试立即暂停系统控制且不再派发桌面事件", async () => {
  const { bridge, runFrame } = await renderDesktopApp();
  const start = await screen.findByRole("button", { name: "开始稳定性测试" });
  fireEvent.click(start);
  await waitFor(() => expect(bridge.releaseAndPause).toHaveBeenCalled());
  vi.mocked(bridge.move).mockClear();
  vi.mocked(bridge.click).mockClear();
  runFrame(100, handAt("left"));
  runFrame(116, handAt("left"));
  expect(bridge.move).not.toHaveBeenCalled();
  expect(bridge.click).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "启用系统控制" })).toBeDisabled();
});
