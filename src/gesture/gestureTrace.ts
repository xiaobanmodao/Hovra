import type { Landmark } from "./types";
import type { PinchBlockingReason } from "./pinchProbability";
import type { PinchQualityReason } from "./pinchQuality";

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
  screenPinchGap: number | null;
  imageAspectRatio: number;
  worldPalmScale: number | null;
  palmFacingScore: number | null;
  imageDepthGap: number | null;
  worldDepthGap: number | null;
  approachVelocity: number | null;
  contactPoseScore: number | null;
  worldQuality: number;
  qualityReasons: PinchQualityReason[];
  pinchProbability: number | null;
  safetyGatePassed: boolean;
  blockingReason: PinchBlockingReason | null;
  enterVotes: number;
  requiredVotes: number;
  frameIntervalMs: number | null;
  inferenceMs: number | null;
  effectiveFps: number | null;
  modelMode: "mediapipe" | "dual";
  visionPinchRatio: number | null;
  visionConfidence: number | null;
  visionAgeMs: number | null;
  visionInferenceMs: number | null;
  modelsAgree: boolean | null;
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

export type GestureTraceV5 = {
  version: 5;
  frames: GestureTraceFrame[];
};

type FusionFeatureKey =
  | "modelMode" | "visionPinchRatio" | "visionConfidence" | "visionAgeMs"
  | "visionInferenceMs" | "modelsAgree";

export type LegacyGestureTraceV4 = {
  version: 4;
  frames: Array<Omit<GestureTraceFrame, "features"> & {
    features: Omit<GestureTraceFeatures, FusionFeatureKey> | null;
  }>;
};

type ViewFeatureKey =
  | "screenPinchGap" | "imageAspectRatio" | "worldPalmScale" | "palmFacingScore";

type AdaptiveFeatureKey =
  | "imageDepthGap" | "worldDepthGap" | "approachVelocity" | "contactPoseScore"
  | "worldQuality" | "qualityReasons" | "pinchProbability" | "safetyGatePassed"
  | "blockingReason" | "enterVotes" | "requiredVotes" | "frameIntervalMs"
  | "inferenceMs" | "effectiveFps";

export type LegacyGestureTraceV2 = {
  version: 2;
  frames: Array<Omit<GestureTraceFrame, "features"> & {
    features: Omit<GestureTraceFeatures, AdaptiveFeatureKey | ViewFeatureKey | FusionFeatureKey> | null;
  }>;
};

export type LegacyGestureTraceV3 = {
  version: 3;
  frames: Array<Omit<GestureTraceFrame, "features"> & {
    features: Omit<GestureTraceFeatures, ViewFeatureKey | FusionFeatureKey> | null;
  }>;
};

type LegacyGestureTraceFeaturesV1 = Pick<GestureTraceFeatures,
  | "leftPinchRatio" | "rightPinchRatio" | "doublePinchRatio"
  | "openPalmScore" | "scrollPoseScore" | "palmScale"
>;

export type LegacyGestureTraceFrame = Omit<GestureTraceFrame, "worldLandmarks" | "features"> & {
  features: LegacyGestureTraceFeaturesV1 | null;
};

export type LegacyGestureTrace = {
  version: 1;
  frames: LegacyGestureTraceFrame[];
};

