import type { PinchBlockingReason } from "./pinchProbability";
import type { GesturePhase, Landmark } from "./types";

export type ClickBlockingReason = PinchBlockingReason
  | "high-speed"
  | "travel"
  | "timeout"
  | "suppressed"
  | "tracking-gap";

export type PinchClickEvidence = {
  contact: boolean;
  separated: boolean;
  blockingReason: PinchBlockingReason;
  /** 经过 One Euro 过滤、用于移动和锁定点击的坐标。 */
  cursor: Landmark;
  /** 未过滤坐标，只用于速度和移动范围安全门。 */
  motionCursor: Landmark;
  /** 张掌、握拳或其他明确不允许点击的姿态。 */
  suppressed: boolean;
};

export type PinchClickConfig = {
  requiredContactFrames: number;
  requiredReleaseFrames: number;
  maxFrameGapMs: number;
  maxGestureMs: number;
  maxCursorSpeed: number;
  maxTravel: number;
  suppressionCooldownMs: number;
  requiredCleanFrames: number;
};

export type PinchClickOutput = {
  phase: GesturePhase;
  clicked: boolean;
  clickCursor: Landmark | null;
  active: boolean;
  contactFrames: number;
  requiredContactFrames: number;
  releaseFrames: number;
  cursorSpeed: number;
  blockingReason: ClickBlockingReason | null;
};

export const DEFAULT_PINCH_CLICK_CONFIG: Readonly<PinchClickConfig> = {
  requiredContactFrames: 2,
  requiredReleaseFrames: 2,
  maxFrameGapMs: 120,
  maxGestureMs: 650,
  maxCursorSpeed: 3.2,
  maxTravel: 0.12,
  suppressionCooldownMs: 120,
  requiredCleanFrames: 3,
};

export class PinchClickStateMachine {
  private readonly config: PinchClickConfig;
  private phase: GesturePhase = "neutral";
  private armed = false;
  private hasTrackingBaseline = false;
  private contactFrames = 0;
  private releaseFrames = 0;
  private cleanFrames = 0;
  private suppressedUntilMs = 0;
  private gestureStartedAtMs: number | null = null;
  private latchedCursor: Landmark | null = null;
  private gestureOrigin: Landmark | null = null;
  private lastSeparatedCursor: Landmark | null = null;
  private lastMotionCursor: Landmark | null = null;
  private lastTimestampMs: number | null = null;
  private peakSpeed = 0;

  constructor(config: Partial<PinchClickConfig> = {}) {
    this.config = resolvePinchClickConfig(config);
  }

