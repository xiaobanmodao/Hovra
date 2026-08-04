import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";
import type { GestureDesktopApi } from "./electron.d";
import { makeGestureHand } from "./gesture/fixtures/stable-gesture-sequences";
import type { GestureSettings, Landmark } from "./gesture/types";

const vision = vi.hoisted(() => ({
  close: vi.fn(),
  createHandLandmarker: vi.fn(),
  detectFirstHand: vi.fn(),
}));

const gestureEngine = vi.hoisted(() => ({
  createdWith: vi.fn(),
}));

vi.mock("./vision/handLandmarker", () => ({
  createHandLandmarker: vision.createHandLandmarker,
  detectFirstHand: vision.detectFirstHand,
}));

vi.mock("./gesture/gestureEngine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./gesture/gestureEngine")>();

  return {
    GestureEngine: class extends actual.GestureEngine {
      constructor(settings?: GestureSettings) {
        super(settings);
        gestureEngine.createdWith(settings);
      }
    },
  };
});

import App from "./App";

const pinchedHandAt = (x: number, y: number): Landmark[] => {
  return makeGestureHand("left", { cursor: { x, y } });
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
  delete window.gestureDesktop;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vision.close.mockReset();
  vision.createHandLandmarker.mockReset();
  vision.detectFirstHand.mockReset();
  gestureEngine.createdWith.mockReset();
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

const extendedPinchHandAt = (
  kind: "left" | "right" | "double",
  x: number,
  y: number,
): Landmark[] => {
  return makeGestureHand(kind, { cursor: { x, y } });
};

const scrollingHandAt = (verticalOffset = 0): Landmark[] => {
  return makeGestureHand("scroll", { translateY: 0.5 + verticalOffset });
};

const trackingHandAt = (x: number, y: number): Landmark[] => {
  return makeGestureHand("tracking", { cursor: { x, y } });
};

const openPalmAt = (x: number, y: number): Landmark[] => {
  return makeGestureHand("open-palm", { cursor: { x, y } });
};

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((next) => {
    resolve = next;
  });
  return { promise, resolve };
};

const renderDesktopApp = async (options: {
  bridge?: GestureDesktopApi;
  enable?: boolean;
} = {}) => {
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
  let detectedHand: Landmark[] | null = trackingHandAt(0.4, 0.4);
  vision.detectFirstHand.mockImplementation(() => detectedHand);
  const bridge = options.bridge ?? desktopApi();
  window.gestureDesktop = bridge;

  const rendered = render(<App />);
  const video = screen.getByLabelText(/mirrored camera preview/i) as HTMLVideoElement;
  Object.defineProperty(video, "readyState", {
    configurable: true,
    value: HTMLMediaElement.HAVE_CURRENT_DATA,
  });
  Object.defineProperty(video, "currentTime", {
    configurable: true,
    value: 0,
    writable: true,
  });
  fireEvent.loadedData(video);
  await waitFor(() => expect(nextFrame).not.toBeNull());

  let videoTime = 0;
  const runAnimationFrame = (nowMs: number) => {
    act(() => nextFrame?.(nowMs));
  };
  const runFrame = (nowMs: number, hand: Landmark[] | null = detectedHand) => {
    detectedHand = hand;
    videoTime += 1;
    video.currentTime = videoTime;
    runAnimationFrame(nowMs);
  };

  runFrame(16);
  const enable = await screen.findByRole("button", { name: "Enable system control" });
  await waitFor(() => expect(enable).toBeEnabled());
  if (options.enable !== false) {
    fireEvent.click(enable);
    await screen.findByText("Enabled");
  }

  return { ...rendered, bridge, enable, runAnimationFrame, runFrame, video };
};

const startDesktopDrag = async (
  runFrame: (nowMs: number, hand?: Landmark[] | null) => void,
  bridge: GestureDesktopApi,
) => {
  const hand = pinchedHandAt(0.4, 0.4);
  runFrame(100, hand);
  runFrame(140, hand);
  runFrame(180, hand);
  runFrame(220, hand);
  runFrame(260, hand);
  runFrame(610, hand);
  await waitFor(() => expect(bridge.mouseDown).toHaveBeenCalledOnce());
};

