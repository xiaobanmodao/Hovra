import { DEFAULT_GESTURE_SETTINGS } from "./config";
import {
  GestureTraceBuffer,
  type GestureTraceV5,
  type TraceGestureEvent,
} from "./gestureTrace";
import {
  measureStableHand,
  resolveStablePinchThresholds,
  type StableHandMetrics,
} from "./stableHandMetrics";
import { OneEuroPointFilter } from "./oneEuroFilter";
import {
  PinchClickStateMachine,
  type PinchClickOutput,
} from "./pinchClickStateMachine";
import type {
  GestureDiagnosticsSnapshot,
  GestureKind,
  GestureOutput,
  GesturePhase,
  GestureSettings,
  GestureState,
  Landmark,
} from "./types";

const OPEN_PALM_ENTER_FRAMES = 3;
const OPEN_PALM_EXIT_FRAMES = 2;

export class GestureEngine {
  private readonly settings: GestureSettings;
  private readonly pinch: PinchClickStateMachine;
  private readonly cursorFilter: OneEuroPointFilter;
  private readonly trace = new GestureTraceBuffer();
  private openPalmEnterFrames = 0;
  private openPalmExitFrames = 0;
  private openPalmPaused = false;
  private lastUpdateMs: number | null = null;
  private lastFrameIntervalMs: number | null = null;
  private traceEpochMs: number | null = null;
  private lastTraceTimestamp = 0;

  constructor(
    settings: GestureSettings = DEFAULT_GESTURE_SETTINGS,
    _legacyPinchBoundaries?: unknown,
  ) {
    this.settings = { ...settings };
    this.pinch = new PinchClickStateMachine({
      requiredContactFrames: settings.pinchContactFrames,
      requiredReleaseFrames: settings.pinchReleaseFrames,
      maxCursorSpeed: settings.maxClickSpeed,
      maxTravel: settings.maxClickTravel,
    });
    const smoothing = Math.min(1, Math.max(0, settings.cursorSmoothingFactor));
    this.cursorFilter = new OneEuroPointFilter({
      minCutoff: 0.75 + smoothing * 1.5,
      beta: 0.12 + smoothing * 0.3,
    });
  }

  update(
    landmarks: Landmark[] | null,
    nowMs: number,
    worldLandmarks: Landmark[] | null = null,
    inferenceMs: number | null = null,
    imageAspectRatio = 1,
    _legacySecondaryObservation: unknown = null,
  ): GestureOutput {
    const monotonic = Number.isFinite(nowMs)
      && (this.lastUpdateMs === null || nowMs >= this.lastUpdateMs);
    if (monotonic && this.lastUpdateMs !== null && nowMs > this.lastUpdateMs) {
      this.lastFrameIntervalMs = nowMs - this.lastUpdateMs;
    }
    if (Number.isFinite(nowMs)) this.lastUpdateMs = nowMs;

    const metrics = monotonic
      ? measureStableHand(
        landmarks,
        imageAspectRatio,
        this.settings.gestureSensitivity,
        resolveStablePinchThresholds(this.settings),
      )
      : null;
    const output = metrics
      ? this.updateValidHand(metrics, nowMs, inferenceMs, imageAspectRatio)
      : this.updateMissingHand(nowMs, inferenceMs, imageAspectRatio);
    this.recordTrace(landmarks, worldLandmarks, metrics, output, nowMs, inferenceMs, imageAspectRatio);
    return output;
  }

  getTrace(): GestureTraceV5 {
    return this.trace.snapshot();
  }

  serializeTrace(): string {
    return this.trace.serialize();
  }