  update(evidence: PinchClickEvidence | null, nowMs: number): PinchClickOutput {
    if (!Number.isFinite(nowMs) || (this.lastTimestampMs !== null && nowMs <= this.lastTimestampMs)) {
      this.resetTracking("tracking-gap");
      return this.output(false, null, 0, "tracking-gap");
    }

    if (this.lastTimestampMs !== null && nowMs - this.lastTimestampMs > this.config.maxFrameGapMs) {
      this.resetTracking("tracking-gap");
    }

    const cursorSpeed = evidence ? this.measureSpeed(evidence.motionCursor, nowMs) : 0;
    this.lastTimestampMs = nowMs;

    if (!evidence) {
      this.resetTracking("tracking-gap");
      this.lastTimestampMs = nowMs;
      return this.output(false, null, cursorSpeed, "tracking-gap");
    }

    if (evidence.suppressed) {
      this.enterSuppression(nowMs);
      this.lastMotionCursor = { ...evidence.motionCursor };
      return this.output(false, null, cursorSpeed, "suppressed");
    }

    if (!this.hasTrackingBaseline) {
      if (evidence.separated) {
        this.hasTrackingBaseline = true;
        this.armed = true;
        this.phase = "neutral";
        this.lastSeparatedCursor = { ...evidence.cursor };
        return this.output(false, null, cursorSpeed, evidence.blockingReason);
      }
      this.phase = "cooldown";
      return this.output(false, null, cursorSpeed, "tracking-gap");
    }

    if (!this.armed) {
      if (evidence.separated && nowMs >= this.suppressedUntilMs) {
        this.cleanFrames += 1;
        this.lastSeparatedCursor = { ...evidence.cursor };
        if (this.cleanFrames >= this.config.requiredCleanFrames) {
          this.armed = true;
          this.phase = "neutral";
          this.cleanFrames = 0;
        } else {
          this.phase = "cooldown";
        }
      } else {
        this.cleanFrames = 0;
        this.phase = "cooldown";
      }
      return this.output(false, null, cursorSpeed, this.phase === "cooldown" ? "suppressed" : null);
    }

    if (this.gestureStartedAtMs !== null && nowMs - this.gestureStartedAtMs > this.config.maxGestureMs) {
      this.cancelGesture(nowMs);
      return this.output(false, null, cursorSpeed, "timeout");
    }

    if (cursorSpeed > this.config.maxCursorSpeed) {
      this.cancelGesture(nowMs);
      return this.output(false, null, cursorSpeed, "high-speed");
    }

    this.peakSpeed = Math.max(this.peakSpeed, cursorSpeed);
    if (
      this.gestureOrigin
      && distance2(this.gestureOrigin, evidence.motionCursor) > this.config.maxTravel
    ) {
      this.cancelGesture(nowMs);
      return this.output(false, null, cursorSpeed, "travel");
    }

    if (evidence.contact) {
      this.releaseFrames = 0;
      if (this.contactFrames === 0) {
        this.gestureStartedAtMs = nowMs;
        this.latchedCursor = { ...(this.lastSeparatedCursor ?? evidence.cursor) };
        this.gestureOrigin = { ...evidence.motionCursor };
        this.peakSpeed = cursorSpeed;
      }
      this.contactFrames = Math.min(this.config.requiredContactFrames, this.contactFrames + 1);
      this.phase = this.contactFrames >= this.config.requiredContactFrames ? "active" : "candidate";
      return this.output(false, null, cursorSpeed, evidence.blockingReason === "none" ? null : evidence.blockingReason);
    }

    if (this.phase === "candidate") {
      this.clearGesture();
      this.phase = "neutral";
      if (evidence.separated) this.lastSeparatedCursor = { ...evidence.cursor };
      return this.output(false, null, cursorSpeed, evidence.blockingReason);
    }

    if (this.phase === "active" || this.phase === "releasing") {
      this.releaseFrames = evidence.separated
        ? Math.min(this.config.requiredReleaseFrames, this.releaseFrames + 1)
        : 0;
      this.phase = "releasing";
      if (this.releaseFrames >= this.config.requiredReleaseFrames) {
        const clickCursor = this.latchedCursor ? { ...this.latchedCursor } : { ...evidence.cursor };
        this.armed = false;
        this.suppressedUntilMs = nowMs + this.config.suppressionCooldownMs;
        this.phase = "cooldown";
        this.cleanFrames = 0;
        this.lastSeparatedCursor = { ...evidence.cursor };
        this.clearGesture();
        return this.output(true, clickCursor, cursorSpeed, null);
      }
      return this.output(false, null, cursorSpeed, evidence.blockingReason);
    }

    this.phase = "neutral";
    if (evidence.separated) this.lastSeparatedCursor = { ...evidence.cursor };
    return this.output(false, null, cursorSpeed, evidence.blockingReason === "none" ? null : evidence.blockingReason);
  }

  reset(): void {
    this.phase = "neutral";
    this.armed = false;
    this.hasTrackingBaseline = false;
    this.contactFrames = 0;
    this.releaseFrames = 0;
    this.cleanFrames = 0;
    this.suppressedUntilMs = 0;
    this.gestureStartedAtMs = null;
    this.latchedCursor = null;
    this.gestureOrigin = null;
    this.lastSeparatedCursor = null;
    this.lastMotionCursor = null;
    this.lastTimestampMs = null;
    this.peakSpeed = 0;
  }