it("renders the hand gesture demo heading", () => {
  render(<App />);
  expect(screen.getByRole("heading", { name: /hand gesture/i })).toBeInTheDocument();
});

it("propagates calibration settings and displays the live three-dimensional pinch distance", async () => {
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
  const hand: Landmark[] = Array.from({ length: 21 }, () => ({ x: 0, y: 0 }));
  hand[4] = { x: 0.2, y: 0.3, z: 0 };
  hand[8] = { x: 0.24, y: 0.3, z: 0.03 };
  vision.detectFirstHand.mockReturnValue(hand);

  render(<App />);

  fireEvent.click(screen.getByRole("button", { name: "Increase drag hold" }));
  expect(gestureEngine.createdWith).toHaveBeenLastCalledWith(
    expect.objectContaining({ dragHoldMs: 400 }),
  );

  fireEvent.click(screen.getByRole("button", { name: "Reset defaults" }));
  expect(gestureEngine.createdWith).toHaveBeenLastCalledWith(
    expect.objectContaining({ dragHoldMs: 350 }),
  );

  const video = screen.getByLabelText(/mirrored camera preview/i) as HTMLVideoElement;
  Object.defineProperty(video, "readyState", {
    configurable: true,
    value: HTMLMediaElement.HAVE_CURRENT_DATA,
  });
  Object.defineProperty(video, "currentTime", {
    configurable: true,
    value: 1,
  });
  fireEvent.loadedData(video);

  await waitFor(() => expect(nextFrame).not.toBeNull());
  act(() => nextFrame?.(16));

  expect(screen.getByText("Pinch distance").nextElementSibling).toHaveTextContent("0.050");
});

it("ends an active drag before replacing the engine when calibration settings change", async () => {
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
  const startingCursor = {
    x: 1 - 50 / window.innerWidth,
    y: 50 / window.innerHeight,
  };
  let detectedHand = pinchedHandAt(startingCursor.x, startingCursor.y);
  vision.detectFirstHand.mockImplementation(() => detectedHand);
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
  act(() => nextFrame?.(96));
  video.currentTime = 3;
  act(() => nextFrame?.(446));

  const status = screen.getByRole("status", { name: /camera, tracker and gesture status/i });
  const card = screen.getByTestId("draggable-card");
  expect(status).toHaveTextContent(/gesturedragging/i);
  expect(card).toHaveStyle({ left: "20px", top: "30px" });

  fireEvent.click(screen.getByRole("button", { name: "Increase drag hold" }));

  expect(status).toHaveTextContent(/gesturelost/i);
  expect(card).not.toHaveClass("is-dragging");

  const distantCursor = {
    x: 1 - 800 / window.innerWidth,
    y: 400 / window.innerHeight,
  };
  detectedHand = pinchedHandAt(distantCursor.x, distantCursor.y);
  video.currentTime = 4;
  act(() => nextFrame?.(1_000));
  video.currentTime = 5;
  act(() => nextFrame?.(1_040));
  video.currentTime = 6;
  act(() => nextFrame?.(1_080));
  video.currentTime = 7;
  act(() => nextFrame?.(1_120));
  video.currentTime = 8;
  act(() => nextFrame?.(1_160));
  video.currentTime = 9;
  act(() => nextFrame?.(1_510));

  expect(status).toHaveTextContent(/gesturedragging/i);
  expect(card).toHaveStyle({ left: "20px", top: "30px" });
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
  act(() => nextFrame?.(96));
  video.currentTime = 3;
  act(() => nextFrame?.(446));
  expect(vision.detectFirstHand).toHaveBeenCalledTimes(3);
  const status = screen.getByRole("status", { name: /camera, tracker and gesture status/i });
  expect(status).toHaveTextContent(/gesturedragging/i);
  const card = screen.getByTestId("draggable-card");
  expect(card).toHaveStyle({ left: "20px", top: "30px" });

  Object.defineProperty(video, "readyState", {
    configurable: true,
    value: HTMLMediaElement.HAVE_METADATA,
  });
  act(() => nextFrame?.(950));
  expect(vision.detectFirstHand).toHaveBeenCalledTimes(3);
  expect(status).toHaveTextContent(/camera frame stalled/i);
  expect(status).toHaveTextContent(/gesturelost/i);
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
  act(() => nextFrame?.(96));
  video.currentTime = 3;
  act(() => nextFrame?.(446));
  const status = screen.getByRole("status", { name: /camera, tracker and gesture status/i });
  expect(status).toHaveTextContent(/gesturedragging/i);
  const card = screen.getByTestId("draggable-card");
  expect(card).toHaveStyle({ left: "20px", top: "30px" });

  act(() => stream.dispatchEvent(new Event("inactive")));

  expect(status).toHaveTextContent(/gesturelost/i);
  expect(card).toHaveStyle({ left: "20px", top: "30px" });
  expect(track.stop).toHaveBeenCalledOnce();
  expect(vision.close).toHaveBeenCalledOnce();
  expect(cancelAnimationFrame).toHaveBeenCalledWith(7);
});

