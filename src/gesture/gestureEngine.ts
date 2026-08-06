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
import {
  HandTrackingStabilizer,
  type StabilizedHandFrame,
} from "./handTrackingStabilizer";
import { OneEuroPointFilter } from "./oneEuroFilter";
import {
  PinchClickStateMachine,
  type PinchClickOutput,
} from "./pinchClickStateMachine";
import {
  ScrollGestureStateMachine,
  type ScrollGestureOutput,
} from "./scrollGestureStateMachine";
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
  private readonly leftPinch: PinchClickStateMachine;
  private readonly rightPinch: PinchClickStateMachine;
  private readonly scrollGesture = new ScrollGestureStateMachine();
  private readonly cursorFilter: OneEuroPointFilter;
  private readonly handTracking = new HandTrackingStabilizer();
  private readonly trace = new GestureTraceBuffer();
  private openPalmEnterFrames = 0;
  private openPalmExitFrames = 0;
  private openPalmPaused = false;
  private lastUpdateMs: number | null = null;
  private lastFrameIntervalMs: number | null = null;
  private traceEpochMs: number | null = null;
  private lastTraceTimestamp = 0;
  private gestureLock: "left" | "right" | "scroll" | null = null;

  constructor(
    settings: GestureSettings = DEFAULT_GESTURE_SETTINGS,
    _legacyPinchBoundaries?: unknown,
  ) {
    this.settings = { ...settings };
    this.leftPinch = new PinchClickStateMachine({
      requiredContactFrames: settings.pinchContactFrames,
      requiredReleaseFrames: settings.pinchReleaseFrames,
      maxCursorSpeed: settings.maxClickSpeed,
      maxTravel: settings.maxClickTravel,
    });
    this.rightPinch = new PinchClickStateMachine({
      requiredContactFrames: Math.max(3, settings.pinchContactFrames ?? 2),
      requiredReleaseFrames: settings.pinchReleaseFrames,
      longPressMs: 650,
      holdEnabled: false,
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

    const trackingFrame = this.handTracking.update(monotonic ? landmarks : null, nowMs);
    const controlMetrics = measureStableHand(
      trackingFrame.controlLandmarks,
      imageAspectRatio,
      this.settings.gestureSensitivity,
      resolveStablePinchThresholds(this.settings),
    );
    const observedMetrics = trackingFrame.source === "observed" && trackingFrame.gestureSafe
      ? measureStableHand(
        landmarks,
        imageAspectRatio,
        this.settings.gestureSensitivity,
        resolveStablePinchThresholds(this.settings),
      )
      : null;
    const metrics = observedMetrics && controlMetrics
      ? { ...observedMetrics, cursor: controlMetrics.cursor }
      : controlMetrics;
    const output = metrics && trackingFrame.source === "observed" && trackingFrame.gestureSafe
      ? this.updateValidHand(metrics, trackingFrame, nowMs, inferenceMs, imageAspectRatio)
      : metrics && trackingFrame.source !== "lost"
        ? this.updateUnsafeHand(metrics, trackingFrame, nowMs, inferenceMs, imageAspectRatio)
        : this.updateMissingHand(trackingFrame, nowMs, inferenceMs, imageAspectRatio);
    this.recordTrace(
      landmarks,
      worldLandmarks,
      metrics,
      trackingFrame,
      output,
      nowMs,
      inferenceMs,
      imageAspectRatio,
    );
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
    trackingFrame: StabilizedHandFrame,
    nowMs: number,
    inferenceMs: number | null,
    imageAspectRatio: number,
  ): GestureOutput {
    this.updateOpenPalm(metrics.openPalmCandidate);

    const filteredCursor = this.cursorFilter.filter(metrics.cursor, nowMs);
    const postureSuppressed = this.openPalmEnterFrames > 0
      || this.openPalmPaused
      || metrics.fistCandidate;
    const ambiguousMultiPinch = metrics.pinchContact
      && metrics.rightDepthReliable
      && metrics.rightSpatialPinchRatio <= metrics.pinchEnterRatio;
    if (!this.gestureLock && !postureSuppressed) {
      if (metrics.scrollPoseContact) {
        this.gestureLock = "scroll";
      } else if (metrics.rightPinchContact) {
        this.gestureLock = "right";
      } else if (metrics.pinchContact && !ambiguousMultiPinch) {
        this.gestureLock = "left";
      }
    }
    const activeLock = this.gestureLock;
    const suppressAmbiguous = activeLock === null && ambiguousMultiPinch;
    const leftEvidence = {
      contact: metrics.pinchContact,
      separated: metrics.pinchSeparated,
      blockingReason: metrics.pinchBlockingReason,
      cursor: filteredCursor,
      motionCursor: metrics.motionCursor,
      suppressed: postureSuppressed || activeLock === "right" || activeLock === "scroll" || suppressAmbiguous,
    } as const;
    const rightEvidence = {
      contact: metrics.rightPinchContact,
      separated: metrics.rightPinchSeparated,
      blockingReason: metrics.rightPinchBlockingReason,
      cursor: filteredCursor,
      motionCursor: metrics.motionCursor,
      suppressed: postureSuppressed || activeLock === "left" || activeLock === "scroll" || suppressAmbiguous,
    } as const;
    const left = this.leftPinch.update(leftEvidence, nowMs);
    const right = this.rightPinch.update(rightEvidence, nowMs);
    const scroll = this.scrollGesture.update({
      contact: metrics.scrollPoseContact,
      retained: metrics.scrollPoseRetained,
      anchor: metrics.scrollAnchor,
      palmScale: metrics.palmScale,
      suppressed: postureSuppressed || activeLock !== "scroll",
    }, nowMs);
    const selectedPinch = activeLock === "right" ? right : activeLock === "scroll" ? null : left;
    const intentEvidence = activeLock === "right" || activeLock === "scroll" ? null : leftEvidence;

    if (activeLock && (
      activeLock === "scroll"
        ? !keepsScrollLock(scroll)
        : !keepsGestureLock(selectedPinch!)
    )) {
      this.gestureLock = null;
    }

    if (this.openPalmPaused) {
      return this.output({
        state: "paused",
        cursor: filteredCursor,
        click: false,
        rightClick: false,
        clickCursor: null,
        dragStart: false,
        dragEnd: left.holdEnded,
        intentEvidence,
        phase: "active",
        candidate: null,
        lockedGesture: "open-palm",
        confirmationProgress: 1,
        longPressProgress: left.holdProgress,
        diagnostics: this.diagnostics(
          metrics,
          left,
          right,
          scroll,
          activeLock,
          trackingFrame,
          nowMs,
          inferenceMs,
          imageAspectRatio,
        ),
      });
    }
    const openPalmCandidate = this.openPalmEnterFrames > 0;
    const state: GestureState = activeLock === "left" && left.holding
      ? "dragging"
      : activeLock === "scroll" && scroll.active
        ? "scrolling"
        : selectedPinch && (
          selectedPinch.phase === "candidate"
          || selectedPinch.phase === "active"
          || selectedPinch.phase === "releasing"
        ) ? activeLock === "right" ? "right-pinching" : "left-pinching"
        : "tracking";
    const selectedPhase: GesturePhase = activeLock === "scroll"
      ? scroll.phase
      : selectedPinch?.phase ?? "neutral";
    const phase: GesturePhase = openPalmCandidate ? "candidate" : selectedPhase;
    const candidate: GestureKind | null = openPalmCandidate
      ? "open-palm"
      : selectedPhase === "candidate" ? activeLock : null;
    const confirmationProgress = openPalmCandidate
      ? this.openPalmEnterFrames / OPEN_PALM_ENTER_FRAMES
      : activeLock === "scroll" && selectedPhase === "candidate"
        ? scroll.contactFrames / scroll.requiredContactFrames
        : selectedPinch?.phase === "candidate"
          ? selectedPinch.contactFrames / selectedPinch.requiredContactFrames
          : activeLock === "scroll" ? Number(scroll.active) : selectedPinch?.active ? 1 : 0;

    return this.output({
      state,
      cursor: filteredCursor,
      click: activeLock === "left" && left.clicked && !openPalmCandidate,
      rightClick: activeLock === "right" && right.clicked && !openPalmCandidate,
      clickCursor: selectedPinch?.clickCursor ?? selectedPinch?.holdCursor ?? null,
      scrollY: activeLock === "scroll" && !openPalmCandidate ? scroll.scrollY : 0,
      dragStart: activeLock === "left" && left.holdStarted && !openPalmCandidate,
      dragEnd: left.holdEnded,
      intentEvidence,
      phase,
      candidate,
      lockedGesture: activeLock === "scroll"
        ? scroll.active ? "scroll" : null
        : selectedPinch?.active ? activeLock : null,
      confirmationProgress,
      longPressProgress: activeLock === "left" ? left.holdProgress : 0,
      diagnostics: this.diagnostics(
        metrics,
        left,
        right,
        scroll,
        activeLock,
        trackingFrame,
        nowMs,
        inferenceMs,
        imageAspectRatio,
      ),
    });
  }

  private updateUnsafeHand(
    metrics: StableHandMetrics,
    trackingFrame: StabilizedHandFrame,
    nowMs: number,
    inferenceMs: number | null,
    imageAspectRatio: number,
  ): GestureOutput {
    const filteredCursor = this.cursorFilter.filter(metrics.cursor, nowMs);
    const activeLock = this.gestureLock;
    const left = this.leftPinch.update(null, nowMs);
    const right = this.rightPinch.update(null, nowMs);
    const scroll = this.scrollGesture.update(null, nowMs);
    this.gestureLock = null;
    const remainPaused = this.openPalmPaused;
    this.openPalmEnterFrames = remainPaused ? OPEN_PALM_ENTER_FRAMES : 0;
    this.openPalmExitFrames = 0;
    return this.output({
      state: remainPaused ? "paused" : "tracking",
      cursor: filteredCursor,
      click: false,
      rightClick: false,
      clickCursor: null,
      dragStart: false,
      dragEnd: left.holdEnded,
      intentEvidence: null,
      phase: remainPaused ? "active" : "neutral",
      candidate: null,
      lockedGesture: remainPaused ? "open-palm" : null,
      confirmationProgress: remainPaused ? 1 : 0,
      longPressProgress: 0,
      diagnostics: this.diagnostics(
        metrics,
        left,
        right,
        scroll,
        activeLock,
        trackingFrame,
        nowMs,
        inferenceMs,
        imageAspectRatio,
      ),
    });
  }

  private updateMissingHand(
    trackingFrame: StabilizedHandFrame,
    nowMs: number,
    inferenceMs: number | null,
    imageAspectRatio: number,
  ): GestureOutput {
    const activeLock = this.gestureLock;
    const left = this.leftPinch.update(null, nowMs);
    const right = this.rightPinch.update(null, nowMs);
    const scroll = this.scrollGesture.update(null, nowMs);
    this.gestureLock = null;
    this.cursorFilter.reset();
    this.openPalmEnterFrames = 0;
    this.openPalmExitFrames = 0;
    this.openPalmPaused = false;
    return this.output({
      state: "lost",
      cursor: null,
      click: false,
      rightClick: false,
      clickCursor: null,
      dragStart: false,
      dragEnd: left.holdEnded,
      intentEvidence: null,
      phase: "lost",
      candidate: null,
      lockedGesture: null,
      confirmationProgress: 0,
      longPressProgress: 0,
      diagnostics: this.diagnostics(
        null,
        left,
        right,
        scroll,
        activeLock,
        trackingFrame,
        nowMs,
        inferenceMs,
        imageAspectRatio,
      ),
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
      this.leftPinch.reset();
      this.rightPinch.reset();
      this.scrollGesture.reset();
      this.gestureLock = null;
    }
  }

  private diagnostics(
    metrics: StableHandMetrics | null,
    left: PinchClickOutput | null,
    right: PinchClickOutput | null,
    scroll: ScrollGestureOutput | null,
    activeLock: "left" | "right" | "scroll" | null,
    trackingFrame: StabilizedHandFrame,
    nowMs: number,
    inferenceMs: number | null,
    imageAspectRatio: number,
  ): GestureDiagnosticsSnapshot {
    const selectedMetrics = activeLock === "right" && metrics
      ? {
        spatialRatio: metrics.rightSpatialPinchRatio,
        screenRatio: metrics.rightScreenPinchRatio,
        depthRatio: metrics.rightDepthPinchRatio,
        blockingReason: metrics.rightPinchBlockingReason,
      }
      : metrics ? {
        spatialRatio: metrics.spatialPinchRatio,
        screenRatio: metrics.screenPinchRatio,
        depthRatio: metrics.depthPinchRatio,
        blockingReason: metrics.pinchBlockingReason,
      } : null;
    const selectedPinch = activeLock === "right" ? right : activeLock === "scroll" ? null : left;
    const pinchProbability = activeLock !== "scroll" && metrics && selectedMetrics ? closeness(
      selectedMetrics.spatialRatio,
      metrics.pinchEnterRatio,
      metrics.pinchExitRatio,
    ) : null;
    return {
      timestampMs: Number.isFinite(nowMs) ? nowMs : 0,
      quality: trackingFrame.quality,
      trackingSource: trackingFrame.source,
      trackingQuality: trackingFrame.quality,
      rejectedLandmarkCount: trackingFrame.rejectedIndices.length,
      palmScale: metrics?.palmScale ?? null,
      screenPinchGap: metrics?.screenPinchGap ?? null,
      imageAspectRatio: sanitizeAspectRatio(imageAspectRatio),
      worldPalmScale: null,
      palmFacingScore: null,
      leftPinchRatio: metrics?.spatialPinchRatio ?? null,
      worldLeftPinchRatio: null,
      pinchDepthReliable: metrics?.depthReliable ?? false,
      rightPinchRatio: metrics?.rightSpatialPinchRatio ?? null,
      doublePinchRatio: null,
      openPalmScore: metrics?.openPalmScore ?? null,
      scrollPoseScore: metrics?.scrollPoseScore ?? null,
      pinchProbability,
      pinchImageDepthGap: selectedMetrics?.depthRatio ?? null,
      pinchWorldQuality: 0,
      pinchQualityReasons: [],
      pinchBlockingReason: selectedMetrics?.blockingReason ?? null,
      pinchEnterVotes: activeLock === "scroll"
        ? scroll?.contactFrames ?? 0
        : selectedPinch?.contactFrames ?? 0,
      pinchRequiredVotes: activeLock === "scroll"
        ? scroll?.requiredContactFrames ?? 5
        : selectedPinch?.requiredContactFrames ?? 2,
      effectiveFps: this.lastFrameIntervalMs && this.lastFrameIntervalMs > 0
        ? 1_000 / this.lastFrameIntervalMs : null,
      inferenceMs: inferenceMs !== null && Number.isFinite(inferenceMs) ? Math.max(0, inferenceMs) : null,
      pinchModelMode: "mediapipe",
      visionPinchRatio: null,
      visionConfidence: null,
      visionAgeMs: null,
      visionInferenceMs: null,
      modelAgreement: null,
      pinchScreenRatio: selectedMetrics?.screenRatio ?? null,
      pinchSpatialRatio: selectedMetrics?.spatialRatio ?? null,
      pinchEnterRatio: metrics?.pinchEnterRatio ?? null,
      pinchExitRatio: metrics?.pinchExitRatio ?? null,
      cursorSpeed: selectedPinch?.cursorSpeed ?? null,
      clickBlockingReason: selectedPinch?.blockingReason ?? null,
      fistCandidate: metrics?.fistCandidate ?? false,
    };
  }

  private output(input: {
    state: GestureState;
    cursor: Landmark | null;
    click: boolean;
    rightClick: boolean;
    clickCursor: Landmark | null;
    scrollY?: number;
    dragStart: boolean;
    dragEnd: boolean;
    intentEvidence: import("./pinchClickStateMachine").PinchClickEvidence | null;
    phase: GesturePhase;
    candidate: GestureKind | null;
    lockedGesture: GestureKind | null;
    confirmationProgress: number;
    longPressProgress: number;
    diagnostics: GestureDiagnosticsSnapshot;
  }): GestureOutput {
    return {
      ...input,
      doubleClick: false,
      scrollY: input.scrollY ?? 0,
    };
  }

  private recordTrace(
    landmarks: Landmark[] | null,
    worldLandmarks: Landmark[] | null,
    metrics: StableHandMetrics | null,
    trackingFrame: StabilizedHandFrame,
    output: GestureOutput,
    nowMs: number,
    inferenceMs: number | null,
    imageAspectRatio: number,
  ): void {
    const safeNow = Number.isFinite(nowMs) ? nowMs : this.lastTraceTimestamp;
    if (this.traceEpochMs === null || safeNow < this.traceEpochMs) this.traceEpochMs = safeNow;
    const relativeTimestamp = Math.max(this.lastTraceTimestamp, safeNow - this.traceEpochMs);
    this.lastTraceTimestamp = relativeTimestamp;
    const events: TraceGestureEvent[] = [];
    if (output.click) events.push("click");
    if (output.rightClick) events.push("rightClick");
    if (output.scrollY !== 0) events.push("scroll");
    if (output.dragStart) events.push("dragStart");
    if (output.dragEnd) events.push("dragEnd");

    this.trace.push({
      t: relativeTimestamp,
      landmarks,
      worldLandmarks,
      quality: trackingFrame.quality,
      features: metrics ? {
        leftPinchRatio: metrics.spatialPinchRatio,
        worldLeftPinchRatio: null,
        pinchDepthReliable: metrics.depthReliable,
        rightPinchRatio: metrics.rightSpatialPinchRatio,
        doublePinchRatio: 1,
        openPalmScore: metrics.openPalmScore,
        scrollPoseScore: metrics.scrollPoseScore,
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
        safetyGatePassed: trackingFrame.gestureSafe && (
          output.lockedGesture === "scroll"
            ? metrics.scrollPoseRetained
            : output.lockedGesture === "right"
            ? metrics.rightPinchContact
            : metrics.pinchContact
        ),
        blockingReason: output.diagnostics.pinchBlockingReason,
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

function keepsGestureLock(output: PinchClickOutput): boolean {
  return output.phase === "candidate"
    || output.phase === "active"
    || output.phase === "dragging"
    || output.phase === "releasing";
}

function keepsScrollLock(output: ScrollGestureOutput): boolean {
  return output.phase === "candidate"
    || output.phase === "active"
    || output.phase === "releasing";
}

function closeness(value: number, contact: number, separate: number): number {
  return Math.min(1, Math.max(0, (separate - value) / Math.max(1e-6, separate - contact)));
}

function sanitizeAspectRatio(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.min(3, Math.max(0.5, value)) : 1;
}