  private measureSpeed(cursor: Landmark, nowMs: number): number {
    if (!this.lastMotionCursor || this.lastTimestampMs === null || nowMs <= this.lastTimestampMs) {
      this.lastMotionCursor = { ...cursor };
      return 0;
    }
    const seconds = (nowMs - this.lastTimestampMs) / 1_000;
    const speed = distance2(this.lastMotionCursor, cursor) / Math.max(1e-4, seconds);
    this.lastMotionCursor = { ...cursor };
    return Number.isFinite(speed) ? speed : Number.POSITIVE_INFINITY;
  }

  private enterSuppression(nowMs: number): void {
    this.hasTrackingBaseline = true;
    this.armed = false;
    this.phase = "cooldown";
    this.cleanFrames = 0;
    this.suppressedUntilMs = nowMs + this.config.suppressionCooldownMs;
    this.clearGesture();
  }

  private cancelGesture(nowMs: number): void {
    this.enterSuppression(nowMs);
  }

  private clearGesture(): void {
    this.contactFrames = 0;
    this.releaseFrames = 0;
    this.gestureStartedAtMs = null;
    this.latchedCursor = null;
    this.gestureOrigin = null;
    this.peakSpeed = 0;
  }

  private resetTracking(reason: ClickBlockingReason): void {
    this.clearGesture();
    this.armed = false;
    this.hasTrackingBaseline = false;
    this.phase = "lost";
    this.cleanFrames = 0;
    this.suppressedUntilMs = 0;
    this.lastMotionCursor = null;
    if (reason !== "tracking-gap") this.phase = "cooldown";
  }

  private output(
    clicked: boolean,
    clickCursor: Landmark | null,
    cursorSpeed: number,
    blockingReason: ClickBlockingReason | null,
  ): PinchClickOutput {
    return {
      phase: this.phase,
      clicked,
      clickCursor,
      active: this.phase === "active" || this.phase === "releasing",
      contactFrames: this.contactFrames,
      requiredContactFrames: this.config.requiredContactFrames,
      releaseFrames: this.releaseFrames,
      cursorSpeed,
      blockingReason,
    };
  }
}

export function resolvePinchClickConfig(input: Partial<PinchClickConfig> = {}): PinchClickConfig {
  return {
    requiredContactFrames: integerInRange(input.requiredContactFrames, 2, 5, DEFAULT_PINCH_CLICK_CONFIG.requiredContactFrames),
    requiredReleaseFrames: integerInRange(input.requiredReleaseFrames, 2, 5, DEFAULT_PINCH_CLICK_CONFIG.requiredReleaseFrames),
    maxFrameGapMs: range(input.maxFrameGapMs, 50, 250, DEFAULT_PINCH_CLICK_CONFIG.maxFrameGapMs),
    maxGestureMs: range(input.maxGestureMs, 150, 1_200, DEFAULT_PINCH_CLICK_CONFIG.maxGestureMs),
    maxCursorSpeed: range(input.maxCursorSpeed, 0.5, 12, DEFAULT_PINCH_CLICK_CONFIG.maxCursorSpeed),
    maxTravel: range(input.maxTravel, 0.03, 0.35, DEFAULT_PINCH_CLICK_CONFIG.maxTravel),
    suppressionCooldownMs: range(input.suppressionCooldownMs, 40, 500, DEFAULT_PINCH_CLICK_CONFIG.suppressionCooldownMs),
    requiredCleanFrames: integerInRange(input.requiredCleanFrames, 2, 8, DEFAULT_PINCH_CLICK_CONFIG.requiredCleanFrames),
  };
}

function distance2(first: Landmark, second: Landmark): number {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

function range(value: number | undefined, min: number, max: number, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value >= min && value <= max ? value : fallback;
}

function integerInRange(value: number | undefined, min: number, max: number, fallback: number): number {
  return value !== undefined && Number.isInteger(value) && value >= min && value <= max ? value : fallback;
}
