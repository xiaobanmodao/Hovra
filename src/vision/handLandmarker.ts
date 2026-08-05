import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import type { Landmark } from "../gesture/types";

const MEDIAPIPE_WASM_BASE_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";
const HAND_LANDMARKER_MODEL_URL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

type HandDetector = Pick<HandLandmarker, "detectForVideo">;
type ErrorReporter = (error: unknown) => void;

export type DetectedHand = {
  landmarks: Landmark[];
  worldLandmarks: Landmark[] | null;
};

export const createHandLandmarker = async (): Promise<HandLandmarker> => {
  const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_BASE_URL);
  const options = {
    runningMode: "VIDEO",
    numHands: 1,
    minHandDetectionConfidence: 0.35,
    minHandPresenceConfidence: 0.35,
    minTrackingConfidence: 0.35,
  } as const;

  try {
    return await HandLandmarker.createFromOptions(vision, {
      ...options,
      baseOptions: { modelAssetPath: HAND_LANDMARKER_MODEL_URL, delegate: "GPU" },
    });
  } catch {
    return HandLandmarker.createFromOptions(vision, {
      ...options,
      baseOptions: { modelAssetPath: HAND_LANDMARKER_MODEL_URL },
    });
  }
};

export const detectFirstHand = (
  landmarker: HandDetector,
  video: HTMLVideoElement,
  nowMs: number,
  onError: ErrorReporter = console.error,
): DetectedHand | null => {
  try {
    const result = landmarker.detectForVideo(video, nowMs);
    const landmarks = normalizeLandmarks(result.landmarks[0]);
    const worldLandmarks = normalizeLandmarks(result.worldLandmarks[0]);
    return landmarks ? { landmarks, worldLandmarks } : null;
  } catch (error) {
    onError(error);
    return null;
  }
};

function normalizeLandmarks(
  landmarks: Array<{ x: number; y: number; z?: number }> | undefined,
): Landmark[] | null {
  if (
    landmarks?.length !== 21
    || landmarks.some(({ x, y, z }) => (
      !Number.isFinite(x) || !Number.isFinite(y) || (z !== undefined && !Number.isFinite(z))
    ))
  ) {
    return null;
  }
  return landmarks.map(({ x, y, z }) => (
    z === undefined ? { x, y } : { x, y, z }
  ));
}
