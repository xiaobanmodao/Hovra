import { AdaptiveLandmarkFilter } from "./adaptiveLandmarkFilter";
import {
  DEFAULT_GESTURE_SETTINGS,
  DEFAULT_PINCH_BOUNDARIES,
  type PinchBoundaries,
} from "./config";
import { GestureClassifier } from "./gestureClassifier";
import {
  DualModelPinchFusion,
  extractSecondaryPinchEvidence,
  type PinchFusionOutput,
} from "./dualModelPinchFusion";
import { extractGestureFeatures, type GestureFeatures } from "./gestureFeatures";
import { GestureStabilizer, type GestureStabilizerOutput } from "./gestureStabilizer";
import { GestureTraceBuffer, type GestureTraceV5, type TraceGestureEvent } from "./gestureTrace";
import { buildHandGeometry, buildImageHandGeometry, type HandGeometry } from "./handGeometry";
import { PinchFeatureExtractor, type PinchFrameFeatures } from "./pinchFeatures";
import {
  PinchProbabilityEstimator,
  type PinchProbabilityResult,
} from "./pinchProbability";
import { PinchQualityEstimator, type PinchQuality } from "./pinchQuality";
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
import type { AppleVisionObservation } from "../vision/appleVisionTypes";

type PinchFrameDecision = {
  temporal: PinchTemporalOutput;
  features: PinchFrameFeatures | null;
  quality: PinchQuality | null;
  probability: PinchProbabilityResult | null;
  fusion: PinchFusionOutput | null;
};

