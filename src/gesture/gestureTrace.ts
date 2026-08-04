import type { Landmark } from "./types";

export type TraceGestureKind = "left" | "right" | "double" | "scroll" | "open-palm";
export type TraceGesturePhase =
  | "neutral"
  | "candidate"
  | "active"
  | "dragging"
  | "releasing"
  | "cooldown"
  | "lost";
export type TraceGestureEvent =
  | "click"
  | "rightClick"
  | "doubleClick"
  | "scroll"
  | "dragStart"
  | "dragEnd";

export type GestureTraceFeatures = {
  leftPinchRatio: number;
  worldLeftPinchRatio: number | null;
  pinchDepthReliable: boolean;
  rightPinchRatio: number;
  doublePinchRatio: number;
  openPalmScore: number;
  scrollPoseScore: number;
  palmScale: number;
};

export type GestureTraceFrame = {
  t: number;
  landmarks: Landmark[] | null;
  worldLandmarks: Landmark[] | null;
  quality: number;
  features: GestureTraceFeatures | null;
  phase: TraceGesturePhase;
  candidate: TraceGestureKind | null;
  confirmationProgress: number;
  lockedGesture: TraceGestureKind | null;
  events: TraceGestureEvent[];
};

export type GestureTraceV2 = {
  version: 2;
  frames: GestureTraceFrame[];
};

export type LegacyGestureTraceFrame = Omit<GestureTraceFrame, "worldLandmarks" | "features"> & {
  features: Omit<GestureTraceFeatures, "worldLeftPinchRatio" | "pinchDepthReliable"> | null;
};

export type LegacyGestureTrace = {
  version: 1;
  frames: LegacyGestureTraceFrame[];
};

export type GestureTrace = GestureTraceV2 | LegacyGestureTrace;

const MAX_TRACE_BYTES = 2 * 1024 * 1024;
const MAX_TRACE_FRAMES = 600;
const LEGACY_FRAME_KEYS = [
  "t",
  "landmarks",
  "quality",
  "features",
  "phase",
  "candidate",
  "confirmationProgress",
  "lockedGesture",
  "events",
] as const;
const FRAME_KEYS = [
  "t",
  "landmarks",
  "worldLandmarks",
  "quality",
  "features",
  "phase",
  "candidate",
  "confirmationProgress",
  "lockedGesture",
  "events",
] as const;
const LEGACY_FEATURE_KEYS = [
  "leftPinchRatio",
  "rightPinchRatio",
  "doublePinchRatio",
  "openPalmScore",
  "scrollPoseScore",
  "palmScale",
] as const;
const FEATURE_KEYS = [
  "leftPinchRatio",
  "worldLeftPinchRatio",
  "pinchDepthReliable",
  "rightPinchRatio",
  "doublePinchRatio",
  "openPalmScore",
  "scrollPoseScore",
  "palmScale",
] as const;
const PHASES = new Set<TraceGesturePhase>([
  "neutral", "candidate", "active", "dragging", "releasing", "cooldown", "lost",
]);
const KINDS = new Set<TraceGestureKind>(["left", "right", "double", "scroll", "open-palm"]);
const EVENTS = new Set<TraceGestureEvent>([
  "click", "rightClick", "doubleClick", "scroll", "dragStart", "dragEnd",
]);

export class GestureTraceBuffer {
  private readonly frames: GestureTraceFrame[] = [];

  constructor(
    private readonly durationMs = 10_000,
    private readonly maxFrames = MAX_TRACE_FRAMES,
  ) {
    if (!Number.isFinite(durationMs) || durationMs <= 0 || !Number.isInteger(maxFrames) || maxFrames <= 0) {
      throw new TypeError("Gesture trace limits must be positive and finite");
    }
  }

  push(frame: GestureTraceFrame): void {
    const copy = validateAndCopyFrame(frame, 2);
    const newest = this.frames.at(-1);
    if (newest && copy.t < newest.t) {
      throw new TypeError("Gesture trace timestamps must be monotonic");
    }
    this.frames.push(copy);
    const oldestAllowed = copy.t - this.durationMs;
    while (
      this.frames.length > 0
      && (this.frames[0].t < oldestAllowed || this.frames.length > this.maxFrames)
    ) {
      this.frames.shift();
    }
  }

  snapshot(): GestureTraceV2 {
    return {
      version: 2,
      frames: this.frames.map((frame) => validateAndCopyFrame(frame, 2)),
    };
  }

  serialize(): string {
    return JSON.stringify(this.snapshot());
  }
}

export function parseGestureTrace(json: string): GestureTraceV2 {
  if (typeof json !== "string" || new TextEncoder().encode(json).byteLength > MAX_TRACE_BYTES) {
    throw new TypeError("Gesture trace must not exceed 2 MiB");
  }

  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    throw new TypeError("Gesture trace must be valid JSON");
  }
  if (!isRecord(value)) {
    throw new TypeError("Gesture trace must be an object");
  }
  assertOnlyKeys(value, ["version", "frames"]);
  if ((value.version !== 1 && value.version !== 2) || !Array.isArray(value.frames)) {
    throw new TypeError("Gesture trace requires version 1 or 2 and frames");
  }
  if (value.frames.length > MAX_TRACE_FRAMES) {
    throw new TypeError("Gesture trace must contain at most 600 frames");
  }

  const version = value.version;
  const frames = value.frames.map((frame) => validateAndCopyFrame(frame, version));
  for (let index = 1; index < frames.length; index += 1) {
    if (frames[index].t < frames[index - 1].t) {
      throw new TypeError("Gesture trace timestamps must be monotonic");
    }
  }
  return { version: 2, frames };
}

