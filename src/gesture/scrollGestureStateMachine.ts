import type { Landmark } from "./types";

export type ScrollGestureEvidence = {
  contact: boolean;
  retained: boolean;
  anchor: Landmark;
  palmScale: number;
  suppressed?: boolean;
};

export type ScrollGesturePhase = "neutral" | "candidate" | "active" | "releasing";

export type ScrollGestureOutput = {
  phase: ScrollGesturePhase;
  active: boolean;
  activated: boolean;
  released: boolean;
  contactFrames: number;
  requiredContactFrames: number;
  releaseFrames: number;
  requiredReleaseFrames: number;
  scrollY: number;
};

export type ScrollGestureConfig = {
  requiredContactFrames?: number;
  requiredReleaseFrames?: number;
  deadZoneRatio?: number;
  gain?: number;
  maxStep?: number;
};

const DEFAULT_CONTACT_FRAMES = 5;
const DEFAULT_RELEASE_FRAMES = 3;
const DEFAULT_DEAD_ZONE_RATIO = 0.015;
const DEFAULT_GAIN = 28;
const DEFAULT_MAX_STEP = 12;
const EPSILON = 1e-6;

export class ScrollGestureStateMachine {
  private readonly requiredContactFrames: number;
  private readonly requiredReleaseFrames: number;
  private readonly deadZoneRatio: number;
  private readonly gain: number;
  private readonly maxStep: number;
  private contactFrames = 0;
  private releaseFrames = 0;
  private active = false;
  private reference: Landmark | null = null;
  private residual = 0;
  private lastTimestampMs: number | null = null;

  constructor(config: ScrollGestureConfig = {}) {
    this.requiredContactFrames = positiveInteger(
      config.requiredContactFrames,
      DEFAULT_CONTACT_FRAMES,
      "requiredContactFrames",
    );
    this.requiredReleaseFrames = positiveInteger(
      config.requiredReleaseFrames,
      DEFAULT_RELEASE_FRAMES,
      "requiredReleaseFrames",
    );
    this.deadZoneRatio = positiveFinite(
      config.deadZoneRatio,
      DEFAULT_DEAD_ZONE_RATIO,
      "deadZoneRatio",
    );
    this.gain = positiveFinite(config.gain, DEFAULT_GAIN, "gain");
    this.maxStep = positiveInteger(config.maxStep, DEFAULT_MAX_STEP, "maxStep");
  }

  update(evidence: ScrollGestureEvidence | null, nowMs: number): ScrollGestureOutput {
    if (
      !Number.isFinite(nowMs)
      || (this.lastTimestampMs !== null && nowMs < this.lastTimestampMs)
    ) {
      this.reset();
      return this.output("neutral", false, false, 0);
    }
    this.lastTimestampMs = nowMs;

    if (!isValidEvidence(evidence) || evidence.suppressed) {
      this.reset();
      return this.output("neutral", false, false, 0);
    }

    if (!this.active) {
      return this.updateCandidate(evidence);
    }
    return this.updateActive(evidence);
  }

  reset(): void {
    this.contactFrames = 0;
    this.releaseFrames = 0;
    this.active = false;
    this.reference = null;
    this.residual = 0;
    this.lastTimestampMs = null;
  }

  private updateCandidate(evidence: ScrollGestureEvidence): ScrollGestureOutput {
    if (!evidence.contact) {
      this.contactFrames = 0;
      return this.output("neutral", false, false, 0);
    }

    this.contactFrames = Math.min(this.requiredContactFrames, this.contactFrames + 1);
    if (this.contactFrames < this.requiredContactFrames) {
      return this.output("candidate", false, false, 0);
    }

    this.active = true;
    this.releaseFrames = 0;
    this.reference = { ...evidence.anchor };
    this.residual = 0;
    return this.output("active", true, false, 0);
  }

  private updateActive(evidence: ScrollGestureEvidence): ScrollGestureOutput {
    if (!evidence.retained) {
      this.releaseFrames += 1;
      if (this.releaseFrames < this.requiredReleaseFrames) {
        return this.output("releasing", false, false, 0);
      }

      this.reset();
      return this.output("neutral", false, true, 0);
    }

    if (this.releaseFrames > 0) {
      this.releaseFrames = 0;
      this.reference = { ...evidence.anchor };
      this.residual = 0;
      return this.output("active", false, false, 0);
    }

    const scrollY = this.nextScrollStep(evidence.anchor, evidence.palmScale);
    return this.output("active", false, false, scrollY);
  }

  private nextScrollStep(anchor: Landmark, palmScale: number): number {
    if (this.reference === null) {
      this.reference = { ...anchor };
      return 0;
    }

    const deltaRatio = (this.reference.y - anchor.y) / palmScale;
    if (Math.abs(deltaRatio) < this.deadZoneRatio) {
      return 0;
    }
    this.reference = { ...anchor };

    const rawStep = deltaRatio * this.gain + this.residual;
    const integerStep = rawStep < 0 ? Math.ceil(rawStep) : Math.floor(rawStep);
    const boundedStep = Math.max(-this.maxStep, Math.min(this.maxStep, integerStep));
    this.residual = boundedStep === integerStep ? rawStep - integerStep : 0;
    return boundedStep;
  }

  private output(
    phase: ScrollGesturePhase,
    activated: boolean,
    released: boolean,
    scrollY: number,
  ): ScrollGestureOutput {
    return {
      phase,
      active: this.active,
      activated,
      released,
      contactFrames: this.contactFrames,
      requiredContactFrames: this.requiredContactFrames,
      releaseFrames: this.releaseFrames,
      requiredReleaseFrames: this.requiredReleaseFrames,
      scrollY,
    };
  }
}

function isValidEvidence(evidence: ScrollGestureEvidence | null): evidence is ScrollGestureEvidence {
  return evidence !== null
    && Number.isFinite(evidence.anchor.x)
    && Number.isFinite(evidence.anchor.y)
    && (evidence.anchor.z === undefined || Number.isFinite(evidence.anchor.z))
    && Number.isFinite(evidence.palmScale)
    && evidence.palmScale > EPSILON;
}

function positiveInteger(value: number | undefined, fallback: number, name: string): number {
  const resolved = value ?? fallback;
  if (!Number.isInteger(resolved) || resolved <= 0) {
    throw new TypeError(`${name} must be a positive integer`);
  }
  return resolved;
}

function positiveFinite(value: number | undefined, fallback: number, name: string): number {
  const resolved = value ?? fallback;
  if (!Number.isFinite(resolved) || resolved <= 0) {
    throw new TypeError(`${name} must be positive and finite`);
  }
  return resolved;
}
