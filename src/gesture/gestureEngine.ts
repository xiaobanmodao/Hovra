import { AdaptiveLandmarkFilter } from "./adaptiveLandmarkFilter";
import { DEFAULT_GESTURE_SETTINGS } from "./config";
import { GestureClassifier } from "./gestureClassifier";
import { extractGestureFeatures, type GestureFeatures } from "./gestureFeatures";
import { GestureStabilizer, type GestureStabilizerOutput } from "./gestureStabilizer";
import { GestureTraceBuffer, type GestureTrace, type TraceGestureEvent } from "./gestureTrace";
import { buildHandGeometry, type HandGeometry, type Vector3 } from "./handGeometry";
import {
  INDEX_FINGER_TIP,
  type GestureDiagnosticsSnapshot,
  type GestureKind,
  type GestureOutput,
  type GestureSettings,
  type GestureState,
  type Landmark,
} from "./types";

const PINCH_STATES: Record<"left" | "right" | "double", GestureState> = {
  left: "left-pinching",
  right: "right-pinching",
  double: "double-pinching",
};

const SCROLL_SCALE = 24;
const MAX_SCROLL_STEP = 12;
const SCROLL_DEAD_ZONE = 0.015;

export class GestureEngine {
  private readonly settings: GestureSettings;
  private readonly filter = new AdaptiveLandmarkFilter();
  private readonly classifier: GestureClassifier;
  private readonly stabilizer = new GestureStabilizer();
  private readonly trace = new GestureTraceBuffer();
  private activeStartedAt: number | null = null;
  private dragging = false;
  private scrollReference: Vector3 | null = null;
  private lastCursor: Landmark | null = null;
  private traceEpochMs: number | null = null;
  private lastTraceTimestamp = 0;

  constructor(settings: GestureSettings = DEFAULT_GESTURE_SETTINGS) {
    this.settings = { ...settings };
    this.classifier = new GestureClassifier(settings.gestureSensitivity);
  }

  update(landmarks: Landmark[] | null, nowMs: number): GestureOutput {
    const filtered = this.filter.update(landmarks, nowMs);
    const geometry = buildHandGeometry(filtered);
    const features = geometry ? extractGestureFeatures(geometry) : null;
    const candidate = features
      ? this.classifier.classify(features, this.stabilizer.lockedGesture)
      : null;
    const stabilized = this.stabilizer.update(candidate, nowMs, features !== null);
    const events: Partial<GestureOutput> = {};

    if (geometry) {
      this.lastCursor = geometry.landmarks[INDEX_FINGER_TIP] ?? this.lastCursor;
    }

    if (stabilized.activated !== null) {
      this.activeStartedAt = nowMs;
      if (stabilized.activated === "scroll") {
        this.scrollReference = geometry?.origin ?? null;
      }
    }

    if (
      stabilized.lockedGesture === "left"
      && !this.dragging
      && this.activeStartedAt !== null
      && nowMs - this.activeStartedAt >= this.settings.dragHoldMs
    ) {
      this.dragging = true;
      events.dragStart = true;
    }

    if (stabilized.lockedGesture === "scroll" && geometry) {
      events.scrollY = this.nextScrollStep(geometry);
    }

    if (stabilized.timedOut) {
      if (this.dragging) events.dragEnd = true;
      this.clearActiveAction();
    } else if (stabilized.released !== null) {
      if (this.dragging) {
        events.dragEnd = true;
      } else if (stabilized.released === "left") {
        events.click = true;
      } else if (stabilized.released === "right") {
        events.rightClick = true;
      } else if (stabilized.released === "double") {
        events.doubleClick = true;
      }
      this.clearActiveAction();
    }

    const state = this.deriveState(stabilized, features !== null);
    const output = this.output(
      state,
      features === null && stabilized.lockedGesture === null ? null : this.lastCursor,
      stabilized,
      features,
      nowMs,
      events,
    );
    this.recordTrace(landmarks, output, features, nowMs);
    return output;
  }

  getTrace(): GestureTrace {
    return this.trace.snapshot();
  }

  serializeTrace(): string {
    return this.trace.serialize();
  }

