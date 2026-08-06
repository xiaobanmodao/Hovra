import type { GestureRegressionCase } from "../gestureRegression";
import type { GestureTraceFrame, GestureTraceV5 } from "../gestureTrace";
import type { Landmark } from "../types";
import {
  makeGestureHand,
  type SyntheticGesture,
  type SyntheticHandOptions,
} from "./stable-gesture-sequences";

const FRAME_INTERVAL_MS = 16;

const rawFrame = (
  t: number,
  landmarks: Landmark[] | null,
  worldLandmarks: Landmark[] | null = landmarks,
): GestureTraceFrame => ({
  t,
  landmarks,
  worldLandmarks,
  quality: landmarks ? 1 : 0,
  features: null,
  phase: landmarks ? "neutral" : "lost",
  candidate: null,
  confirmationProgress: 0,
  lockedGesture: null,
  events: [],
});

const gestureFrames = (
  gesture: SyntheticGesture,
  startMs: number,
  count: number,
  options: SyntheticHandOptions = {},
): GestureTraceFrame[] => Array.from({ length: count }, (_, index) => {
  const hand = makeGestureHand(gesture, options);
  return rawFrame(startMs + index * FRAME_INTERVAL_MS, hand);
});

const trace = (frames: GestureTraceFrame[]): GestureTraceV5 => ({
  version: 5,
  frames,
});

const shortPinch: GestureRegressionCase = {
  name: "短捏合",
  trace: trace([
    ...gestureFrames("tracking", 0, 3),
    ...gestureFrames("left", 48, 3),
    ...gestureFrames("tracking", 96, 4),
  ]),
  expectations: [
    { event: "click", startMs: 96, endMs: 144 },
  ],
};

const longPress: GestureRegressionCase = {
  name: "长按",
  trace: trace([
    ...gestureFrames("tracking", 0, 3),
    ...gestureFrames("left", 48, 31),
    ...gestureFrames("tracking", 544, 4),
  ]),
  expectations: [
    { event: "dragStart", startMs: 464, endMs: 528 },
    { event: "dragEnd", startMs: 544, endMs: 592 },
  ],
};

const openPalmPause: GestureRegressionCase = {
  name: "张掌停止",
  trace: trace([
    ...gestureFrames("tracking", 0, 3),
    ...gestureFrames("open-palm", 48, 5),
  ]),
  expectations: [
    { event: "pause", startMs: 48, endMs: 112 },
  ],
};

const fistSafety: GestureRegressionCase = {
  name: "握拳防误触",
  trace: trace([
    ...gestureFrames("tracking", 0, 3),
    ...gestureFrames("fist", 48, 10),
  ]),
  expectations: [],
};

const imageOverlap = makeGestureHand("left");
imageOverlap[4] = { ...imageOverlap[4]!, z: -0.15 };
imageOverlap[8] = {
  ...imageOverlap[4]!,
  z: 0.15,
};
const worldDepthSeparated = imageOverlap.map((point) => ({ ...point }));

const depthSeparationSafety: GestureRegressionCase = {
  name: "纵深分离防误触",
  trace: trace([
    ...gestureFrames("tracking", 0, 3),
    ...Array.from({ length: 10 }, (_, index) => rawFrame(
      48 + index * FRAME_INTERVAL_MS,
      imageOverlap,
      worldDepthSeparated,
    )),
    ...gestureFrames("tracking", 208, 3),
  ]),
  expectations: [],
};

const movementSafety: GestureRegressionCase = {
  name: "移动防误触",
  trace: trace(Array.from({ length: 16 }, (_, index) => {
    const progress = index / 15;
    const hand = makeGestureHand("tracking", {
      cursor: {
        x: 0.2 + progress * 0.6,
        y: 0.35 + Math.sin(progress * Math.PI * 2) * 0.15,
      },
    });
    return rawFrame(index * FRAME_INTERVAL_MS, hand);
  })),
  expectations: [],
};

export const GESTURE_REGRESSION_CASES: readonly GestureRegressionCase[] = [
  shortPinch,
  longPress,
  openPalmPause,
  fistSafety,
  depthSeparationSafety,
  movementSafety,
];
