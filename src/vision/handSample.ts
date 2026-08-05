import type { Landmark } from "../gesture/types";
import type { PinchBlockingReason } from "../gesture/pinchProbability";
import type { AppleVisionObservation } from "./appleVisionTypes";

export type HandSample = {
  version: 1;
  capturedAtMs: number;
  imageAspectRatio: number;
  jpegBase64: string;
  mediaPipeLandmarks: Landmark[] | null;
  mediaPipeWorldLandmarks: Landmark[] | null;
  appleVision: AppleVisionObservation | null;
  diagnostics: {
    palmFacingScore: number | null;
    mediaPipePinchRatio: number | null;
    visionPinchRatio: number | null;
    visionConfidence: number | null;
    modelAgreement: boolean | null;
    blockingReason: PinchBlockingReason | null;
  };
};

const MAX_JSON_BYTES = 1024 * 1024;
const TOP_LEVEL_KEYS = [
  "version", "capturedAtMs", "imageAspectRatio", "jpegBase64",
  "mediaPipeLandmarks", "mediaPipeWorldLandmarks", "appleVision", "diagnostics",
] as const;
const DIAGNOSTIC_KEYS = [
  "palmFacingScore", "mediaPipePinchRatio", "visionPinchRatio", "visionConfidence",
  "modelAgreement", "blockingReason",
] as const;
const BLOCKING_REASONS = new Set<PinchBlockingReason>([
  "none", "image", "depth", "pose", "approach", "vision",
]);

export function serializeHandSample(sample: HandSample): string {
  return JSON.stringify(validateHandSample(sample));
}

export function encodeJpegBase64(bytes: Uint8Array): string {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0 || bytes.byteLength > 400 * 1024) {
    throw new TypeError("Hand sample JPEG must be non-empty and not exceed 400 KiB");
  }
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 8_192) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8_192));
  }
  return btoa(binary);
}

export function parseHandSample(json: string): HandSample {
  if (typeof json !== "string" || new TextEncoder().encode(json).byteLength > MAX_JSON_BYTES) {
    throw new TypeError("Hand sample must not exceed 1 MiB");
  }
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    throw new TypeError("Hand sample must be valid JSON");
  }
  return validateHandSample(value);
}

function validateHandSample(value: unknown): HandSample {
  const sample = record(value, TOP_LEVEL_KEYS, "Hand sample");
  if (sample.version !== 1) throw new TypeError("Hand sample version must be 1");
  finiteNonNegative(sample.capturedAtMs, "capture timestamp");
  finiteNonNegative(sample.imageAspectRatio, "image aspect ratio");
  if ((sample.imageAspectRatio as number) <= 0) throw new TypeError("Hand sample image aspect ratio must be positive");
  if (typeof sample.jpegBase64 !== "string") throw new TypeError("Hand sample JPEG must be base64 text");
  validateJpeg(sample.jpegBase64);
  const appleVision = sample.appleVision === null ? null : validateAppleVision(sample.appleVision);
  const diagnostics = record(sample.diagnostics, DIAGNOSTIC_KEYS, "Hand sample diagnostics");
  nullableUnit(diagnostics.palmFacingScore, "palm facing score");
  nullableNonNegative(diagnostics.mediaPipePinchRatio, "MediaPipe pinch ratio");
  nullableNonNegative(diagnostics.visionPinchRatio, "Vision pinch ratio");
  nullableUnit(diagnostics.visionConfidence, "Vision confidence");
  if (diagnostics.modelAgreement !== null && typeof diagnostics.modelAgreement !== "boolean") {
    throw new TypeError("Hand sample model agreement must be boolean or null");
  }
  if (diagnostics.blockingReason !== null && (
    typeof diagnostics.blockingReason !== "string"
    || !BLOCKING_REASONS.has(diagnostics.blockingReason as PinchBlockingReason)
  )) throw new TypeError("Hand sample blocking reason is invalid");

  return {
    version: 1,
    capturedAtMs: sample.capturedAtMs as number,
    imageAspectRatio: sample.imageAspectRatio as number,
    jpegBase64: sample.jpegBase64,
    mediaPipeLandmarks: validateLandmarks(sample.mediaPipeLandmarks),
    mediaPipeWorldLandmarks: validateLandmarks(sample.mediaPipeWorldLandmarks),
    appleVision,
    diagnostics: {
      palmFacingScore: diagnostics.palmFacingScore as number | null,
      mediaPipePinchRatio: diagnostics.mediaPipePinchRatio as number | null,
      visionPinchRatio: diagnostics.visionPinchRatio as number | null,
      visionConfidence: diagnostics.visionConfidence as number | null,
      modelAgreement: diagnostics.modelAgreement as boolean | null,
      blockingReason: diagnostics.blockingReason as PinchBlockingReason | null,
    },
  };
}

