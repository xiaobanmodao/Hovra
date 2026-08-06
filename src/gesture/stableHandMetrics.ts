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
  type GestureSettings,
} from "./types";

type MetricPoint = { x: number; y: number; z: number };

export type StablePinchThresholds = {
  enterRatio: number;
  exitRatio: number;
};

export type StableHandMetrics = {
  cursor: Landmark;
  motionCursor: Landmark;
  scrollAnchor: Landmark;
  palmScale: number;
  screenPinchGap: number;
  depthPinchGap: number | null;
  spatialPinchGap: number;
  screenPinchRatio: number;
  depthPinchRatio: number | null;
  spatialPinchRatio: number;
  rightScreenPinchRatio: number;
  rightDepthPinchRatio: number | null;
  rightSpatialPinchRatio: number;
  pinchEnterRatio: number;
  pinchExitRatio: number;
  depthReliable: boolean;
  rightDepthReliable: boolean;
  pinchContact: boolean;
  pinchSeparated: boolean;
  pinchBlockingReason: PinchBlockingReason;
  rightPinchContact: boolean;
  rightPinchSeparated: boolean;
  rightPinchBlockingReason: PinchBlockingReason;
  scrollPoseScore: number;
  scrollPoseContact: boolean;
  scrollPoseRetained: boolean;
  openPalmCandidate: boolean;
  openPalmScore: number;
  fistCandidate: boolean;
};

const EPSILON = 1e-6;
const OPEN_PALM_STRAIGHTNESS = 0.82;
const OPEN_PALM_REACH = 1.45;
const OPEN_PALM_TIP_ADVANCE = 0.28;
const SCROLL_POSE_ENTER_SCORE = 0.8;
const SCROLL_POSE_EXIT_SCORE = 0.55;

export function stablePinchThresholds(sensitivity: number): StablePinchThresholds {
  const normalized = clamp01(Number.isFinite(sensitivity) ? sensitivity : 0.5);
  const enterRatio = 0.27 + normalized * 0.12;
  return {
    enterRatio,
    exitRatio: Math.min(0.58, enterRatio + 0.17),
  };
}

export function resolveStablePinchThresholds(settings: GestureSettings): StablePinchThresholds {
  const fallback = stablePinchThresholds(settings.gestureSensitivity);
  const enter = settings.pinchEnterRatio;
  const exit = settings.pinchExitRatio;
  if (
    enter === undefined || exit === undefined
    || !Number.isFinite(enter) || !Number.isFinite(exit)
    || enter < 0.2 || enter > 0.5
    || exit < 0.32 || exit > 0.65
    || exit - enter < 0.08
  ) return fallback;
  return { enterRatio: enter, exitRatio: exit };
}