  private updateValidHand(
    metrics: StableHandMetrics,
    nowMs: number,
    inferenceMs: number | null,
    imageAspectRatio: number,
  ): GestureOutput {
    this.updateOpenPalm(metrics.openPalmCandidate);

    const filteredCursor = this.cursorFilter.filter(metrics.cursor, nowMs);
    const suppressed = this.openPalmEnterFrames > 0 || this.openPalmPaused || metrics.fistCandidate;
    const intentEvidence = {
      contact: metrics.pinchContact,
      separated: metrics.pinchSeparated,
      blockingReason: metrics.pinchBlockingReason,
      cursor: filteredCursor,
      motionCursor: metrics.motionCursor,
      suppressed,
    } as const;
    const pinch = this.pinch.update(intentEvidence, nowMs);

    if (this.openPalmPaused) {
      return this.output({
        state: "paused",
        cursor: filteredCursor,
        click: false,
        clickCursor: null,
        intentEvidence,
        phase: "active",
        candidate: null,
        lockedGesture: "open-palm",
        confirmationProgress: 1,
        diagnostics: this.diagnostics(metrics, pinch, nowMs, inferenceMs, imageAspectRatio),
      });
    }
    const openPalmCandidate = this.openPalmEnterFrames > 0;
    const state: GestureState = pinch.phase === "candidate"
      || pinch.phase === "active"
      || pinch.phase === "releasing"
      ? "left-pinching" : "tracking";
    const phase: GesturePhase = openPalmCandidate ? "candidate" : pinch.phase;
    const candidate: GestureKind | null = openPalmCandidate
      ? "open-palm"
      : pinch.phase === "candidate" ? "left" : null;
    const confirmationProgress = openPalmCandidate
      ? this.openPalmEnterFrames / OPEN_PALM_ENTER_FRAMES
      : pinch.phase === "candidate"
        ? pinch.contactFrames / pinch.requiredContactFrames
        : pinch.active ? 1 : 0;

    return this.output({
      state,
      cursor: filteredCursor,
      click: pinch.clicked && !openPalmCandidate,
      clickCursor: pinch.clickCursor,
      intentEvidence,
      phase,
      candidate,
      lockedGesture: pinch.active ? "left" : null,
      confirmationProgress,
      diagnostics: this.diagnostics(metrics, pinch, nowMs, inferenceMs, imageAspectRatio),
    });
  }

  private updateMissingHand(
    nowMs: number,
    inferenceMs: number | null,
    imageAspectRatio: number,
  ): GestureOutput {
    const pinch = this.pinch.update(null, nowMs);
    this.cursorFilter.reset();
    this.openPalmEnterFrames = 0;
    this.openPalmExitFrames = 0;
    this.openPalmPaused = false;
    return this.output({
      state: "lost",
      cursor: null,
      click: false,
      clickCursor: null,
      intentEvidence: null,
      phase: "lost",
      candidate: null,
      lockedGesture: null,
      confirmationProgress: 0,
      diagnostics: this.diagnostics(null, pinch, nowMs, inferenceMs, imageAspectRatio),
    });
  }

  private updateOpenPalm(candidate: boolean): void {
    if (this.openPalmPaused) {
      if (candidate) {
        this.openPalmExitFrames = 0;
        return;
      }
      this.openPalmExitFrames += 1;
      if (this.openPalmExitFrames >= OPEN_PALM_EXIT_FRAMES) {
        this.openPalmPaused = false;
        this.openPalmEnterFrames = 0;
        this.openPalmExitFrames = 0;
      }
      return;
    }

    this.openPalmExitFrames = 0;
    this.openPalmEnterFrames = candidate ? this.openPalmEnterFrames + 1 : 0;
    if (this.openPalmEnterFrames >= OPEN_PALM_ENTER_FRAMES) {
      this.openPalmPaused = true;
      this.openPalmEnterFrames = OPEN_PALM_ENTER_FRAMES;
      this.pinch.reset();
    }
  }

  private diagnostics(
    metrics: StableHandMetrics | null,
    pinch: PinchClickOutput | null,
    nowMs: number,
    inferenceMs: number | null,
    imageAspectRatio: number,
  ): GestureDiagnosticsSnapshot {
    const pinchProbability = metrics ? closeness(
      metrics.spatialPinchRatio,
      metrics.pinchEnterRatio,
      metrics.pinchExitRatio,
    ) : null;
    return {
      timestampMs: Number.isFinite(nowMs) ? nowMs : 0,
      quality: metrics ? 1 : 0,
      palmScale: metrics?.palmScale ?? null,
      screenPinchGap: metrics?.screenPinchGap ?? null,
      imageAspectRatio: sanitizeAspectRatio(imageAspectRatio),
      worldPalmScale: null,
      palmFacingScore: null,
      leftPinchRatio: metrics?.spatialPinchRatio ?? null,
      worldLeftPinchRatio: null,
      pinchDepthReliable: metrics?.depthReliable ?? false,
      rightPinchRatio: null,
      doublePinchRatio: null,
      openPalmScore: metrics?.openPalmScore ?? null,
      scrollPoseScore: null,
      pinchProbability,
      pinchImageDepthGap: metrics?.depthPinchRatio ?? null,
      pinchWorldQuality: 0,
      pinchQualityReasons: [],
      pinchBlockingReason: metrics?.pinchBlockingReason ?? null,
      pinchEnterVotes: pinch?.contactFrames ?? 0,
      pinchRequiredVotes: pinch?.requiredContactFrames ?? 2,
      effectiveFps: this.lastFrameIntervalMs && this.lastFrameIntervalMs > 0
        ? 1_000 / this.lastFrameIntervalMs : null,
      inferenceMs: inferenceMs !== null && Number.isFinite(inferenceMs) ? Math.max(0, inferenceMs) : null,
      pinchModelMode: "mediapipe",
      visionPinchRatio: null,
      visionConfidence: null,
      visionAgeMs: null,
      visionInferenceMs: null,
      modelAgreement: null,
      pinchScreenRatio: metrics?.screenPinchRatio ?? null,
      pinchSpatialRatio: metrics?.spatialPinchRatio ?? null,
      pinchEnterRatio: metrics?.pinchEnterRatio ?? null,
      pinchExitRatio: metrics?.pinchExitRatio ?? null,
      cursorSpeed: pinch?.cursorSpeed ?? null,
      clickBlockingReason: pinch?.blockingReason ?? null,
      fistCandidate: metrics?.fistCandidate ?? false,
    };
  }