export class GestureEngine {
  private readonly settings: GestureSettings;
  private readonly filter = new AdaptiveLandmarkFilter();
  private readonly classifier: GestureClassifier;
  private readonly stabilizer = new GestureStabilizer();
  private readonly pinchFeatureExtractor = new PinchFeatureExtractor();
  private readonly pinchQualityEstimator = new PinchQualityEstimator();
  private readonly pinchProbabilityEstimator: PinchProbabilityEstimator;
  private readonly dualModelPinchFusion: DualModelPinchFusion;
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
    this.dualModelPinchFusion = new DualModelPinchFusion(pinchBoundaries);
  }

  update(
    landmarks: Landmark[] | null,
    nowMs: number,
    worldLandmarks: Landmark[] | null = null,
    inferenceMs: number | null = null,
    imageAspectRatio = 1,
    appleVisionObservation: AppleVisionObservation | null = null,
  ): GestureOutput {
    const filtered = this.filter.update(landmarks, nowMs);
    const cursorGeometry = buildImageHandGeometry(filtered, imageAspectRatio);
    const actionGeometry = buildImageHandGeometry(landmarks, imageAspectRatio);
    const worldGeometry = buildHandGeometry(worldLandmarks);
    const features = actionGeometry
      ? extractGestureFeatures(actionGeometry, worldGeometry)
      : null;
    const openPalmCandidate = features
      ? this.classifier.classify(features, this.stabilizer.lockedGesture)
      : null;
    const stabilized = this.stabilizer.update(openPalmCandidate, nowMs, features !== null);
    const pinch = actionGeometry
      ? this.updatePinch(
        actionGeometry,
        worldGeometry,
        nowMs,
        features?.palmFacingScore ?? 1,
        extractSecondaryPinchEvidence(appleVisionObservation, nowMs, imageAspectRatio),
      )
      : this.updateMissingPinch(nowMs);

    if (cursorGeometry) {
      this.lastCursor = cursorGeometry.sourceLandmarks[INDEX_FINGER_TIP] ?? this.lastCursor;
    }

    const openPalmLocked = stabilized.lockedGesture === "open-palm";
    const state = this.deriveState(stabilized, pinch.temporal, features !== null);
    const output = this.output(
      state,
      features === null ? null : this.lastCursor,
      stabilized,
      features,
      nowMs,
      inferenceMs,
      pinch,
      { click: pinch.temporal.clicked && !openPalmLocked },
    );
    this.recordTrace(landmarks, worldLandmarks, output, features, pinch, nowMs, inferenceMs);
    return output;
  }

  getTrace(): GestureTraceV5 {
    return this.trace.snapshot();
  }

  serializeTrace(): string {
    return this.trace.serialize();
  }

  private updatePinch(
    imageGeometry: HandGeometry,
    worldGeometry: HandGeometry | null,
    nowMs: number,
    palmFacingScore: number,
    secondaryEvidence: ReturnType<typeof extractSecondaryPinchEvidence>,
  ): PinchFrameDecision {
    const pinchFeatures = this.pinchFeatureExtractor.update(imageGeometry, worldGeometry, nowMs);
    const quality = this.pinchQualityEstimator.update(pinchFeatures, worldGeometry);
    const baseProbability = this.pinchProbabilityEstimator.update(pinchFeatures, quality);
    const fusion = this.dualModelPinchFusion.update(
      baseProbability,
      pinchFeatures,
      palmFacingScore,
      secondaryEvidence,
    );
    return {
      temporal: this.pinchTemporalRecognizer.update(
        fusion.probability,
        nowMs,
        fusion.strictVoting ? fusion.voteEligible : quality.usableForVoting,
        fusion.strictVoting,
      ),
      features: pinchFeatures,
      quality,
      probability: fusion.probability,
      fusion,
    };
  }

  private updateMissingPinch(nowMs: number): PinchFrameDecision {
    this.pinchFeatureExtractor.reset();
    this.pinchQualityEstimator.reset();
    this.pinchProbabilityEstimator.reset();
    this.dualModelPinchFusion.reset();
    return {
      temporal: this.pinchTemporalRecognizer.update(null, nowMs, false),
      features: null,
      quality: null,
      probability: null,
      fusion: null,
    };
  }

  private deriveState(
    stabilized: GestureStabilizerOutput,
    pinchTemporal: PinchTemporalOutput,
    inputValid: boolean,
  ): GestureState {
    if (stabilized.lockedGesture === "open-palm") return "paused";
    if (
      pinchTemporal.phase === "candidate"
      || pinchTemporal.phase === "active"
      || pinchTemporal.phase === "releasing"
    ) {
      return "left-pinching";
    }
    return inputValid ? "tracking" : "lost";
  }

  private output(
    state: GestureState,
    cursor: Landmark | null,
    stabilized: GestureStabilizerOutput,
    features: GestureFeatures | null,
    nowMs: number,
    inferenceMs: number | null,
    pinch: PinchFrameDecision,
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
      phase: stabilized.lockedGesture === "open-palm" ? stabilized.phase : pinch.temporal.phase,
      candidate: stabilized.lockedGesture === "open-palm"
        ? stabilized.candidate
        : pinch.temporal.phase === "candidate" ? "left" : null,
      lockedGesture: stabilized.lockedGesture === "open-palm"
        ? "open-palm"
        : pinch.temporal.phase === "active" || pinch.temporal.phase === "releasing" ? "left" : null,
      confirmationProgress: stabilized.lockedGesture === "open-palm"
        ? stabilized.confirmationProgress
        : pinch.temporal.confirmationProgress,
      diagnostics: diagnosticsFor(features, pinch, nowMs, inferenceMs),
      ...events,
    };
  }

  private recordTrace(
    landmarks: Landmark[] | null,
    worldLandmarks: Landmark[] | null,
    output: GestureOutput,
    features: GestureFeatures | null,
    pinch: PinchFrameDecision,
    nowMs: number,
    inferenceMs: number | null,
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
        screenPinchGap: features.screenPinchGap,
        imageAspectRatio: features.imageAspectRatio,
        worldPalmScale: features.worldPalmScale,
        palmFacingScore: features.palmFacingScore,
        imageDepthGap: pinch.features?.imageDepthGap ?? null,
        worldDepthGap: pinch.features?.worldDepthGap ?? null,
        approachVelocity: pinch.features?.approachVelocity ?? null,
        contactPoseScore: pinch.features?.contactPoseScore ?? null,
        worldQuality: pinch.quality?.score ?? 0,
        qualityReasons: pinch.quality?.reasons ?? [],
        pinchProbability: pinch.probability?.probability ?? null,
        safetyGatePassed: pinch.probability?.safetyGatePassed ?? false,
        blockingReason: pinch.probability?.blockingReason ?? null,
        enterVotes: pinch.temporal.enterVotes,
        requiredVotes: pinch.temporal.requiredVotes,
        frameIntervalMs: pinch.features?.frameIntervalMs ?? null,
        inferenceMs,
        effectiveFps: effectiveFpsFor(pinch.features?.frameIntervalMs ?? null),
        modelMode: pinch.fusion?.mode ?? "mediapipe",
        visionPinchRatio: pinch.fusion?.evidence?.ratio ?? null,
        visionConfidence: pinch.fusion?.evidence?.confidence ?? null,
        visionAgeMs: pinch.fusion?.evidence?.ageMs ?? null,
        visionInferenceMs: pinch.fusion?.evidence?.inferenceMs ?? null,
        modelsAgree: pinch.fusion?.modelsAgree ?? null,
      } : null,
      phase: output.phase,
      candidate: output.candidate,
      confirmationProgress: output.confirmationProgress,
      lockedGesture: output.lockedGesture,
      events,
    });
  }
}

