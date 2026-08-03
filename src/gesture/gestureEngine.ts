import { DEFAULT_GESTURE_SETTINGS } from "./config";
import { landmarkDistance, thumbIndexDistance } from "./landmarkMetrics";
import {
  INDEX_FINGER_TIP,
  MIDDLE_FINGER_TIP,
  PINKY_TIP,
  RING_FINGER_TIP,
  WRIST,
  type GestureOutput,
  type GestureSettings,
  type GestureState,
  type Landmark,
} from "./types";

export class GestureEngine {
  private state: GestureState = "lost";
  private pinchStartedAt: number | null = null;
  private readonly settings: GestureSettings;

  constructor(settings: GestureSettings = DEFAULT_GESTURE_SETTINGS) {
    this.settings = { ...settings };
  }

  update(landmarks: Landmark[] | null, nowMs: number): GestureOutput {
    if (!landmarks) {
      const dragEnd = this.state === "dragging";
      this.state = "lost";
      this.pinchStartedAt = null;
      return this.output(null, false, false, dragEnd);
    }

    const cursor = landmarks[INDEX_FINGER_TIP] ?? null;
    if (this.isOpenPalm(landmarks)) {
      const previousState = this.state;
      this.state = "paused";
      this.pinchStartedAt = null;
      return this.output(
        cursor,
        previousState === "pinching",
        false,
        previousState === "dragging",
      );
    }

    if (this.isPinching(landmarks)) {
      if (this.pinchStartedAt === null) {
        this.pinchStartedAt = nowMs;
      }

      const shouldStartDrag = this.state !== "dragging"
        && nowMs - this.pinchStartedAt >= this.settings.dragHoldMs;
      if (shouldStartDrag) {
        this.state = "dragging";
        return this.output(cursor, false, true, false);
      }

      if (this.state !== "dragging") {
        this.state = "pinching";
      }
      return this.output(cursor, false, false, false);
    }

    const click = this.state === "pinching";
    const dragEnd = this.state === "dragging";
    this.state = "tracking";
    this.pinchStartedAt = null;
    return this.output(cursor, click, false, dragEnd);
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

  private isPinching(landmarks: Landmark[]): boolean {
    const distance = thumbIndexDistance(landmarks);
    return distance !== null && distance <= this.settings.pinchDistance;
  }

  private output(cursor: Landmark | null, click: boolean, dragStart: boolean, dragEnd: boolean): GestureOutput {
    return { state: this.state, cursor, click, dragStart, dragEnd };
  }
}
