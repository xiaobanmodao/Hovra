import type { HandGeometry } from "./handGeometry";
import {
  INDEX_FINGER_DIP,
  INDEX_FINGER_MCP,
  INDEX_FINGER_PIP,
  INDEX_FINGER_TIP,
  MIDDLE_FINGER_DIP,
  MIDDLE_FINGER_MCP,
  MIDDLE_FINGER_PIP,
  MIDDLE_FINGER_TIP,
  PINKY_DIP,
  PINKY_MCP,
  PINKY_PIP,
  PINKY_TIP,
  RING_FINGER_DIP,
  RING_FINGER_MCP,
  RING_FINGER_PIP,
  RING_FINGER_TIP,
  WRIST,
  type Landmark,
} from "./types";
import { landmarkDistance } from "./landmarkMetrics";

const OPEN_PALM_FULL_REACH = 1.8;

export type FingerExtension = {
  index: number;
  middle: number;
  ring: number;
  pinky: number;
};

export type GestureFeatures = {
  leftPinchRatio: number;
  rightPinchRatio: number;
  doublePinchRatio: number;
  fingerExtension: FingerExtension;
  openPalmScore: number;
  scrollPoseScore: number;
  palmScale: number;
};

export function extractGestureFeatures(geometry: HandGeometry): GestureFeatures {
  const points = geometry.landmarks;
  const fingerExtension: FingerExtension = {
    index: extension(points, INDEX_FINGER_MCP, INDEX_FINGER_PIP, INDEX_FINGER_DIP, INDEX_FINGER_TIP),
    middle: extension(points, MIDDLE_FINGER_MCP, MIDDLE_FINGER_PIP, MIDDLE_FINGER_DIP, MIDDLE_FINGER_TIP),
    ring: extension(points, RING_FINGER_MCP, RING_FINGER_PIP, RING_FINGER_DIP, RING_FINGER_TIP),
    pinky: extension(points, PINKY_MCP, PINKY_PIP, PINKY_DIP, PINKY_TIP),
  };
  const fingertipReach = [
    INDEX_FINGER_TIP,
    MIDDLE_FINGER_TIP,
    RING_FINGER_TIP,
    PINKY_TIP,
  ].map((tip) => clamp01(
    landmarkDistance(points[WRIST], points[tip]) / geometry.scale / OPEN_PALM_FULL_REACH,
  ));
  const openPalmScore = Math.min(
    ...Object.values(fingerExtension),
    ...fingertipReach,
  );
  const scrollPoseScore = average([
    fingerExtension.index,
    fingerExtension.middle,
    1 - fingerExtension.ring,
    1 - fingerExtension.pinky,
  ]);

  return {
    leftPinchRatio: geometry.pinchRatios.left,
    rightPinchRatio: geometry.pinchRatios.right,
    doublePinchRatio: geometry.pinchRatios.double,
    fingerExtension,
    openPalmScore,
    scrollPoseScore,
    palmScale: geometry.scale,
  };
}

function extension(
  points: Landmark[],
  mcp: number,
  pip: number,
  dip: number,
  tip: number,
): number {
  const pathLength = landmarkDistance(points[mcp], points[pip])
    + landmarkDistance(points[pip], points[dip])
    + landmarkDistance(points[dip], points[tip]);
  if (pathLength <= 1e-9) {
    return 0;
  }
  return clamp01(landmarkDistance(points[mcp], points[tip]) / pathLength);
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