function validateAppleVision(value: unknown): AppleVisionObservation {
  const observation = record(
    value,
    ["landmarks", "confidences", "capturedAtMs", "inferenceMs"],
    "Apple Vision observation",
  );
  const landmarks = validateLandmarks(observation.landmarks);
  if (!landmarks) throw new TypeError("Apple Vision landmarks must contain 21 points");
  if (!Array.isArray(observation.confidences) || observation.confidences.length !== 21) {
    throw new TypeError("Apple Vision confidences must contain 21 values");
  }
  const confidences = observation.confidences.map((confidence) => {
    unit(confidence, "Apple Vision confidence");
    return confidence as number;
  });
  finiteNonNegative(observation.capturedAtMs, "Apple Vision capture timestamp");
  finiteNonNegative(observation.inferenceMs, "Apple Vision inference time");
  return {
    landmarks,
    confidences,
    capturedAtMs: observation.capturedAtMs as number,
    inferenceMs: observation.inferenceMs as number,
  };
}

function validateLandmarks(value: unknown): Landmark[] | null {
  if (value === null) return null;
  if (!Array.isArray(value) || value.length !== 21) throw new TypeError("Hand sample landmarks must contain 21 points");
  return value.map((point) => {
    const item = recordAllowed(point, ["x", "y", "z"], "Hand sample landmark");
    finite(item.x, "landmark x");
    finite(item.y, "landmark y");
    if (item.z !== undefined) finite(item.z, "landmark z");
    return { x: item.x as number, y: item.y as number, ...(item.z === undefined ? {} : { z: item.z as number }) };
  });
}

function validateJpeg(base64: string): void {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) throw new TypeError("Hand sample JPEG base64 is invalid");
  const bytes = decodeBase64(base64);
  if (
    bytes.length === 0 || bytes.length > 400 * 1024
    || bytes[0] !== 0xff || bytes[1] !== 0xd8
    || bytes.at(-2) !== 0xff || bytes.at(-1) !== 0xd9
  ) throw new TypeError("Hand sample JPEG data is invalid");
}

function decodeBase64(value: string): Uint8Array {
  if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(value, "base64"));
  const decoded = atob(value);
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}

function record(value: unknown, keys: readonly string[], label: string): Record<string, unknown> {
  const item = recordAllowed(value, keys, label);
  const missing = keys.find((key) => !(key in item));
  if (missing) throw new TypeError(`${label} is missing field: ${missing}`);
  return item;
}

function recordAllowed(value: unknown, keys: readonly string[], label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
  const item = value as Record<string, unknown>;
  const allowed = new Set(keys);
  const unknown = Object.keys(item).find((key) => !allowed.has(key));
  if (unknown) throw new TypeError(`${label} contains unknown field: ${unknown}`);
  return item;
}

function finite(value: unknown, label: string): void {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new TypeError(`${label} must be finite`);
}

function finiteNonNegative(value: unknown, label: string): void {
  finite(value, label);
  if ((value as number) < 0) throw new TypeError(`${label} must be non-negative`);
}

function unit(value: unknown, label: string): void {
  finite(value, label);
  if ((value as number) < 0 || (value as number) > 1) throw new TypeError(`${label} must be between 0 and 1`);
}

function nullableUnit(value: unknown, label: string): void {
  if (value !== null) unit(value, label);
}

function nullableNonNegative(value: unknown, label: string): void {
  if (value !== null) finiteNonNegative(value, label);
}
