import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";
import type { GestureDesktopApi } from "./electron.d";
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
  move: vi.fn().mockResolvedValue(undefined),
  click: vi.fn().mockResolvedValue(undefined),
  mouseDown: vi.fn().mockResolvedValue(undefined),
  mouseUp: vi.fn().mockResolvedValue(undefined),
  onSafetyPause: vi.fn(() => vi.fn()),
});

const trackingHandAt = (x: number, y: number): Landmark[] => {
  const hand = Array.from({ length: 21 }, () => ({ x: 0, y: 0 }));
  hand[4] = { x: x - 0.25, y: y - 0.25 };
  hand[8] = { x, y };
  return hand;
};

const openPalmAt = (x: number, y: number): Landmark[] => {
  const hand = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5 }));
  hand[8] = { x, y };
  hand[12] = { x: 0.5, y: 0.1 };
  hand[16] = { x: 0.8, y: 0.2 };
  hand[20] = { x: 0.9, y: 0.5 };
  hand[4] = { x: 0.15, y: 0.75 };
  return hand;
};

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((next) => {
    resolve = next;
  });
  return { promise, resolve };
};

const renderDesktopApp = async () => {
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
  const bridge = desktopApi();
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
  fireEvent.click(enable);
  await screen.findByText("Enabled");

  return { ...rendered, bridge, runAnimationFrame, runFrame, video };
};

const startDesktopDrag = async (
  runFrame: (nowMs: number, hand?: Landmark[] | null) => void,
  bridge: GestureDesktopApi,
) => {
  const hand = pinchedHandAt(0.4, 0.4);
  runFrame(100, hand);
  runFrame(500, hand);
  await waitFor(() => expect(bridge.mouseDown).toHaveBeenCalledOnce());
};

it("renders the hand gesture demo heading", () => {
  render(<App />);
  expect(screen.getByRole("heading", { name: /hand gesture/i })).toBeInTheDocument();
});

it("propagates calibration settings and displays the live two-dimensional pinch distance", async () => {
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
  const hand = Array.from({ length: 21 }, () => ({ x: 0, y: 0 }));
  hand[4] = { x: 0.2, y: 0.3 };
  hand[8] = { x: 0.24, y: 0.3 };
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

  expect(screen.getByText("Pinch distance").nextElementSibling).toHaveTextContent("0.040");
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
  act(() => nextFrame?.(400));

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
  video.currentTime = 3;
  act(() => nextFrame?.(500));
  video.currentTime = 4;
  act(() => nextFrame?.(900));

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
  act(() => nextFrame?.(400));
  expect(vision.detectFirstHand).toHaveBeenCalledTimes(2);
  const status = screen.getByRole("status", { name: /camera, tracker and gesture status/i });
  expect(status).toHaveTextContent(/gesturedragging/i);
  const card = screen.getByTestId("draggable-card");
  expect(card).toHaveStyle({ left: "20px", top: "30px" });

  Object.defineProperty(video, "readyState", {
    configurable: true,
    value: HTMLMediaElement.HAVE_METADATA,
  });
  act(() => nextFrame?.(950));
  expect(vision.detectFirstHand).toHaveBeenCalledTimes(2);
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
  act(() => nextFrame?.(400));
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

it("dispatches cursor movement, short clicks, and drag button transitions while enabled", async () => {
  const { bridge, runFrame } = await renderDesktopApp();

  runFrame(50, trackingHandAt(0.45, 0.45));
  await waitFor(() => expect(bridge.move).toHaveBeenCalled());

  runFrame(100, pinchedHandAt(0.45, 0.45));
  runFrame(200, trackingHandAt(0.45, 0.45));
  await waitFor(() => expect(bridge.click).toHaveBeenCalledOnce());

  runFrame(300, pinchedHandAt(0.45, 0.45));
  runFrame(700, pinchedHandAt(0.45, 0.45));
  await waitFor(() => expect(bridge.mouseDown).toHaveBeenCalledOnce());

  runFrame(800, trackingHandAt(0.45, 0.45));
  await waitFor(() => expect(bridge.mouseUp).toHaveBeenCalledOnce());
});

it.each(["lost", "open-palm", "stale-frame", "window-blur"] as const)(
  "awaits mouse release before showing system control paused on %s safety",
  async (safety) => {
    const { bridge, runAnimationFrame, runFrame, video } = await renderDesktopApp();
    await startDesktopDrag(runFrame, bridge);
    const release = deferred();
    vi.mocked(bridge.mouseUp).mockImplementation(() => release.promise);

    if (safety === "lost") {
      runFrame(600, null);
    } else if (safety === "open-palm") {
      runFrame(600, openPalmAt(0.4, 0.1));
    } else if (safety === "stale-frame") {
      Object.defineProperty(video, "readyState", {
        configurable: true,
        value: HTMLMediaElement.HAVE_METADATA,
      });
      runAnimationFrame(1_100);
    } else {
      act(() => window.dispatchEvent(new Event("blur")));
    }

    expect(bridge.mouseUp).toHaveBeenCalledOnce();
    expect(screen.getByText("Enabled")).toBeInTheDocument();

    await act(async () => {
      release.resolve();
      await release.promise;
    });
    await screen.findByText("Paused");
  },
);

it("requests a mouse release when the renderer unmounts", async () => {
  const { bridge, runFrame, unmount } = await renderDesktopApp();
  await startDesktopDrag(runFrame, bridge);

  unmount();

  expect(bridge.mouseUp).toHaveBeenCalledOnce();
});
