import type { PinchBlockingReason } from "./pinchProbability";
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
  THUMB_TIP,
  WRIST,
  type Landmark,
} from "./types";

type MetricPoint = { x: number; y: number; z: number };

export type StablePinchThresholds = {
  enterRatio: number;
  exitRatio: number;
};

export type StableHandMetrics = {
  cursor: Landmark;
  palmScale: number;
  screenPinchGap: number;
  depthPinchGap: number | null;
  spatialPinchGap: number;
  screenPinchRatio: number;
  depthPinchRatio: number | null;
  spatialPinchRatio: number;
  pinchEnterRatio: number;
  pinchExitRatio: number;
  depthReliable: boolean;
  pinchContact: boolean;
  pinchSeparated: boolean;
  pinchBlockingReason: PinchBlockingReason;
  openPalmCandidate: boolean;
  openPalmScore: number;
};

const EPSILON = 1e-6;
const OPEN_PALM_STRAIGHTNESS = 0.82;
const OPEN_PALM_REACH = 1.45;
const OPEN_PALM_TIP_ADVANCE = 0.28;

export function stablePinchThresholds(sensitivity: number): StablePinchThresholds {
  const normalized = clamp01(Number.isFinite(sensitivity) ? sensitivity : 0.5);
  const enterRatio = 0.27 + normalized * 0.12;
  return {
    enterRatio,
    exitRatio: Math.min(0.58, enterRatio + 0.17),
  };
}

export function measureStableHand(
  landmarks: Landmark[] | null,
  imageAspectRatio = 1,
  sensitivity = 0.5,
): StableHandMetrics | null {
  if (!isValidHand(landmarks)) return null;

  const aspectRatio = sanitizeAspectRatio(imageAspectRatio);
  const points = landmarks.map((point) => toMetricPoint(point, aspectRatio));
  const palmWidth = distance3(points[INDEX_FINGER_MCP]!, points[PINKY_MCP]!);
  const palmLength = distance3(points[WRIST]!, points[MIDDLE_FINGER_MCP]!);
  const palmScale = (palmWidth + palmLength) / 2;
  if (!Number.isFinite(palmScale) || palmScale <= EPSILON) return null;

  const thumb = points[THUMB_TIP]!;
  const index = points[INDEX_FINGER_TIP]!;
  const sourceThumb = landmarks[THUMB_TIP]!;
  const sourceIndex = landmarks[INDEX_FINGER_TIP]!;
  const depthReliable = Number.isFinite(sourceThumb.z) && Number.isFinite(sourceIndex.z);
  const screenPinchGap = distance2(thumb, index);
  const depthPinchGap = depthReliable ? Math.abs(thumb.z - index.z) : null;
  const spatialPinchGap = depthPinchGap === null
    ? screenPinchGap
    : Math.hypot(screenPinchGap, depthPinchGap);
  const screenPinchRatio = screenPinchGap / palmScale;
  const depthPinchRatio = depthPinchGap === null ? null : depthPinchGap / palmScale;
  const spatialPinchRatio = spatialPinchGap / palmScale;
  const thresholds = stablePinchThresholds(sensitivity);
  const pinchContact = depthReliable && spatialPinchRatio <= thresholds.enterRatio;
  const pinchSeparated = !depthReliable || spatialPinchRatio >= thresholds.exitRatio;
  const pinchBlockingReason: PinchBlockingReason = pinchContact
    ? "none"
    : !depthReliable || (
      screenPinchRatio <= thresholds.enterRatio
      && (depthPinchRatio ?? Number.POSITIVE_INFINITY) > thresholds.enterRatio
    ) ? "depth" : "image";
  const openPalm = measureOpenPalm(points, palmScale);

  return {
    cursor: { ...landmarks[INDEX_FINGER_TIP]! },
    palmScale,
    screenPinchGap,
    depthPinchGap,
    spatialPinchGap,
    screenPinchRatio,
    depthPinchRatio,
    spatialPinchRatio,
    pinchEnterRatio: thresholds.enterRatio,
    pinchExitRatio: thresholds.exitRatio,
    depthReliable,
    pinchContact,
    pinchSeparated,
    pinchBlockingReason,
    openPalmCandidate: openPalm.candidate,
    openPalmScore: openPalm.score,
  };
}

function measureOpenPalm(
  points: MetricPoint[],
  palmScale: number,
): { candidate: boolean; score: number } {
  const fingers = [
    [INDEX_FINGER_MCP, INDEX_FINGER_PIP, INDEX_FINGER_DIP, INDEX_FINGER_TIP],
    [MIDDLE_FINGER_MCP, MIDDLE_FINGER_PIP, MIDDLE_FINGER_DIP, MIDDLE_FINGER_TIP],
    [RING_FINGER_MCP, RING_FINGER_PIP, RING_FINGER_DIP, RING_FINGER_TIP],
    [PINKY_MCP, PINKY_PIP, PINKY_DIP, PINKY_TIP],
  ] as const;
  const scores = fingers.map(([mcp, pip, dip, tip]) => {
    const pathLength = distance3(points[mcp]!, points[pip]!)
      + distance3(points[pip]!, points[dip]!)
      + distance3(points[dip]!, points[tip]!);
    if (pathLength <= EPSILON) return 0;
    const straightness = distance3(points[mcp]!, points[tip]!) / pathLength;
    const tipReach = distance3(points[WRIST]!, points[tip]!) / palmScale;
    const tipAdvance = (
      distance3(points[WRIST]!, points[tip]!)
      - distance3(points[WRIST]!, points[pip]!)
    ) / palmScale;
    return Math.min(
      ramp(straightness, OPEN_PALM_STRAIGHTNESS - 0.12, OPEN_PALM_STRAIGHTNESS),
      ramp(tipReach, OPEN_PALM_REACH - 0.35, OPEN_PALM_REACH),
      ramp(tipAdvance, OPEN_PALM_TIP_ADVANCE - 0.18, OPEN_PALM_TIP_ADVANCE),
    );
  });
  const score = Math.min(...scores);
  return { candidate: score >= 1, score };
}

function isValidHand(landmarks: Landmark[] | null): landmarks is Landmark[] {
  return landmarks?.length === 21 && landmarks.every(({ x, y, z }) => (
    Number.isFinite(x)
    && Number.isFinite(y)
    && (z === undefined || Number.isFinite(z))
  ));
}

function sanitizeAspectRatio(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.min(3, Math.max(0.5, value)) : 1;
}

function toMetricPoint(point: Landmark, aspectRatio: number): MetricPoint {
  return {
    x: point.x * aspectRatio,
    y: point.y,
    z: (point.z ?? 0) * aspectRatio,
  };
}

function distance2(first: MetricPoint, second: MetricPoint): number {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

function distance3(first: MetricPoint, second: MetricPoint): number {
  return Math.hypot(first.x - second.x, first.y - second.y, first.z - second.z);
}

function ramp(value: number, low: number, high: number): number {
  return clamp01((value - low) / Math.max(EPSILON, high - low));
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
