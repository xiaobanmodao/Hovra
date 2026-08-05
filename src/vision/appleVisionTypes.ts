import type { Landmark } from "../gesture/types";

export type AppleVisionObservation = {
  landmarks: Landmark[];
  confidences: number[];
  capturedAtMs: number;
  inferenceMs: number;
};
