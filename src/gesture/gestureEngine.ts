import { AdaptiveLandmarkFilter } from "./adaptiveLandmarkFilter";
import {
  DEFAULT_GESTURE_SETTINGS,
  DEFAULT_PINCH_BOUNDARIES,
  type PinchBoundaries,
} from "./config";
import { GestureClassifier } from "./gestureClassifier";
import { extractGestureFeatures, type GestureFeatures } from "./gestureFeatures";
import { GestureStabilizer, type GestureStabilizerOutput } from "./gestureStabilizer";
import { GestureTraceBuffer, type GestureTrace, type TraceGestureEvent } from "./gestureTrace";
import { buildHandGeometry, type HandGeometry } from "./handGeometry";
import { PinchFeatureExtractor } from "./pinchFeatures";
import { PinchProbabilityEstimator } from "./pinchProbability";
import { PinchQualityEstimator } from "./pinchQuality";
import {
  PinchTemporalRecognizer,
  type PinchTemporalOutput,
} from "./pinchTemporalRecognizer";
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
  private readonly pinchFeatureExtractor = new PinchFeatureExtractor();
  private readonly pinchQualityEstimator = new PinchQualityEstimator();
  private readonly pinchProbabilityEstimator: PinchProbabilityEstimator;
  private readonly pinchTemporalRecognizer = new PinchTemporalRecognizer();
  private readonly trace = new GestureTraceBuffer();
  private lastCursor: Landmark | null = null;
  private traceEpochMs: number | null = null;
  private lastTraceTimestamp = 0;

  constructor(
    settings: GestureSettings = DEFAULT_GESTURE_SETTINGS,
    pinchBoundaries: PinchBoundaries = DEFAULT_PINCH_BOUNDARIES,
  ) {
    this.settings = { ...settings };
    this.classifier = new GestureClassifier(settings.gestureSensitivity);
    this.pinchProbabilityEstimator = new PinchProbabilityEstimator(
      pinchBoundaries,
      settings.gestureSensitivity,
    );
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
    const openPalmCandidate = features
      ? this.classifier.classify(features, this.stabilizer.lockedGesture)
      : null;
    const stabilized = this.stabilizer.update(openPalmCandidate, nowMs, features !== null);
    const pinch = actionGeometry
      ? this.updatePinch(actionGeometry, worldGeometry, nowMs)
      : this.updateMissingPinch(nowMs);

    if (cursorGeometry) {
      this.lastCursor = cursorGeometry.landmarks[INDEX_FINGER_TIP] ?? this.lastCursor;
    }

    const openPalmLocked = stabilized.lockedGesture === "open-palm";
    const state = this.deriveState(stabilized, pinch, features !== null);
    const output = this.output(
      state,
      features === null ? null : this.lastCursor,
      stabilized,
      pinch,
      features,
      nowMs,
      { click: pinch.clicked && !openPalmLocked },
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

  private updatePinch(
    imageGeometry: HandGeometry,
    worldGeometry: HandGeometry | null,
    nowMs: number,
  ): PinchTemporalOutput {
    const pinchFeatures = this.pinchFeatureExtractor.update(imageGeometry, worldGeometry, nowMs);
    const quality = this.pinchQualityEstimator.update(pinchFeatures, worldGeometry);
    const probability = this.pinchProbabilityEstimator.update(pinchFeatures, quality);
    return this.pinchTemporalRecognizer.update(probability, nowMs, quality.usableForVoting);
  }

  private updateMissingPinch(nowMs: number): PinchTemporalOutput {
    this.pinchFeatureExtractor.reset();
    this.pinchQualityEstimator.reset();
    this.pinchProbabilityEstimator.reset();
    return this.pinchTemporalRecognizer.update(null, nowMs, false);
  }

  private deriveState(
    stabilized: GestureStabilizerOutput,
    pinch: PinchTemporalOutput,
    inputValid: boolean,
  ): GestureState {
    if (stabilized.lockedGesture === "open-palm") return "paused";
    if (pinch.phase === "candidate" || pinch.phase === "active" || pinch.phase === "releasing") {
      return "left-pinching";
    }
    return inputValid ? "tracking" : "lost";
  }

  private output(
    state: GestureState,
    cursor: Landmark | null,
    stabilized: GestureStabilizerOutput,
    pinch: PinchTemporalOutput,
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
      phase: stabilized.lockedGesture === "open-palm" ? stabilized.phase : pinch.phase,
      candidate: stabilized.lockedGesture === "open-palm"
        ? stabilized.candidate
        : pinch.phase === "candidate" ? "left" : null,
      lockedGesture: stabilized.lockedGesture === "open-palm"
        ? "open-palm"
        : pinch.phase === "active" || pinch.phase === "releasing" ? "left" : null,
      confirmationProgress: stabilized.lockedGesture === "open-palm"
        ? stabilized.confirmationProgress
        : pinch.confirmationProgress,
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
