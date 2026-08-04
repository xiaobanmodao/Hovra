import type { Landmark } from "./types";

export type AdaptiveLandmarkFilterOptions = {
  minCutoff?: number;
  beta?: number;
  derivativeCutoff?: number;
  resetGapMs?: number;
};

type ScalarFilterState = {
  raw: number;
  value: number;
  derivative: number;
};

type LandmarkFilterState = {
  x: ScalarFilterState;
  y: ScalarFilterState;
  z: ScalarFilterState;
  hasZ: boolean;
};

const DEFAULT_MIN_CUTOFF = 1;
const DEFAULT_BETA = 16;
const DEFAULT_DERIVATIVE_CUTOFF = 1;
const DEFAULT_RESET_GAP_MS = 250;

export class AdaptiveLandmarkFilter {
  private readonly minCutoff: number;
  private readonly beta: number;
  private readonly derivativeCutoff: number;
  private readonly resetGapMs: number;
  private states: LandmarkFilterState[] | null = null;
  private lastTimestampMs: number | null = null;

  constructor(options: AdaptiveLandmarkFilterOptions = {}) {
    this.minCutoff = positiveOrDefault(options.minCutoff, DEFAULT_MIN_CUTOFF);
    this.beta = nonNegativeOrDefault(options.beta, DEFAULT_BETA);
    this.derivativeCutoff = positiveOrDefault(
      options.derivativeCutoff,
      DEFAULT_DERIVATIVE_CUTOFF,
    );
    this.resetGapMs = positiveOrDefault(options.resetGapMs, DEFAULT_RESET_GAP_MS);
  }

  update(landmarks: Landmark[] | null, nowMs: number): Landmark[] | null {
    if (!isValidFrame(landmarks) || !Number.isFinite(nowMs)) {
      this.reset();
      return null;
    }

    const elapsedMs = this.lastTimestampMs === null ? null : nowMs - this.lastTimestampMs;
    if (
      this.states === null
      || elapsedMs === null
      || elapsedMs <= 0
      || elapsedMs > this.resetGapMs
    ) {
      return this.initialize(landmarks, nowMs);
    }

    const elapsedSeconds = elapsedMs / 1_000;
    const output = landmarks.map((point, index) => {
      const state = this.states![index]!;
      const x = filterScalar(
        state.x,
        point.x,
        elapsedSeconds,
        this.minCutoff,
        this.beta,
        this.derivativeCutoff,
      );
      const y = filterScalar(
        state.y,
        point.y,
        elapsedSeconds,
        this.minCutoff,
        this.beta,
        this.derivativeCutoff,
      );
      const zValue = point.z ?? 0;
      const z = filterScalar(
        state.z,
        zValue,
        elapsedSeconds,
        this.minCutoff,
        this.beta,
        this.derivativeCutoff,
      );
      state.hasZ = point.z !== undefined;

      return point.z === undefined ? { x, y } : { x, y, z };
    });

    this.lastTimestampMs = nowMs;
    return output;
  }

  reset(): void {
    this.states = null;
    this.lastTimestampMs = null;
  }

  private initialize(landmarks: Landmark[], nowMs: number): Landmark[] {
    this.states = landmarks.map((point) => ({
      x: initialScalarState(point.x),
      y: initialScalarState(point.y),
      z: initialScalarState(point.z ?? 0),
      hasZ: point.z !== undefined,
    }));
    this.lastTimestampMs = nowMs;
    return copyLandmarks(landmarks);
  }
}

function filterScalar(
  state: ScalarFilterState,
  nextRaw: number,
  elapsedSeconds: number,
  minCutoff: number,
  beta: number,
  derivativeCutoff: number,
): number {
  const rawDerivative = (nextRaw - state.raw) / elapsedSeconds;
  const derivative = lowPass(
    state.derivative,
    rawDerivative,
    smoothingAlpha(derivativeCutoff, elapsedSeconds),
  );
  const cutoff = minCutoff + beta * Math.abs(derivative);
  const value = lowPass(state.value, nextRaw, smoothingAlpha(cutoff, elapsedSeconds));

  state.raw = nextRaw;
  state.derivative = derivative;
  state.value = value;
  return value;
}

function smoothingAlpha(cutoff: number, elapsedSeconds: number): number {
  const timeConstant = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + timeConstant / elapsedSeconds);
}

function lowPass(previous: number, next: number, alpha: number): number {
  return previous + alpha * (next - previous);
}

function initialScalarState(value: number): ScalarFilterState {
  return { raw: value, value, derivative: 0 };
}

function isValidFrame(landmarks: Landmark[] | null): landmarks is Landmark[] {
  return landmarks?.length === 21 && landmarks.every((point) => (
    Number.isFinite(point.x)
    && Number.isFinite(point.y)
    && (point.z === undefined || Number.isFinite(point.z))
  ));
}

function copyLandmarks(landmarks: Landmark[]): Landmark[] {
  return landmarks.map((point) => (
    point.z === undefined
      ? { x: point.x, y: point.y }
      : { x: point.x, y: point.y, z: point.z }
  ));
}

function positiveOrDefault(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : fallback;
}

function nonNegativeOrDefault(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value >= 0 ? value : fallback;
}