export function measureStableHand(
  landmarks: Landmark[] | null,
  imageAspectRatio = 1,
  sensitivity = 0.5,
  thresholdOverride?: StablePinchThresholds,
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
  const middle = points[MIDDLE_FINGER_TIP]!;
  const ring = points[RING_FINGER_TIP]!;
  const sourceThumb = landmarks[THUMB_TIP]!;
  const sourceIndex = landmarks[INDEX_FINGER_TIP]!;
  const sourceMiddle = landmarks[MIDDLE_FINGER_TIP]!;
  const sourceRing = landmarks[RING_FINGER_TIP]!;
  const depthReliable = Number.isFinite(sourceThumb.z) && Number.isFinite(sourceIndex.z);
  const rightDepthReliable = Number.isFinite(sourceThumb.z) && Number.isFinite(sourceMiddle.z);
  const ringDepthReliable = Number.isFinite(sourceThumb.z) && Number.isFinite(sourceRing.z);
  const screenPinchGap = distance2(thumb, index);
  const depthPinchGap = depthReliable ? Math.abs(thumb.z - index.z) : null;
  const spatialPinchGap = depthPinchGap === null
    ? screenPinchGap
    : Math.hypot(screenPinchGap, depthPinchGap);
  const screenPinchRatio = screenPinchGap / palmScale;
  const depthPinchRatio = depthPinchGap === null ? null : depthPinchGap / palmScale;
  const spatialPinchRatio = spatialPinchGap / palmScale;
  const rightScreenPinchGap = distance2(thumb, middle);
  const rightDepthPinchGap = rightDepthReliable ? Math.abs(thumb.z - middle.z) : null;
  const rightSpatialPinchGap = rightDepthPinchGap === null
    ? rightScreenPinchGap
    : Math.hypot(rightScreenPinchGap, rightDepthPinchGap);
  const rightScreenPinchRatio = rightScreenPinchGap / palmScale;
  const rightDepthPinchRatio = rightDepthPinchGap === null
    ? null
    : rightDepthPinchGap / palmScale;
  const rightSpatialPinchRatio = rightSpatialPinchGap / palmScale;
  const ringScreenPinchGap = distance2(thumb, ring);
  const ringDepthPinchGap = ringDepthReliable ? Math.abs(thumb.z - ring.z) : null;
  const ringSpatialPinchRatio = (
    ringDepthPinchGap === null
      ? ringScreenPinchGap
      : Math.hypot(ringScreenPinchGap, ringDepthPinchGap)
  ) / palmScale;
  const thresholds = thresholdOverride ?? stablePinchThresholds(sensitivity);
  const pinchContact = depthReliable && spatialPinchRatio <= thresholds.enterRatio;
  const pinchSeparated = !depthReliable || spatialPinchRatio >= thresholds.exitRatio;
  const pinchBlockingReason: PinchBlockingReason = pinchContact
    ? "none"
    : !depthReliable || (
      screenPinchRatio <= thresholds.enterRatio
      && (depthPinchRatio ?? Number.POSITIVE_INFINITY) > thresholds.enterRatio
    ) ? "depth" : "image";
  const rightPinchContact = rightDepthReliable
    && depthReliable
    && ringDepthReliable
    && rightSpatialPinchRatio <= thresholds.enterRatio
    && spatialPinchRatio >= thresholds.exitRatio
    && ringSpatialPinchRatio >= thresholds.exitRatio;
  const rightPinchSeparated = !rightDepthReliable
    || rightSpatialPinchRatio >= thresholds.exitRatio;
  const rightPinchBlockingReason: PinchBlockingReason = rightPinchContact
    ? "none"
    : !rightDepthReliable || (
      rightScreenPinchRatio <= thresholds.enterRatio
      && (rightDepthPinchRatio ?? Number.POSITIVE_INFINITY) > thresholds.enterRatio
    ) ? "depth" : "image";
  const fingerExtension = measureFingerExtension(points, palmScale);
  const openPalmScore = Math.min(...fingerExtension);
  const scrollPoseScore = Math.min(
    fingerExtension[0],
    fingerExtension[1],
    1 - fingerExtension[2],
    1 - fingerExtension[3],
  );
  const scrollSeparationSafe = depthReliable
    && rightDepthReliable
    && ringDepthReliable
    && spatialPinchRatio >= thresholds.exitRatio
    && rightSpatialPinchRatio >= thresholds.exitRatio
    && ringSpatialPinchRatio >= thresholds.exitRatio;
  const fistCandidate = measureFist(points, palmScale);
  const scrollAnchor = averageLandmarks([
    landmarks[WRIST]!,
    landmarks[INDEX_FINGER_MCP]!,
    landmarks[MIDDLE_FINGER_MCP]!,
    landmarks[RING_FINGER_MCP]!,
    landmarks[PINKY_MCP]!,
  ]);

  return {
    cursor: { ...landmarks[INDEX_FINGER_TIP]! },
    motionCursor: { ...landmarks[MIDDLE_FINGER_MCP]! },
    scrollAnchor,
    palmScale,
    screenPinchGap,
    depthPinchGap,
    spatialPinchGap,
    screenPinchRatio,
    depthPinchRatio,
    spatialPinchRatio,
    rightScreenPinchRatio,
    rightDepthPinchRatio,
    rightSpatialPinchRatio,
    pinchEnterRatio: thresholds.enterRatio,
    pinchExitRatio: thresholds.exitRatio,
    depthReliable,
    rightDepthReliable,
    pinchContact,
    pinchSeparated,
    pinchBlockingReason,
    rightPinchContact,
    rightPinchSeparated,
    rightPinchBlockingReason,
    scrollPoseScore,
    scrollPoseContact: scrollSeparationSafe && scrollPoseScore >= SCROLL_POSE_ENTER_SCORE,
    scrollPoseRetained: scrollSeparationSafe && scrollPoseScore >= SCROLL_POSE_EXIT_SCORE,
    openPalmCandidate: openPalmScore >= 1,
    openPalmScore,
    fistCandidate,
  };
}

function measureFist(points: MetricPoint[], palmScale: number): boolean {
  const tips = [INDEX_FINGER_TIP, MIDDLE_FINGER_TIP, RING_FINGER_TIP, PINKY_TIP];
  return tips.every((tip) => distance3(points[WRIST]!, points[tip]!) / palmScale < 0.55);
}

function measureFingerExtension(
  points: MetricPoint[],
  palmScale: number,
): number[] {
  const fingers = [
    [INDEX_FINGER_MCP, INDEX_FINGER_PIP, INDEX_FINGER_DIP, INDEX_FINGER_TIP],
    [MIDDLE_FINGER_MCP, MIDDLE_FINGER_PIP, MIDDLE_FINGER_DIP, MIDDLE_FINGER_TIP],
    [RING_FINGER_MCP, RING_FINGER_PIP, RING_FINGER_DIP, RING_FINGER_TIP],
    [PINKY_MCP, PINKY_PIP, PINKY_DIP, PINKY_TIP],
  ] as const;
  return fingers.map(([mcp, pip, dip, tip]) => {
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
}

function averageLandmarks(points: Landmark[]): Landmark {
  const total = points.reduce((sum, point) => ({
    x: sum.x + point.x,
    y: sum.y + point.y,
    z: sum.z + (point.z ?? 0),
  }), { x: 0, y: 0, z: 0 });
  return {
    x: total.x / points.length,
    y: total.y / points.length,
    z: total.z / points.length,
  };
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
