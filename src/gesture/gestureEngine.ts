import { DRAG_HOLD_MS, OPEN_PALM_MIN_TIP_DISTANCE, PINCH_DISTANCE } from "./config";
import {
  INDEX_FINGER_TIP,
  MIDDLE_FINGER_TIP,
  PINKY_TIP,
  RING_FINGER_TIP,
  THUMB_TIP,
  WRIST,
  type GestureOutput,
  type GestureState,
  type Landmark,
} from "./types";

const distanceBetween = (first: Landmark, second: Landmark): number =>
  Math.hypot(first.x - second.x, first.y - second.y, (first.z ?? 0) - (second.z ?? 0));

export class GestureEngine {
  private state: GestureState = "lost";
  private pinchStartedAt: number | null = null;

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

      const shouldStartDrag = this.state !== "dragging" && nowMs - this.pinchStartedAt >= DRAG_HOLD_MS;
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
      (tip) => tip !== undefined && distanceBetween(wrist, tip) > OPEN_PALM_MIN_TIP_DISTANCE,
    );
  }

  private isPinching(landmarks: Landmark[]): boolean {
    const thumb = landmarks[THUMB_TIP];
    const index = landmarks[INDEX_FINGER_TIP];
    return Boolean(thumb && index) && distanceBetween(thumb, index) <= PINCH_DISTANCE;
  }

  private output(cursor: Landmark | null, click: boolean, dragStart: boolean, dragEnd: boolean): GestureOutput {
    return { state: this.state, cursor, click, dragStart, dragEnd };
  }
}