function diagnosticsFor(
  features: GestureFeatures | null,
  pinch: PinchFrameDecision,
  timestampMs: number,
  inferenceMs: number | null,
): GestureDiagnosticsSnapshot {
  return {
    timestampMs,
    quality: features ? 1 : 0,
    palmScale: features?.palmScale ?? null,
    screenPinchGap: features?.screenPinchGap ?? null,
    imageAspectRatio: features?.imageAspectRatio ?? 1,
    worldPalmScale: features?.worldPalmScale ?? null,
    palmFacingScore: features?.palmFacingScore ?? null,
    leftPinchRatio: features?.leftPinchRatio ?? null,
    worldLeftPinchRatio: features?.worldLeftPinchRatio ?? null,
    pinchDepthReliable: features?.pinchDepthReliable ?? false,
    rightPinchRatio: features?.rightPinchRatio ?? null,
    doublePinchRatio: features?.doublePinchRatio ?? null,
    openPalmScore: features?.openPalmScore ?? null,
    scrollPoseScore: features?.scrollPoseScore ?? null,
    pinchProbability: pinch.probability?.probability ?? null,
    pinchImageDepthGap: pinch.features?.imageDepthGap ?? null,
    pinchWorldQuality: pinch.quality?.score ?? 0,
    pinchQualityReasons: pinch.quality?.reasons ?? [],
    pinchBlockingReason: pinch.probability?.blockingReason ?? null,
    pinchEnterVotes: pinch.temporal.enterVotes,
    pinchRequiredVotes: pinch.temporal.requiredVotes,
    effectiveFps: effectiveFpsFor(pinch.features?.frameIntervalMs ?? null),
    inferenceMs: inferenceMs !== null && Number.isFinite(inferenceMs) ? Math.max(0, inferenceMs) : null,
    pinchModelMode: pinch.fusion?.mode ?? "mediapipe",
    visionPinchRatio: pinch.fusion?.evidence?.ratio ?? null,
    visionConfidence: pinch.fusion?.evidence?.confidence ?? null,
    visionAgeMs: pinch.fusion?.evidence?.ageMs ?? null,
    visionInferenceMs: pinch.fusion?.evidence?.inferenceMs ?? null,
    modelAgreement: pinch.fusion?.modelsAgree ?? null,
  };
}

function effectiveFpsFor(frameIntervalMs: number | null): number | null {
  return frameIntervalMs !== null && frameIntervalMs > 0 && frameIntervalMs <= 1_000
    ? 1_000 / frameIntervalMs
    : null;
}