it("dispatches hover movement, short clicks, and drag-aware movement while enabled", async () => {
  const { bridge, runFrame } = await renderDesktopApp();

  runFrame(50, trackingHandAt(0.45, 0.45));
  await waitFor(() => expect(bridge.move).toHaveBeenCalled());
  expect(bridge.move).toHaveBeenLastCalledWith(expect.any(Number), expect.any(Number), "tracking");

  runFrame(100, pinchedHandAt(0.45, 0.45));
  runFrame(140, pinchedHandAt(0.45, 0.45));
  runFrame(180, pinchedHandAt(0.45, 0.45));
  runFrame(220, pinchedHandAt(0.45, 0.45));
  runFrame(260, pinchedHandAt(0.45, 0.45));
  runFrame(300, trackingHandAt(0.45, 0.45));
  runFrame(340, trackingHandAt(0.45, 0.45));
  runFrame(380, trackingHandAt(0.45, 0.45));
  runFrame(420, trackingHandAt(0.45, 0.45));
  runFrame(460, trackingHandAt(0.45, 0.45));
  await waitFor(() => expect(bridge.click).toHaveBeenCalledOnce());

  runFrame(650, pinchedHandAt(0.45, 0.45));
  runFrame(690, pinchedHandAt(0.45, 0.45));
  runFrame(730, pinchedHandAt(0.45, 0.45));
  runFrame(770, pinchedHandAt(0.45, 0.45));
  runFrame(810, pinchedHandAt(0.45, 0.45));
  runFrame(1_160, pinchedHandAt(0.45, 0.45));
  await waitFor(() => expect(bridge.mouseDown).toHaveBeenCalledOnce());
  await waitFor(() => expect(bridge.drag).toHaveBeenCalledWith(expect.any(Number), expect.any(Number)));

  const moveCountDuringDrag = vi.mocked(bridge.move).mock.calls.length;
  runFrame(1_180, pinchedHandAt(0.5, 0.5));
  await waitFor(() => expect(bridge.drag).toHaveBeenLastCalledWith(expect.any(Number), expect.any(Number)));
  expect(bridge.move).toHaveBeenCalledTimes(moveCountDuringDrag);

  const dragCountBeforeRelease = vi.mocked(bridge.drag).mock.calls.length;
  runFrame(1_220, trackingHandAt(0.45, 0.45));
  runFrame(1_260, trackingHandAt(0.45, 0.45));
  runFrame(1_300, trackingHandAt(0.45, 0.45));
  runFrame(1_340, trackingHandAt(0.45, 0.45));
  runFrame(1_380, trackingHandAt(0.45, 0.45));
  await waitFor(() => expect(bridge.mouseUp).toHaveBeenCalledOnce());
  expect(vi.mocked(bridge.drag).mock.calls.length).toBeGreaterThan(dragCountBeforeRelease);
  const mouseDownOrder = vi.mocked(bridge.mouseDown).mock.invocationCallOrder[0]!;
  const mouseUpOrder = vi.mocked(bridge.mouseUp).mock.invocationCallOrder[0]!;
  expect(vi.mocked(bridge.move).mock.invocationCallOrder.filter(
    (order) => order > mouseDownOrder && order < mouseUpOrder,
  )).toHaveLength(0);
  expect(vi.mocked(bridge.drag).mock.invocationCallOrder.at(-1)).toBeLessThan(mouseUpOrder);
});