export type GestureTrace = GestureTraceV5 | LegacyGestureTraceV4 | LegacyGestureTraceV3 | LegacyGestureTraceV2 | LegacyGestureTrace;

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
const ADAPTIVE_FEATURE_KEYS = [
  "imageDepthGap", "worldDepthGap", "approachVelocity", "contactPoseScore",
  "worldQuality", "qualityReasons", "pinchProbability", "safetyGatePassed",
  "blockingReason", "enterVotes", "requiredVotes", "frameIntervalMs", "inferenceMs",
  "effectiveFps",
] as const;
const V3_FEATURE_KEYS = [...FEATURE_KEYS, ...ADAPTIVE_FEATURE_KEYS] as const;
const VIEW_FEATURE_KEYS = [
  "screenPinchGap", "imageAspectRatio", "worldPalmScale", "palmFacingScore",
] as const;
const V4_FEATURE_KEYS = [...V3_FEATURE_KEYS, ...VIEW_FEATURE_KEYS] as const;
const FUSION_FEATURE_KEYS = [
  "modelMode", "visionPinchRatio", "visionConfidence", "visionAgeMs",
  "visionInferenceMs", "modelsAgree",
] as const;
const V5_FEATURE_KEYS = [...V4_FEATURE_KEYS, ...FUSION_FEATURE_KEYS] as const;
const PHASES = new Set<TraceGesturePhase>([
  "neutral", "candidate", "active", "dragging", "releasing", "cooldown", "lost",
]);
const KINDS = new Set<TraceGestureKind>(["left", "right", "double", "scroll", "open-palm"]);
const EVENTS = new Set<TraceGestureEvent>([
  "click", "rightClick", "doubleClick", "scroll", "dragStart", "dragEnd",
]);
const QUALITY_REASONS = new Set<PinchQualityReason>([
  "world-missing", "stale-frame", "scale-jump", "bone-jitter", "ratio-jitter",
]);
const BLOCKING_REASONS = new Set<PinchBlockingReason>([
  "none", "image", "depth", "pose", "approach", "vision",
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
    const copy = validateAndCopyFrame(frame, 5);
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

  snapshot(): GestureTraceV5 {
    return {
      version: 5,
      frames: this.frames.map((frame) => validateAndCopyFrame(frame, 5)),
    };
  }

  serialize(): string {
    return JSON.stringify(this.snapshot());
  }
}

export function parseGestureTrace(json: string): GestureTraceV5 {
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
  if ((value.version !== 1 && value.version !== 2 && value.version !== 3 && value.version !== 4 && value.version !== 5) || !Array.isArray(value.frames)) {
    throw new TypeError("Gesture trace requires version 1, 2, 3, 4, or 5 and frames");
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
  return { version: 5, frames };
}

function validateAndCopyFrame(value: unknown, version: 1 | 2 | 3 | 4 | 5): GestureTraceFrame {
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

function validateFeatures(value: unknown, version: 1 | 2 | 3 | 4 | 5): GestureTraceFeatures | null {
  if (value === null) {
    return null;
  }
  if (!isRecord(value)) {
    throw new TypeError("Gesture trace features must be an object");
  }
  const numericKeys = version === 1
    ? LEGACY_FEATURE_KEYS
    : FEATURE_KEYS.filter((key) => key !== "worldLeftPinchRatio" && key !== "pinchDepthReliable");
  assertOnlyKeys(
    value,
    version === 1
      ? LEGACY_FEATURE_KEYS
      : version === 2 ? FEATURE_KEYS : version === 3 ? V3_FEATURE_KEYS : version === 4 ? V4_FEATURE_KEYS : V5_FEATURE_KEYS,
  );
  for (const key of numericKeys) {
    assertFinite(value[key]);
  }
  if (version >= 2) {
    if (value.worldLeftPinchRatio !== null) assertFinite(value.worldLeftPinchRatio);
    if (typeof value.pinchDepthReliable !== "boolean") {
      throw new TypeError("Gesture trace pinch depth reliability must be boolean");
    }
  }
  if (version >= 3) {
    for (const key of [
      "imageDepthGap", "worldDepthGap", "approachVelocity", "contactPoseScore",
      "pinchProbability", "frameIntervalMs", "inferenceMs", "effectiveFps",
    ] as const) {
      assertNullableFinite(value[key]);
    }
    assertUnitInterval(value.worldQuality);
    if (value.pinchProbability !== null) assertUnitInterval(value.pinchProbability);
    if (typeof value.safetyGatePassed !== "boolean") {
      throw new TypeError("Gesture trace safety gate must be boolean");
    }
    if (!Array.isArray(value.qualityReasons) || value.qualityReasons.some(
      (reason) => typeof reason !== "string" || !QUALITY_REASONS.has(reason as PinchQualityReason),
    )) {
      throw new TypeError("Gesture trace quality reasons are invalid");
    }
    if (value.blockingReason !== null && (
      typeof value.blockingReason !== "string"
      || !BLOCKING_REASONS.has(value.blockingReason as PinchBlockingReason)
    )) {
      throw new TypeError("Gesture trace blocking reason is invalid");
    }
    assertNonNegativeInteger(value.enterVotes);
    assertNonNegativeInteger(value.requiredVotes);
    if ((value.requiredVotes as number) < 1) {
      throw new TypeError("Gesture trace required votes must be positive");
    }
  }
  if (version >= 4) {
    assertNullableNonNegative(value.screenPinchGap);
    assertNullableNonNegative(value.worldPalmScale);
    assertNullableUnitInterval(value.palmFacingScore);
    assertFinite(value.imageAspectRatio);
    if ((value.imageAspectRatio as number) <= 0) {
      throw new TypeError("Gesture trace image aspect ratio must be positive");
    }
  }
  if (version === 5) {
    if (value.modelMode !== "mediapipe" && value.modelMode !== "dual") {
      throw new TypeError("Gesture trace model mode is invalid");
    }
    assertNullableNonNegative(value.visionPinchRatio);
    assertNullableUnitInterval(value.visionConfidence);
    assertNullableNonNegative(value.visionAgeMs);
    assertNullableNonNegative(value.visionInferenceMs);
    if (value.modelsAgree !== null && typeof value.modelsAgree !== "boolean") {
      throw new TypeError("Gesture trace model agreement must be boolean or null");
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
    screenPinchGap: version >= 4 ? value.screenPinchGap as number | null : null,
    imageAspectRatio: version >= 4 ? value.imageAspectRatio as number : 1,
    worldPalmScale: version >= 4 ? value.worldPalmScale as number | null : null,
    palmFacingScore: version >= 4 ? value.palmFacingScore as number | null : null,
    imageDepthGap: version >= 3 ? value.imageDepthGap as number | null : null,
    worldDepthGap: version >= 3 ? value.worldDepthGap as number | null : null,
    approachVelocity: version >= 3 ? value.approachVelocity as number | null : null,
    contactPoseScore: version >= 3 ? value.contactPoseScore as number | null : null,
    worldQuality: version >= 3 ? value.worldQuality as number : 0,
    qualityReasons: version >= 3 ? [...value.qualityReasons as PinchQualityReason[]] : [],
    pinchProbability: version >= 3 ? value.pinchProbability as number | null : null,
    safetyGatePassed: version >= 3 ? value.safetyGatePassed as boolean : false,
    blockingReason: version >= 3 ? value.blockingReason as PinchBlockingReason | null : null,
    enterVotes: version >= 3 ? value.enterVotes as number : 0,
    requiredVotes: version >= 3 ? value.requiredVotes as number : 2,
    frameIntervalMs: version >= 3 ? value.frameIntervalMs as number | null : null,
    inferenceMs: version >= 3 ? value.inferenceMs as number | null : null,
    effectiveFps: version >= 3 ? value.effectiveFps as number | null : null,
    modelMode: version === 5 ? value.modelMode as "mediapipe" | "dual" : "mediapipe",
    visionPinchRatio: version === 5 ? value.visionPinchRatio as number | null : null,
    visionConfidence: version === 5 ? value.visionConfidence as number | null : null,
    visionAgeMs: version === 5 ? value.visionAgeMs as number | null : null,
    visionInferenceMs: version === 5 ? value.visionInferenceMs as number | null : null,
    modelsAgree: version === 5 ? value.modelsAgree as boolean | null : null,
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

function assertNullableFinite(value: unknown): void {
  if (value !== null) assertFinite(value);
}

function assertNullableNonNegative(value: unknown): void {
  if (value === null) return;
  assertFinite(value);
  if (value < 0) {
    throw new TypeError("Gesture trace distance and scale values must be non-negative");
  }
}

function assertNullableUnitInterval(value: unknown): void {
  if (value === null) return;
  assertUnitInterval(value);
}

function assertNonNegativeInteger(value: unknown): void {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new TypeError("Gesture trace vote counts must be non-negative integers");
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