  private deriveState(stabilized: GestureStabilizerOutput, inputValid: boolean): GestureState {
    if (this.dragging) return "dragging";
    const visibleGesture = stabilized.lockedGesture ?? (
      stabilized.phase === "candidate" ? stabilized.candidate : null
    );
    if (visibleGesture === "left" || visibleGesture === "right" || visibleGesture === "double") {
      return PINCH_STATES[visibleGesture];
    }
    if (visibleGesture === "scroll") return stabilized.lockedGesture ? "scrolling" : "tracking";
    if (visibleGesture === "open-palm") return stabilized.lockedGesture ? "paused" : "tracking";
    return inputValid ? "tracking" : "lost";
  }

  private nextScrollStep(geometry: HandGeometry): number {
    if (this.scrollReference === null) {
      this.scrollReference = geometry.origin;
      return 0;
    }
    const delta = geometry.projectDelta({
      x: geometry.origin.x - this.scrollReference.x,
      y: geometry.origin.y - this.scrollReference.y,
      z: geometry.origin.z - this.scrollReference.z,
    });
    this.scrollReference = geometry.origin;
    if (Math.abs(delta.y) < SCROLL_DEAD_ZONE) return 0;
    return Math.max(-MAX_SCROLL_STEP, Math.min(MAX_SCROLL_STEP, Math.round(delta.y * SCROLL_SCALE)));
  }

  private clearActiveAction(): void {
    this.activeStartedAt = null;
    this.dragging = false;
    this.scrollReference = null;
  }

  private output(
    state: GestureState,
    cursor: Landmark | null,
    stabilized: GestureStabilizerOutput,
    features: GestureFeatures | null,
    nowMs: number,
    events: Partial<GestureOutput>,
  ): GestureOutput {
    return {
      state,
      cursor,
      click: false,
      rightClick: false,
      doubleClick: false,
      scrollY: 0,
      dragStart: false,
      dragEnd: false,
      phase: this.dragging ? "dragging" : stabilized.phase,
      candidate: stabilized.candidate,
      lockedGesture: stabilized.lockedGesture,
      confirmationProgress: stabilized.confirmationProgress,
      diagnostics: diagnosticsFor(features, nowMs),
      ...events,
    };
  }

  private recordTrace(
    landmarks: Landmark[] | null,
    output: GestureOutput,
    features: GestureFeatures | null,
    nowMs: number,
  ): void {
    if (this.traceEpochMs === null || nowMs < this.traceEpochMs) this.traceEpochMs = nowMs;
    const relativeTimestamp = Math.max(this.lastTraceTimestamp, nowMs - this.traceEpochMs);
    this.lastTraceTimestamp = relativeTimestamp;
    const events: TraceGestureEvent[] = [];
    if (output.click) events.push("click");
    if (output.rightClick) events.push("rightClick");
    if (output.doubleClick) events.push("doubleClick");
    if (output.scrollY !== 0) events.push("scroll");
    if (output.dragStart) events.push("dragStart");
    if (output.dragEnd) events.push("dragEnd");

    this.trace.push({
      t: relativeTimestamp,
      landmarks,
      quality: features ? 1 : 0,
      features: features ? {
        leftPinchRatio: features.leftPinchRatio,
        rightPinchRatio: features.rightPinchRatio,
        doublePinchRatio: features.doublePinchRatio,
        openPalmScore: features.openPalmScore,
        scrollPoseScore: features.scrollPoseScore,
        palmScale: features.palmScale,
      } : null,
      phase: output.phase,
      candidate: output.candidate,
      confirmationProgress: output.confirmationProgress,
      lockedGesture: output.lockedGesture,
      events,
    });
  }
}

function diagnosticsFor(features: GestureFeatures | null, timestampMs: number): GestureDiagnosticsSnapshot {
  return {
    timestampMs,
    quality: features ? 1 : 0,
    palmScale: features?.palmScale ?? null,
    leftPinchRatio: features?.leftPinchRatio ?? null,
    rightPinchRatio: features?.rightPinchRatio ?? null,
    doublePinchRatio: features?.doublePinchRatio ?? null,
    openPalmScore: features?.openPalmScore ?? null,
    scrollPoseScore: features?.scrollPoseScore ?? null,
  };
}
