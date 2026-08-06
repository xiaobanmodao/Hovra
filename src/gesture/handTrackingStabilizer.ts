import { AdaptiveLandmarkFilter } from "./adaptiveLandmarkFilter";
import { HAND_OVERLAY_CONNECTIONS } from "./handOverlayModel";
import type { Landmark } from "./types";

export type TrackingSource = "observed" | "predicted" | "lost";

export type StabilizedHandFrame = {
  controlLandmarks: Landmark[] | null;
  source: TrackingSource;
  gestureSafe: boolean;
  quality: number;
  rejectedIndices: number[];
};

const PALM_ANCHORS = [0, 5, 9, 13, 17] as const;
const FAST_INDICES = new Set([1, 2, 3, 4, 5, 6, 7, 8]);
const MAX_PREDICTION_MS = 80;
const RESET_GAP_MS = 250;
const SOFT_RESIDUAL_RATIO = 0.42;
const HARD_RESIDUAL = 0.8;
const MIN_BONE_RATIO = 0.45;
const MAX_BONE_RATIO = 2.2;
const MAX_PALM_SCALE_JUMP = 0.55;
const MAX_PREDICTION_SCALE = 0.35;
const EPSILON = 1e-6;

const INCIDENT_CONNECTIONS = Array.from({ length: 21 }, (_, index) => (
  HAND_OVERLAY_CONNECTIONS.filter(([from, to]) => from === index || to === index)
));

const LOST_FRAME: StabilizedHandFrame = {
  controlLandmarks: null,
  source: "lost",
  gestureSafe: false,
  quality: 0,
  rejectedIndices: [],
};

export class HandTrackingStabilizer {
  private readonly fastFilter = new AdaptiveLandmarkFilter({
    minCutoff: 1.35,
    beta: 20,
    resetGapMs: RESET_GAP_MS,
  });
  private readonly stableFilter = new AdaptiveLandmarkFilter({
    minCutoff: 1,
    beta: 16,
    resetGapMs: RESET_GAP_MS,
  });
  private previousObserved: Landmark[] | null = null;
  private previousControl: Landmark[] | null = null;
  private velocity: Landmark[] | null = null;
  private palmScale: number | null = null;
  private lastObservedTimestampMs: number | null = null;
  private lastTimestampMs: number | null = null;

  update(landmarks: Landmark[] | null, nowMs: number): StabilizedHandFrame {
    if (!Number.isFinite(nowMs) || (this.lastTimestampMs !== null && nowMs <= this.lastTimestampMs)) {
      this.reset();
      return copyFrame(LOST_FRAME);
    }

    if (this.lastTimestampMs !== null && nowMs - this.lastTimestampMs > RESET_GAP_MS) {
      this.reset();
    }
    this.lastTimestampMs = nowMs;

    if (!isValidHand(landmarks)) {
      return this.predictOrLose(nowMs);
    }

    if (this.previousObserved === null || this.lastObservedTimestampMs === null) {
      return this.initialize(landmarks, nowMs);
    }

    return this.observe(landmarks, nowMs);
  }

  reset(): void {
    this.fastFilter.reset();
    this.stableFilter.reset();
    this.previousObserved = null;
    this.previousControl = null;
    this.velocity = null;
    this.palmScale = null;
    this.lastObservedTimestampMs = null;
    this.lastTimestampMs = null;
  }

  private initialize(landmarks: Landmark[], nowMs: number): StabilizedHandFrame {
    const palmScale = measurePalmScale(landmarks);
    if (!allPointsWithinBounds(landmarks) || palmScale <= EPSILON) {
      this.reset();
      return copyFrame(LOST_FRAME);
    }

    const fast = this.fastFilter.update(landmarks, nowMs)!;
    const stable = this.stableFilter.update(landmarks, nowMs)!;
    const controlLandmarks = combineFilteredLandmarks(fast, stable);
    this.previousObserved = copyLandmarks(landmarks);
    this.previousControl = copyLandmarks(controlLandmarks);
    this.velocity = zeroVelocityFor(controlLandmarks);
    this.palmScale = palmScale;
    this.lastObservedTimestampMs = nowMs;
    this.lastTimestampMs = nowMs;

    return {
      controlLandmarks,
      source: "observed",
      gestureSafe: true,
      quality: 1,
      rejectedIndices: [],
    };
  }

