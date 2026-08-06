import type { Landmark } from "./types";

export type OneEuroFilterOptions = {
  minCutoff?: number;
  beta?: number;
  derivativeCutoff?: number;
  maxGapMs?: number;
};

type RequiredOptions = Required<OneEuroFilterOptions>;

const DEFAULT_OPTIONS: RequiredOptions = {
  minCutoff: 1.15,
  beta: 0.18,
  derivativeCutoff: 1,
  maxGapMs: 120,
};

class LowPassFilter {
  private value: number | null = null;

  filter(value: number, alpha: number): number {
    this.value = this.value === null
      ? value
      : alpha * value + (1 - alpha) * this.value;
    return this.value;
  }

  reset(): void {
    this.value = null;
  }
}

class OneEuroScalarFilter {
  private readonly valueFilter = new LowPassFilter();
  private readonly derivativeFilter = new LowPassFilter();
  private previousRaw: number | null = null;

  constructor(private readonly options: RequiredOptions) {}

  filter(value: number, dtSeconds: number): number {
    const derivative = this.previousRaw === null
      ? 0
      : (value - this.previousRaw) / Math.max(1e-4, dtSeconds);
    this.previousRaw = value;
    const filteredDerivative = this.derivativeFilter.filter(
      derivative,
      alpha(this.options.derivativeCutoff, dtSeconds),
    );
    const cutoff = this.options.minCutoff + this.options.beta * Math.abs(filteredDerivative);
    return this.valueFilter.filter(value, alpha(cutoff, dtSeconds));
  }

  reset(): void {
    this.previousRaw = null;
    this.valueFilter.reset();
    this.derivativeFilter.reset();
  }
}

export class OneEuroPointFilter {
  private readonly options: RequiredOptions;
  private readonly x: OneEuroScalarFilter;
  private readonly y: OneEuroScalarFilter;
  private readonly z: OneEuroScalarFilter;
  private lastTimestampMs: number | null = null;

  constructor(options: OneEuroFilterOptions = {}) {
    this.options = {
      minCutoff: positive(options.minCutoff, DEFAULT_OPTIONS.minCutoff),
      beta: nonNegative(options.beta, DEFAULT_OPTIONS.beta),
      derivativeCutoff: positive(options.derivativeCutoff, DEFAULT_OPTIONS.derivativeCutoff),
      maxGapMs: positive(options.maxGapMs, DEFAULT_OPTIONS.maxGapMs),
    };
    this.x = new OneEuroScalarFilter(this.options);
    this.y = new OneEuroScalarFilter(this.options);
    this.z = new OneEuroScalarFilter(this.options);
  }

  filter(point: Landmark, timestampMs: number): Landmark {
    if (!isFinitePoint(point) || !Number.isFinite(timestampMs)) {
      this.reset();
      return { x: 0, y: 0, ...(point.z === undefined ? {} : { z: 0 }) };
    }

    if (
      this.lastTimestampMs === null
      || timestampMs <= this.lastTimestampMs
      || timestampMs - this.lastTimestampMs > this.options.maxGapMs
    ) {
      this.reset();
      this.lastTimestampMs = timestampMs;
      this.x.filter(point.x, 1 / 60);
      this.y.filter(point.y, 1 / 60);
      if (point.z !== undefined) this.z.filter(point.z, 1 / 60);
      return { ...point };
    }

    const dtSeconds = (timestampMs - this.lastTimestampMs) / 1_000;
    this.lastTimestampMs = timestampMs;
    return {
      x: this.x.filter(point.x, dtSeconds),
      y: this.y.filter(point.y, dtSeconds),
      ...(point.z === undefined ? {} : { z: this.z.filter(point.z, dtSeconds) }),
    };
  }

  reset(): void {
    this.x.reset();
    this.y.reset();
    this.z.reset();
    this.lastTimestampMs = null;
  }
}

function alpha(cutoff: number, dtSeconds: number): number {
  const timeConstant = 1 / (2 * Math.PI * Math.max(1e-4, cutoff));
  return 1 / (1 + timeConstant / Math.max(1e-4, dtSeconds));
}

function isFinitePoint(point: Landmark): boolean {
  return Number.isFinite(point.x)
    && Number.isFinite(point.y)
    && (point.z === undefined || Number.isFinite(point.z));
}

function positive(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : fallback;
}

function nonNegative(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value >= 0 ? value : fallback;
}
