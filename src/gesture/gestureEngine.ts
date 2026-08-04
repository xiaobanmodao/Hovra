import { AdaptiveLandmarkFilter } from "./adaptiveLandmarkFilter";
import { DEFAULT_GESTURE_SETTINGS } from "./config";
import { GestureClassifier } from "./gestureClassifier";
import { extractGestureFeatures, type GestureFeatures } from "./gestureFeatures";
import { GestureStabilizer, type GestureStabilizerOutput } from "./gestureStabilizer";
import { GestureTraceBuffer, type GestureTrace, type TraceGestureEvent } from "./gestureTrace";
import { buildHandGeometry, type HandGeometry } from "./handGeometry";
import {
  INDEX_FINGER_TIP,
  type GestureDiagnosticsSnapshot,
  type GestureKind,
  type GestureOutput,
  type GestureSettings,
  type GestureState,
  type Landmark,
} from "./types";

export class GestureEngine {
  private readonly settings: GestureSettings;
  private readonly filter = new AdaptiveLandmarkFilter();
  private readonly classifier: GestureClassifier;
  private readonly stabilizer = new GestureStabilizer();
  private readonly trace = new GestureTraceBuffer();
  private lastCursor: Landmark | null = null;
  private traceEpochMs: number | null = null;
  private lastTraceTimestamp = 0;

  constructor(settings: GestureSettings = DEFAULT_GESTURE_SETTINGS) {
    this.settings = { ...settings };
    this.classifier = new GestureClassifier(settings.gestureSensitivity);
  }

  update(
    landmarks: Landmark[] | null,
    nowMs: number,
    worldLandmarks: Landmark[] | null = null,
  ): GestureOutput {
    const filtered = this.filter.update(landmarks, nowMs);
    const cursorGeometry = buildHandGeometry(filtered);
    const actionGeometry = buildHandGeometry(landmarks);
    const worldGeometry = buildHandGeometry(worldLandmarks);
    const features = actionGeometry
      ? extractGestureFeatures(actionGeometry, worldGeometry)
      : null;
    const candidate = features
      ? this.classifier.classify(features, this.stabilizer.lockedGesture)
      : null;
    const stabilized = this.stabilizer.update(candidate, nowMs, features !== null);
    const events: Partial<GestureOutput> = {};

    if (cursorGeometry) {
      this.lastCursor = cursorGeometry.landmarks[INDEX_FINGER_TIP] ?? this.lastCursor;
    }

    if (stabilized.released !== null) {
      if (stabilized.released === "left" && features?.pinchDepthReliable) {
        events.click = true;
      }
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
    this.recordTrace(landmarks, worldLandmarks, output, features, nowMs);
    return output;
  }

  getTrace(): GestureTrace {
    return this.trace.snapshot();
  }

  serializeTrace(): string {
    return this.trace.serialize();
  }

  private deriveState(stabilized: GestureStabilizerOutput, inputValid: boolean): GestureState {
    const visibleGesture = stabilized.lockedGesture ?? (
      stabilized.phase === "candidate" ? stabilized.candidate : null
    );
    if (visibleGesture === "left") return "left-pinching";
    if (visibleGesture === "open-palm") return stabilized.lockedGesture ? "paused" : "tracking";
    return inputValid ? "tracking" : "lost";
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
      phase: stabilized.phase,
      candidate: stabilized.candidate,
      lockedGesture: stabilized.lockedGesture,
      confirmationProgress: stabilized.confirmationProgress,
      diagnostics: diagnosticsFor(features, nowMs),
      ...events,
    };
  }

  private recordTrace(
    landmarks: Landmark[] | null,
    worldLandmarks: Landmark[] | null,
    output: GestureOutput,
    features: GestureFeatures | null,
    nowMs: number,
  ): void {
    if (this.traceEpochMs === null || nowMs < this.traceEpochMs) this.traceEpochMs = nowMs;
    const relativeTimestamp = Math.max(this.lastTraceTimestamp, nowMs - this.traceEpochMs);
    this.lastTraceTimestamp = relativeTimestamp;
    const events: TraceGestureEvent[] = [];
    if (output.click) events.push("click");

    this.trace.push({
      t: relativeTimestamp,
      landmarks,
      worldLandmarks,
      quality: features ? 1 : 0,
      features: features ? {
        leftPinchRatio: features.leftPinchRatio,
        worldLeftPinchRatio: features.worldLeftPinchRatio,
        pinchDepthReliable: features.pinchDepthReliable,
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
    worldLeftPinchRatio: features?.worldLeftPinchRatio ?? null,
    pinchDepthReliable: features?.pinchDepthReliable ?? false,
    rightPinchRatio: features?.rightPinchRatio ?? null,
    doublePinchRatio: features?.doublePinchRatio ?? null,
    openPalmScore: features?.openPalmScore ?? null,
    scrollPoseScore: features?.scrollPoseScore ?? null,
  };
}