it("shows left-pinch feedback on the first frame without waiting for drag hold", async () => {
  const { bridge, runFrame } = await renderDesktopApp();

  runFrame(100, extendedPinchHandAt("left", 0.45, 0.45));

  await waitFor(() => expect(bridge.move).toHaveBeenCalledWith(
    expect.any(Number),
    expect.any(Number),
    "candidate-left",
  ));
  expect(document.querySelector(".virtual-cursor")).toHaveClass("is-left-pinching", "is-candidate");
  expect(bridge.mouseDown).not.toHaveBeenCalled();
});

it("dispatches right click and double click without disabling explicit control", async () => {
  const { bridge, runFrame } = await renderDesktopApp();

  runFrame(100, extendedPinchHandAt("right", 0.45, 0.45));
  runFrame(140, extendedPinchHandAt("right", 0.45, 0.45));
  runFrame(180, extendedPinchHandAt("right", 0.45, 0.45));
  runFrame(220, extendedPinchHandAt("right", 0.45, 0.45));
  runFrame(260, extendedPinchHandAt("right", 0.45, 0.45));
  runFrame(300, extendedPinchHandAt("right", 0.45, 0.45));
  for (let at = 340; at <= 580; at += 40) runFrame(at, trackingHandAt(0.45, 0.45));
  for (let at = 760; at <= 1_000; at += 40) {
    runFrame(at, extendedPinchHandAt("double", 0.45, 0.45));
  }
  for (let at = 1_040; at <= 1_280; at += 40) runFrame(at, trackingHandAt(0.45, 0.45));

  await waitFor(() => expect(bridge.rightClick).toHaveBeenCalledOnce());
  await waitFor(() => expect(bridge.doubleClick).toHaveBeenCalledOnce());
  expect(bridge.click).not.toHaveBeenCalled();
  expect(bridge.releaseAndPause).not.toHaveBeenCalled();
  expect(screen.getByText("Enabled")).toBeInTheDocument();
});

it("keeps the system pointer fixed while two-finger movement scrolls", async () => {
  const { bridge, runFrame } = await renderDesktopApp();

  runFrame(100, trackingHandAt(0.45, 0.45));
  await waitFor(() => expect(bridge.move).toHaveBeenCalled());
  for (let at = 116; at <= 356; at += 40) runFrame(at, scrollingHandAt());
  await waitFor(() => expect(bridge.move).toHaveBeenCalledWith(
    expect.any(Number),
    expect.any(Number),
    "scrolling",
  ));
  const firstPointer = [...vi.mocked(bridge.move).mock.calls]
    .reverse()
    .find(([, , state]) => state === "scrolling")?.slice(0, 2);
  runFrame(396, scrollingHandAt(-0.04));
  runFrame(436, scrollingHandAt(-0.04));

  await waitFor(() => expect(bridge.scroll).toHaveBeenCalledWith(expect.any(Number)));
  expect(vi.mocked(bridge.scroll).mock.calls.some(([amount]) => amount !== 0)).toBe(true);
  const scrollingMoves = vi.mocked(bridge.move).mock.calls.filter(
    ([, , state]) => state === "scrolling",
  );
  expect(scrollingMoves.every(([x, y]) => x === firstPointer?.[0] && y === firstPointer?.[1])).toBe(true);
});

it.each(["lost", "stale-frame"] as const)(
  "releases a drag without disabling explicit system control on %s safety",
  async (safety) => {
    const { bridge, runAnimationFrame, runFrame, video } = await renderDesktopApp();
    await startDesktopDrag(runFrame, bridge);

    if (safety === "lost") {
      runFrame(650, null);
      runFrame(770, null);
    } else if (safety === "stale-frame") {
      Object.defineProperty(video, "readyState", {
        configurable: true,
        value: HTMLMediaElement.HAVE_METADATA,
      });
      runAnimationFrame(1_200);
    }

    await waitFor(() => expect(bridge.mouseUp).toHaveBeenCalledOnce());
    expect(bridge.releaseAndPause).not.toHaveBeenCalled();
    expect(screen.getByText("Enabled")).toBeInTheDocument();
  },
);

