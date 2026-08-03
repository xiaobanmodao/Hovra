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
  expect(mediaPipe.forVisionTasks).toHaveBeenCalledOnce();
  expect(mediaPipe.createFromOptions).toHaveBeenCalledWith(wasmFileset, expect.objectContaining({
    runningMode: "VIDEO",
    numHands: 1,
    baseOptions: expect.objectContaining({ modelAssetPath: expect.any(String) }),
  }));
});

it("returns landmarks for only the first detected hand", () => {
  const firstHand = [{ x: 0.1, y: 0.2 }];
  const landmarker = {
    detectForVideo: vi.fn().mockReturnValue({
      landmarks: [firstHand, [{ x: 0.8, y: 0.9 }]],
    }),
  };

  expect(detectFirstHand(landmarker, document.createElement("video"), 123))
    .toBe(firstHand);
  expect(landmarker.detectForVideo).toHaveBeenCalledWith(expect.any(HTMLVideoElement), 123);
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
