import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import type { Landmark } from "../gesture/types";

const MEDIAPIPE_WASM_BASE_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";
const HAND_LANDMARKER_MODEL_URL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

type HandDetector = Pick<HandLandmarker, "detectForVideo">;
type ErrorReporter = (error: unknown) => void;

export const createHandLandmarker = async (): Promise<HandLandmarker> => {
  const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_BASE_URL);

  return HandLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: HAND_LANDMARKER_MODEL_URL },
    runningMode: "VIDEO",
    numHands: 1,
    minHandDetectionConfidence: 0.35,
    minHandPresenceConfidence: 0.35,
    minTrackingConfidence: 0.35,
  });
};

export const detectFirstHand = (
  landmarker: HandDetector,
  video: HTMLVideoElement,
  nowMs: number,
  onError: ErrorReporter = console.error,
): Landmark[] | null => {
  try {
    const landmarks = landmarker.detectForVideo(video, nowMs).landmarks[0];
    return landmarks?.map(({ x, y, z }) => (
      z === undefined ? { x, y } : { x, y, z }
    )) ?? null;
  } catch (error) {
    onError(error);
    return null;
  }
};