it("keeps system control enabled when an open palm completes a click", async () => {
  const { bridge, runFrame } = await renderDesktopApp();

  runFrame(100, pinchedHandAt(0.4, 0.4));
  runFrame(140, pinchedHandAt(0.4, 0.4));
  runFrame(180, pinchedHandAt(0.4, 0.4));
  runFrame(220, pinchedHandAt(0.4, 0.4));
  runFrame(260, openPalmAt(0.4, 0.1));
  runFrame(300, openPalmAt(0.4, 0.1));
  runFrame(340, openPalmAt(0.4, 0.1));
  runFrame(380, openPalmAt(0.4, 0.1));
  runFrame(420, openPalmAt(0.4, 0.1));

  await waitFor(() => expect(bridge.click).toHaveBeenCalledOnce());
  expect(bridge.releaseAndPause).not.toHaveBeenCalled();
  expect(screen.getByText("Enabled")).toBeInTheDocument();
});

it("keeps system control enabled when an open palm ends a drag", async () => {
  const { bridge, runFrame } = await renderDesktopApp();
  await startDesktopDrag(runFrame, bridge);

  runFrame(650, openPalmAt(0.4, 0.1));
  runFrame(690, openPalmAt(0.4, 0.1));
  runFrame(730, openPalmAt(0.4, 0.1));
  runFrame(770, openPalmAt(0.4, 0.1));
  runFrame(810, openPalmAt(0.4, 0.1));
  runFrame(850, openPalmAt(0.4, 0.1));

  await waitFor(() => expect(bridge.mouseUp).toHaveBeenCalledOnce());
  expect(bridge.releaseAndPause).not.toHaveBeenCalled();
  expect(screen.getByText("Enabled")).toBeInTheDocument();
});

it("keeps system control enabled when the app window loses focus", async () => {
  const { bridge, runFrame } = await renderDesktopApp();
  await startDesktopDrag(runFrame, bridge);

  act(() => window.dispatchEvent(new Event("blur")));

  expect(bridge.releaseAndPause).not.toHaveBeenCalled();
  expect(screen.getByText("Enabled")).toBeInTheDocument();
});

it("requests a mouse release when the renderer unmounts", async () => {
  const { bridge, runFrame, unmount } = await renderDesktopApp();
  await startDesktopDrag(runFrame, bridge);

  unmount();

  expect(bridge.releaseAndPause).toHaveBeenCalledOnce();
});

it("reconciles a rejected main-process activation and remains paused", async () => {
  const bridge = desktopApi();
  vi.mocked(bridge.activate).mockResolvedValue(false);
  window.gestureDesktop = bridge;

  render(<App />);
  const enable = await screen.findByRole("button", { name: "Enable system control" });
  await waitFor(() => expect(enable).toBeEnabled());
  fireEvent.click(enable);

  await waitFor(() => expect(bridge.activate).toHaveBeenCalledOnce());
  expect(screen.getByText("Paused")).toBeInTheDocument();
  expect(bridge.move).not.toHaveBeenCalled();
  expect(bridge.click).not.toHaveBeenCalled();
  expect(bridge.mouseDown).not.toHaveBeenCalled();
});

it("does not cancel an explicit pending activation when tracking becomes lost", async () => {
  let resolveActivation!: (active: boolean) => void;
  const activation = new Promise<boolean>((resolve) => {
    resolveActivation = resolve;
  });
  const bridge = desktopApi();
  vi.mocked(bridge.activate).mockReturnValue(activation);
  const { enable, runFrame } = await renderDesktopApp({ bridge, enable: false });

  fireEvent.click(enable);
  await waitFor(() => expect(bridge.activate).toHaveBeenCalledOnce());
  runFrame(100, null);

  expect(bridge.releaseAndPause).not.toHaveBeenCalled();
  await act(async () => {
    resolveActivation(true);
    await activation;
  });
  await screen.findByText("Enabled");
});