  private observe(landmarks: Landmark[], nowMs: number): StabilizedHandFrame {
    const previousObserved = this.previousObserved!;
    const previousControl = this.previousControl!;
    const previousPalmScale = Math.max(EPSILON, this.palmScale ?? measurePalmScale(previousObserved));
    const elapsedMs = nowMs - this.lastObservedTimestampMs!;
    const palmDelta = medianPalmDelta(previousObserved, landmarks);
    const expected = previousObserved.map((point, index) => translatePoint(
      point,
      palmDelta,
      landmarks[index]!.z !== undefined,
    ));
    const rawPalmScale = measurePalmScale(landmarks);
    const palmScaleJump = !Number.isFinite(rawPalmScale)
      || Math.abs(rawPalmScale - previousPalmScale) / previousPalmScale > MAX_PALM_SCALE_JUMP;
    const rejected = new Set<number>();

    landmarks.forEach((point, index) => {
      const residual = distance3(point, expected[index]!);
      const residualRatio = residual / previousPalmScale;
      const boneRatioInvalid = INCIDENT_CONNECTIONS[index]!.some(([from, to]) => {
        const previousLength = distance3(previousObserved[from]!, previousObserved[to]!);
        const currentLength = distance3(landmarks[from]!, landmarks[to]!);
        if (previousLength <= EPSILON) return currentLength > EPSILON;
        const ratio = currentLength / previousLength;
        return ratio < MIN_BONE_RATIO || ratio > MAX_BONE_RATIO;
      });

      if (
        !pointWithinBounds(point)
        || residual > HARD_RESIDUAL
        || (residualRatio > SOFT_RESIDUAL_RATIO && boneRatioInvalid)
      ) {
        rejected.add(index);
      }
    });

    const sanitized = landmarks.map((point, index) => (
      rejected.has(index) ? copyPoint(expected[index]!) : copyPoint(point)
    ));
    const fast = this.fastFilter.update(sanitized, nowMs)!;
    const stable = this.stableFilter.update(sanitized, nowMs)!;
    const controlLandmarks = combineFilteredLandmarks(fast, stable);
    this.velocity = controlLandmarks.map((point, index) => pointVelocity(
      previousControl[index]!,
      point,
      elapsedMs,
    ));
    this.previousObserved = copyLandmarks(sanitized);
    this.previousControl = copyLandmarks(controlLandmarks);
    this.palmScale = Math.max(EPSILON, measurePalmScale(sanitized));
    this.lastObservedTimestampMs = nowMs;

    const rejectedIndices = [...rejected].sort((first, second) => first - second);
    const rejectionQuality = Math.max(0.2, 1 - rejectedIndices.length * 0.12);
    return {
      controlLandmarks,
      source: "observed",
      gestureSafe: rejectedIndices.length === 0 && !palmScaleJump,
      quality: palmScaleJump ? Math.min(0.55, rejectionQuality) : rejectionQuality,
      rejectedIndices,
    };
  }

  private predictOrLose(nowMs: number): StabilizedHandFrame {
    if (
      this.lastObservedTimestampMs === null
      || this.previousControl === null
      || this.velocity === null
      || this.palmScale === null
    ) {
      return copyFrame(LOST_FRAME);
    }

    const elapsedMs = nowMs - this.lastObservedTimestampMs;
    if (elapsedMs > RESET_GAP_MS) {
      this.reset();
      return copyFrame(LOST_FRAME);
    }
    if (elapsedMs > MAX_PREDICTION_MS) {
      return copyFrame(LOST_FRAME);
    }

    const maxOffset = this.palmScale * MAX_PREDICTION_SCALE;
    const controlLandmarks = this.previousControl.map((point, index) => predictPoint(
      point,
      this.velocity![index]!,
      elapsedMs,
      maxOffset,
    ));
    return {
      controlLandmarks,
      source: "predicted",
      gestureSafe: false,
      quality: 0.15,
      rejectedIndices: [],
    };
  }
}