  private output(input: {
    state: GestureState;
    cursor: Landmark | null;
    click: boolean;
    clickCursor: Landmark | null;
    intentEvidence: import("./pinchClickStateMachine").PinchClickEvidence | null;
    phase: GesturePhase;
    candidate: GestureKind | null;
    lockedGesture: GestureKind | null;
    confirmationProgress: number;
    diagnostics: GestureDiagnosticsSnapshot;
  }): GestureOutput {
    return {
      ...input,
      rightClick: false,
      doubleClick: false,
      scrollY: 0,
      dragStart: false,
      dragEnd: false,
    };
  }

  private recordTrace(
    landmarks: Landmark[] | null,
    worldLandmarks: Landmark[] | null,
    metrics: StableHandMetrics | null,
    output: GestureOutput,
    nowMs: number,
    inferenceMs: number | null,
    imageAspectRatio: number,
  ): void {
    const safeNow = Number.isFinite(nowMs) ? nowMs : this.lastTraceTimestamp;
    if (this.traceEpochMs === null || safeNow < this.traceEpochMs) this.traceEpochMs = safeNow;
    const relativeTimestamp = Math.max(this.lastTraceTimestamp, safeNow - this.traceEpochMs);
    this.lastTraceTimestamp = relativeTimestamp;
    const events: TraceGestureEvent[] = output.click ? ["click"] : [];

    this.trace.push({
      t: relativeTimestamp,
      landmarks,
      worldLandmarks,
      quality: metrics ? 1 : 0,
      features: metrics ? {
        leftPinchRatio: metrics.spatialPinchRatio,
        worldLeftPinchRatio: null,
        pinchDepthReliable: metrics.depthReliable,
        rightPinchRatio: 1,
        doublePinchRatio: 1,
        openPalmScore: metrics.openPalmScore,
        scrollPoseScore: 0,
        palmScale: metrics.palmScale,
        screenPinchGap: metrics.screenPinchGap,
        imageAspectRatio: sanitizeAspectRatio(imageAspectRatio),
        worldPalmScale: null,
        palmFacingScore: null,
        imageDepthGap: metrics.depthPinchRatio,
        worldDepthGap: null,
        approachVelocity: null,
        contactPoseScore: null,
        worldQuality: 0,
        qualityReasons: [],
        pinchProbability: output.diagnostics.pinchProbability,
        safetyGatePassed: metrics.pinchContact,
        blockingReason: metrics.pinchBlockingReason,
        enterVotes: output.diagnostics.pinchEnterVotes,
        requiredVotes: output.diagnostics.pinchRequiredVotes,
        frameIntervalMs: this.lastFrameIntervalMs,
        inferenceMs: output.diagnostics.inferenceMs,
        effectiveFps: output.diagnostics.effectiveFps,
        modelMode: "mediapipe",
        visionPinchRatio: null,
        visionConfidence: null,
        visionAgeMs: null,
        visionInferenceMs: null,
        modelsAgree: null,
      } : null,
      phase: output.phase,
      candidate: output.candidate,
      confirmationProgress: output.confirmationProgress,
      lockedGesture: output.lockedGesture,
      events,
    });
  }
}

function closeness(value: number, contact: number, separate: number): number {
  return Math.min(1, Math.max(0, (separate - value) / Math.max(1e-6, separate - contact)));
}

function sanitizeAspectRatio(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.min(3, Math.max(0.5, value)) : 1;
}