function validateAndCopyFrame(value: unknown, version: 1 | 2): GestureTraceFrame {
  if (!isRecord(value)) {
    throw new TypeError("Gesture trace frame must be an object");
  }
  assertOnlyKeys(value, version === 1 ? LEGACY_FRAME_KEYS : FRAME_KEYS);
  assertFinite(value.t);
  assertUnitInterval(value.quality);
  assertUnitInterval(value.confirmationProgress);
  if (typeof value.phase !== "string" || !PHASES.has(value.phase as TraceGesturePhase)) {
    throw new TypeError("Gesture trace phase is invalid");
  }
  const candidate = validateKind(value.candidate);
  const lockedGesture = validateKind(value.lockedGesture);
  if (!Array.isArray(value.events) || value.events.some(
    (event) => typeof event !== "string" || !EVENTS.has(event as TraceGestureEvent),
  )) {
    throw new TypeError("Gesture trace events are invalid");
  }

  return {
    t: value.t as number,
    landmarks: validateLandmarks(value.landmarks),
    worldLandmarks: version === 1 ? null : validateLandmarks(value.worldLandmarks),
    quality: value.quality as number,
    features: validateFeatures(value.features, version),
    phase: value.phase as TraceGesturePhase,
    candidate,
    confirmationProgress: value.confirmationProgress as number,
    lockedGesture,
    events: [...value.events] as TraceGestureEvent[],
  };
}

function validateLandmarks(value: unknown): Landmark[] | null {
  if (value === null) {
    return null;
  }
  if (!Array.isArray(value) || value.length !== 21) {
    throw new TypeError("Gesture trace landmarks must contain 21 points");
  }
  return value.map((point) => {
    if (!isRecord(point)) {
      throw new TypeError("Gesture trace landmark must be an object");
    }
    assertOnlyAllowedKeys(point, ["x", "y", "z"]);
    assertFinite(point.x);
    assertFinite(point.y);
    if (point.z !== undefined) {
      assertFinite(point.z);
    }
    return { x: point.x as number, y: point.y as number, ...(point.z === undefined ? {} : { z: point.z as number }) };
  });
}

function validateFeatures(value: unknown, version: 1 | 2): GestureTraceFeatures | null {
  if (value === null) {
    return null;
  }
  if (!isRecord(value)) {
    throw new TypeError("Gesture trace features must be an object");
  }
  const numericKeys = version === 1
    ? LEGACY_FEATURE_KEYS
    : FEATURE_KEYS.filter((key) => key !== "worldLeftPinchRatio" && key !== "pinchDepthReliable");
  assertOnlyKeys(value, version === 1 ? LEGACY_FEATURE_KEYS : FEATURE_KEYS);
  for (const key of numericKeys) {
    assertFinite(value[key]);
  }
  if (version === 2) {
    if (value.worldLeftPinchRatio !== null) assertFinite(value.worldLeftPinchRatio);
    if (typeof value.pinchDepthReliable !== "boolean") {
      throw new TypeError("Gesture trace pinch depth reliability must be boolean");
    }
  }
  return {
    leftPinchRatio: value.leftPinchRatio as number,
    worldLeftPinchRatio: version === 1 ? null : value.worldLeftPinchRatio as number | null,
    pinchDepthReliable: version === 1 ? false : value.pinchDepthReliable as boolean,
    rightPinchRatio: value.rightPinchRatio as number,
    doublePinchRatio: value.doublePinchRatio as number,
    openPalmScore: value.openPalmScore as number,
    scrollPoseScore: value.scrollPoseScore as number,
    palmScale: value.palmScale as number,
  };
}

function validateKind(value: unknown): TraceGestureKind | null {
  if (value === null) {
    return null;
  }
  if (typeof value !== "string" || !KINDS.has(value as TraceGestureKind)) {
    throw new TypeError("Gesture trace gesture kind is invalid");
  }
  return value as TraceGestureKind;
}

function assertFinite(value: unknown): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError("Gesture trace numeric values must be finite");
  }
}

function assertUnitInterval(value: unknown): asserts value is number {
  assertFinite(value);
  if (value < 0 || value > 1) {
    throw new TypeError("Gesture trace progress and quality must be between 0 and 1");
  }
}

function assertOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): void {
  const allowedSet = new Set(allowed);
  const unknown = Object.keys(value).find((key) => !allowedSet.has(key));
  if (unknown) {
    throw new TypeError(`Gesture trace contains unknown field: ${unknown}`);
  }
  const missing = allowed.find((key) => !(key in value));
  if (missing) {
    throw new TypeError(`Gesture trace is missing field: ${missing}`);
  }
}

function assertOnlyAllowedKeys(value: Record<string, unknown>, allowed: readonly string[]): void {
  const allowedSet = new Set(allowed);
  const unknown = Object.keys(value).find((key) => !allowedSet.has(key));
  if (unknown) {
    throw new TypeError(`Gesture trace contains unknown field: ${unknown}`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