function medianPalmDelta(previous: Landmark[], current: Landmark[]): Required<Landmark> {
  return {
    x: median(PALM_ANCHORS.map((index) => current[index]!.x - previous[index]!.x)),
    y: median(PALM_ANCHORS.map((index) => current[index]!.y - previous[index]!.y)),
    z: median(PALM_ANCHORS.map((index) => (current[index]!.z ?? 0) - (previous[index]!.z ?? 0))),
  };
}

function median(values: number[]): number {
  const sorted = [...values].sort((first, second) => first - second);
  return sorted[Math.floor(sorted.length / 2)]!;
}

function combineFilteredLandmarks(fast: Landmark[], stable: Landmark[]): Landmark[] {
  return stable.map((point, index) => copyPoint(FAST_INDICES.has(index) ? fast[index]! : point));
}

function pointVelocity(previous: Landmark, current: Landmark, elapsedMs: number): Landmark {
  const safeElapsed = Math.max(EPSILON, elapsedMs);
  const x = (current.x - previous.x) / safeElapsed;
  const y = (current.y - previous.y) / safeElapsed;
  if (current.z === undefined || previous.z === undefined) return { x, y };
  return { x, y, z: (current.z - previous.z) / safeElapsed };
}

function predictPoint(
  point: Landmark,
  velocity: Landmark,
  elapsedMs: number,
  maxOffset: number,
): Landmark {
  const rawX = velocity.x * elapsedMs;
  const rawY = velocity.y * elapsedMs;
  const rawZ = point.z === undefined || velocity.z === undefined ? undefined : velocity.z * elapsedMs;
  const length = Math.hypot(rawX, rawY, rawZ ?? 0);
  const scale = length > maxOffset && length > EPSILON ? maxOffset / length : 1;
  return point.z === undefined || rawZ === undefined
    ? { x: point.x + rawX * scale, y: point.y + rawY * scale }
    : { x: point.x + rawX * scale, y: point.y + rawY * scale, z: point.z + rawZ * scale };
}

function translatePoint(point: Landmark, delta: Required<Landmark>, includeZ: boolean): Landmark {
  const translated = { x: point.x + delta.x, y: point.y + delta.y };
  if (!includeZ) return translated;
  return { ...translated, z: (point.z ?? 0) + delta.z };
}

function measurePalmScale(landmarks: Landmark[]): number {
  return distance2(landmarks[5]!, landmarks[17]!);
}

function distance2(first: Landmark, second: Landmark): number {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

function distance3(first: Landmark, second: Landmark): number {
  return Math.hypot(
    first.x - second.x,
    first.y - second.y,
    (first.z ?? 0) - (second.z ?? 0),
  );
}

function pointWithinBounds(point: Landmark): boolean {
  return point.x >= -0.25
    && point.x <= 1.25
    && point.y >= -0.25
    && point.y <= 1.25
    && (point.z === undefined || (point.z >= -1.5 && point.z <= 1.5));
}

function allPointsWithinBounds(landmarks: Landmark[]): boolean {
  return landmarks.every(pointWithinBounds);
}

function isValidHand(landmarks: Landmark[] | null): landmarks is Landmark[] {
  return landmarks?.length === 21 && landmarks.every((point) => (
    Number.isFinite(point.x)
    && Number.isFinite(point.y)
    && (point.z === undefined || Number.isFinite(point.z))
  ));
}

function zeroVelocityFor(landmarks: Landmark[]): Landmark[] {
  return landmarks.map((point) => point.z === undefined ? { x: 0, y: 0 } : { x: 0, y: 0, z: 0 });
}

function copyLandmarks(landmarks: Landmark[]): Landmark[] {
  return landmarks.map(copyPoint);
}

function copyPoint(point: Landmark): Landmark {
  return point.z === undefined
    ? { x: point.x, y: point.y }
    : { x: point.x, y: point.y, z: point.z };
}

function copyFrame(frame: StabilizedHandFrame): StabilizedHandFrame {
  return {
    ...frame,
    controlLandmarks: frame.controlLandmarks ? copyLandmarks(frame.controlLandmarks) : null,
    rejectedIndices: [...frame.rejectedIndices],
  };
}
