import { expect, it, vi } from "vitest";
const mediaPipe = vi.hoisted(() => ({
  createFromOptions: vi.fn(),
  forVisionTasks: vi.fn(),
}));

vi.mock("@mediapipe/tasks-vision", () => ({
  FilesetResolver: { forVisionTasks: mediaPipe.forVisionTasks },
  HandLandmarker: { createFromOptions: mediaPipe.createFromOptions },
}));

import { createHandLandmarker, detectFirstHand } from "./handLandmarker";

it("creates a video-mode landmarker that detects one hand", async () => {
  const wasmFileset = { wasmLoaderPath: "loader", wasmBinaryPath: "binary" };
  const landmarker = { detectForVideo: vi.fn() };
  mediaPipe.forVisionTasks.mockResolvedValue(wasmFileset);
  mediaPipe.createFromOptions.mockResolvedValue(landmarker);

  await expect(createHandLandmarker()).resolves.toBe(landmarker);
  expect(mediaPipe.forVisionTasks).toHaveBeenCalledWith(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm",
  );
  expect(mediaPipe.createFromOptions).toHaveBeenCalledWith(wasmFileset, expect.objectContaining({
    runningMode: "VIDEO",
    numHands: 1,
    minHandDetectionConfidence: 0.35,
    minHandPresenceConfidence: 0.35,
    minTrackingConfidence: 0.35,
    baseOptions: expect.objectContaining({ modelAssetPath: expect.any(String) }),
  }));
});

it("returns matched image and world landmarks for only the first detected hand", () => {
  const firstHand = Array.from({ length: 21 }, (_, index) => ({ x: 0.1 + index / 100, y: 0.2 }));
  const firstWorldHand = Array.from(
    { length: 21 },
    (_, index) => ({ x: 0.01 + index / 1_000, y: 0.02, z: 0.03 }),
  );
  const landmarker = {
    detectForVideo: vi.fn().mockReturnValue({
      landmarks: [firstHand, [{ x: 0.8, y: 0.9 }]],
      worldLandmarks: [firstWorldHand, [{ x: 0.08, y: 0.09, z: 0.1 }]],
    }),
  };

  expect(detectFirstHand(landmarker, document.createElement("video"), 123))
    .toEqual({ landmarks: firstHand, worldLandmarks: firstWorldHand });
  expect(landmarker.detectForVideo).toHaveBeenCalledWith(expect.any(HTMLVideoElement), 123);
});

it("normalizes MediaPipe-only landmark fields before handing them to the gesture engine", () => {
  const firstHand = Array.from({ length: 21 }, (_, index) => ({
    x: index / 100,
    y: index / 200,
    z: -index / 300,
    visibility: 0.95,
  }));
  const firstWorldHand = Array.from({ length: 21 }, (_, index) => ({
    x: index / 1_000,
    y: index / 2_000,
    z: -index / 3_000,
    visibility: 0.9,
  }));
  const landmarker = {
    detectForVideo: vi.fn().mockReturnValue({
      landmarks: [firstHand],
      worldLandmarks: [firstWorldHand],
    }),
  };

  expect(detectFirstHand(landmarker, document.createElement("video"), 123)).toEqual(
    {
      landmarks: firstHand.map(({ x, y, z }) => ({ x, y, z })),
      worldLandmarks: firstWorldHand.map(({ x, y, z }) => ({ x, y, z })),
    },
  );
});

it("keeps image tracking while marking missing world depth unavailable", () => {
  const firstHand = Array.from({ length: 21 }, () => ({ x: 0.4, y: 0.5, z: 0 }));
  const landmarker = {
    detectForVideo: vi.fn().mockReturnValue({ landmarks: [firstHand], worldLandmarks: [] }),
  };

  expect(detectFirstHand(landmarker, document.createElement("video"), 123)).toEqual({
    landmarks: firstHand,
    worldLandmarks: null,
  });
});

it("reports a detection failure once and returns null", () => {
  const error = new Error("camera frame unavailable");
  const onError = vi.fn();
  const landmarker = {
    detectForVideo: vi.fn().mockImplementation(() => {
      throw error;
    }),
  };

  expect(detectFirstHand(landmarker, document.createElement("video"), 123, onError))
    .toBeNull();
  expect(onError).toHaveBeenCalledTimes(1);
  expect(onError).toHaveBeenCalledWith(error);
});
