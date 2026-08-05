export type AppleVisionLandmark = {
  x: number;
  y: number;
  confidence: number;
};

export type AppleVisionHelperResponse = {
  id: number;
  landmarks: AppleVisionLandmark[] | null;
  inferenceMs: number;
  error: string | null;
};

const RESPONSE_KEYS = ["id", "landmarks", "inferenceMs", "error"] as const;
const LANDMARK_KEYS = ["x", "y", "confidence"] as const;

export function parseAppleVisionResponse(line: string): AppleVisionHelperResponse {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    throw new TypeError("Apple Vision response must be valid JSON");
  }
  if (!isRecord(value) || !hasExactKeys(value, RESPONSE_KEYS)) {
    throw new TypeError("Apple Vision response schema is invalid");
  }
  if (!Number.isInteger(value.id) || (value.id as number) < 1) {
    throw new TypeError("Apple Vision response id must be a positive integer");
  }
  if (!isFiniteNonNegative(value.inferenceMs)) {
    throw new TypeError("Apple Vision inference time must be finite and non-negative");
  }
  if (value.error !== null && typeof value.error !== "string") {
    throw new TypeError("Apple Vision response error must be text or null");
  }

  let landmarks: AppleVisionLandmark[] | null = null;
  if (value.landmarks !== null) {
    if (!Array.isArray(value.landmarks) || value.landmarks.length !== 21) {
      throw new TypeError("Apple Vision response must contain 21 landmarks");
    }
    landmarks = value.landmarks.map((point) => {
      if (!isRecord(point) || !hasExactKeys(point, LANDMARK_KEYS)) {
        throw new TypeError("Apple Vision landmark schema is invalid");
      }
      for (const key of LANDMARK_KEYS) {
        if (!isUnitInterval(point[key])) {
          throw new TypeError("Apple Vision landmark values must be between 0 and 1");
        }
      }
      return {
        x: point.x as number,
        y: point.y as number,
        confidence: point.confidence as number,
      };
    });
  }

  return {
    id: value.id as number,
    landmarks,
    inferenceMs: value.inferenceMs as number,
    error: value.error as string | null,
  };
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every((key) => key in value);
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isUnitInterval(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
