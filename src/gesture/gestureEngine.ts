import { DEFAULT_GESTURE_SETTINGS } from "./config";
import { landmarkDistance } from "./landmarkMetrics";
import {
  INDEX_FINGER_PIP,
  INDEX_FINGER_TIP,
  MIDDLE_FINGER_PIP,
  MIDDLE_FINGER_TIP,
  PINKY_PIP,
  PINKY_TIP,
  RING_FINGER_PIP,
  RING_FINGER_TIP,
  THUMB_TIP,
  WRIST,
  type GestureOutput,
  type GestureSettings,
  type GestureState,
  type Landmark,
} from "./types";

type PinchKind = "left" | "right" | "double";

const PINCH_STATES: Record<PinchKind, GestureState> = {
  left: "left-pinching",
  right: "right-pinching",
  double: "double-pinching",
};

const SCROLL_SCALE = 100;
const MAX_SCROLL_STEP = 12;
const SCROLL_DEAD_ZONE = 0.01;
const FINGER_EXTENSION_DISTANCE = 0.06;

export class GestureEngine {
  private state: GestureState = "lost";
  private pinchStartedAt: number | null = null;
  private activePinch: PinchKind | null = null;
  private scrollReferenceY: number | null = null;
  private readonly settings: GestureSettings;

  constructor(settings: GestureSettings = DEFAULT_GESTURE_SETTINGS) {
    this.settings = { ...settings };
  }

  update(landmarks: Landmark[] | null, nowMs: number): GestureOutput {
    if (!landmarks) {
      const dragEnd = this.state === "dragging";
      this.state = "lost";
      this.resetGestureTracking();
      return this.output(null, { dragEnd });
    }

    const cursor = landmarks[INDEX_FINGER_TIP] ?? null;
    const pinch = this.detectPinch(landmarks);

    if (this.state === "dragging") {
      if (pinch === "left") {
        this.scrollReferenceY = null;
        return this.output(cursor);
      }

      this.state = this.classifyReleasedState(landmarks);
      this.resetGestureTracking();
      return this.output(cursor, { dragEnd: true });
    }

    if (pinch) {
      this.scrollReferenceY = null;
      if (this.activePinch !== pinch) {
        this.activePinch = pinch;
        this.pinchStartedAt = nowMs;
      }

      if (
        pinch === "left"
        && this.pinchStartedAt !== null
        && nowMs - this.pinchStartedAt >= this.settings.dragHoldMs
      ) {
        this.state = "dragging";
        return this.output(cursor, { dragStart: true });
      }

      this.state = PINCH_STATES[pinch];
      return this.output(cursor);
    }

    const releasedAction = this.releaseAction();
    this.activePinch = null;
    this.pinchStartedAt = null;

    if (this.isScrollPose(landmarks)) {
      const referenceY = landmarks[WRIST]?.y;
      this.state = "scrolling";
      if (referenceY === undefined) {
        this.scrollReferenceY = null;
        return this.output(cursor, releasedAction);
      }

      const scrollY = this.scrollReferenceY === null
        ? 0
        : this.scrollStep(this.scrollReferenceY - referenceY);
      this.scrollReferenceY = referenceY;
      return this.output(cursor, { ...releasedAction, scrollY });
    }

    this.scrollReferenceY = null;
    this.state = this.isOpenPalm(landmarks) ? "paused" : "tracking";
    return this.output(cursor, releasedAction);
  }

  private isOpenPalm(landmarks: Landmark[]): boolean {
    const wrist = landmarks[WRIST];
    const fingertips = [
      landmarks[INDEX_FINGER_TIP],
      landmarks[MIDDLE_FINGER_TIP],
      landmarks[RING_FINGER_TIP],
      landmarks[PINKY_TIP],
    ];

    return Boolean(wrist) && fingertips.every(
      (tip) => tip !== undefined && landmarkDistance(wrist, tip) > this.settings.openPalmMinTipDistance,
    );
  }

  private detectPinch(landmarks: Landmark[]): PinchKind | null {
    const thumb = landmarks[THUMB_TIP];
    if (!thumb) {
      return null;
    }

    const candidates: Array<{ kind: PinchKind; tip: Landmark | undefined }> = [
      { kind: "left", tip: landmarks[INDEX_FINGER_TIP] },
      { kind: "right", tip: landmarks[MIDDLE_FINGER_TIP] },
      { kind: "double", tip: landmarks[RING_FINGER_TIP] },
    ];

    let nearest: { kind: PinchKind; distance: number } | null = null;
    for (const candidate of candidates) {
      if (!candidate.tip) {
        continue;
      }
      const distance = landmarkDistance(thumb, candidate.tip);
      if (
        distance <= this.settings.pinchDistance
        && (nearest === null || distance < nearest.distance)
      ) {
        nearest = { kind: candidate.kind, distance };
      }
    }
    return nearest?.kind ?? null;
  }

  private isScrollPose(landmarks: Landmark[]): boolean {
    const indexPip = landmarks[INDEX_FINGER_PIP];
    const indexTip = landmarks[INDEX_FINGER_TIP];
    const middlePip = landmarks[MIDDLE_FINGER_PIP];
    const middleTip = landmarks[MIDDLE_FINGER_TIP];
    const ringPip = landmarks[RING_FINGER_PIP];
    const ringTip = landmarks[RING_FINGER_TIP];
    const pinkyPip = landmarks[PINKY_PIP];
    const pinkyTip = landmarks[PINKY_TIP];

    return Boolean(
      indexPip && indexTip
      && middlePip && middleTip
      && ringPip && ringTip
      && pinkyPip && pinkyTip
      && indexPip.y - indexTip.y >= FINGER_EXTENSION_DISTANCE
      && middlePip.y - middleTip.y >= FINGER_EXTENSION_DISTANCE
      && ringTip.y - ringPip.y >= FINGER_EXTENSION_DISTANCE
      && pinkyTip.y - pinkyPip.y >= FINGER_EXTENSION_DISTANCE,
    );
  }

  private classifyReleasedState(landmarks: Landmark[]): GestureState {
    if (this.isScrollPose(landmarks)) {
      return "scrolling";
    }
    return this.isOpenPalm(landmarks) ? "paused" : "tracking";
  }

  private releaseAction(): Partial<GestureOutput> {
    return {
      click: this.state === "left-pinching",
      rightClick: this.state === "right-pinching",
      doubleClick: this.state === "double-pinching",
    };
  }

  private scrollStep(deltaY: number): number {
    if (Math.abs(deltaY) < SCROLL_DEAD_ZONE) {
      return 0;
    }
    return Math.max(
      -MAX_SCROLL_STEP,
      Math.min(MAX_SCROLL_STEP, Math.round(deltaY * SCROLL_SCALE)),
    );
  }

  private resetGestureTracking(): void {
    this.pinchStartedAt = null;
    this.activePinch = null;
    this.scrollReferenceY = null;
  }

  private output(
    cursor: Landmark | null,
    events: Partial<Omit<GestureOutput, "state" | "cursor">> = {},
  ): GestureOutput {
    return {
      state: this.state,
      cursor,
      click: false,
      rightClick: false,
      doubleClick: false,
      scrollY: 0,
      dragStart: false,
      dragEnd: false,
      ...events,
    };
  }
}
