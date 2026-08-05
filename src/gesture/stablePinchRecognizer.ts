import type { PinchBlockingReason } from "./pinchProbability";
import type { GesturePhase } from "./types";

export type StablePinchEvidence = {
  contact: boolean;
  separated: boolean;
  blockingReason: PinchBlockingReason;
};

export type StablePinchOutput = {
  phase: GesturePhase;
  clicked: boolean;
  active: boolean;
  contactFrames: number;
  requiredContactFrames: number;
  releaseFrames: number;
  blockingReason: PinchBlockingReason | null;
};

const REQUIRED_CONTACT_FRAMES = 2;
const REQUIRED_RELEASE_FRAMES = 2;
const MAX_CONTIGUOUS_FRAME_GAP_MS = 120;

export class StablePinchRecognizer {
  private phase: GesturePhase = "neutral";
  private armed = true;
  private contactFrames = 0;
  private releaseFrames = 0;
  private lastTimestampMs: number | null = null;

  update(evidence: StablePinchEvidence | null, nowMs: number): StablePinchOutput {
    if (!Number.isFinite(nowMs) || (this.lastTimestampMs !== null && nowMs < this.lastTimestampMs)) {
      this.contactFrames = 0;
      this.releaseFrames = 0;
      this.phase = "lost";
      return this.output(false, null);
    }

    if (this.lastTimestampMs !== null && nowMs - this.lastTimestampMs > MAX_CONTIGUOUS_FRAME_GAP_MS) {
      this.contactFrames = 0;
      this.releaseFrames = 0;
      this.phase = "neutral";
    }
    this.lastTimestampMs = nowMs;

    if (!evidence) {
      this.contactFrames = 0;
      this.releaseFrames = 0;
      this.phase = "lost";
      return this.output(false, null);
    }

    if (evidence.contact) {
      this.releaseFrames = 0;
      if (!this.armed) {
        this.phase = "active";
        return this.output(false, evidence.blockingReason);
      }

      this.contactFrames += 1;
      if (this.contactFrames >= REQUIRED_CONTACT_FRAMES) {
        this.contactFrames = REQUIRED_CONTACT_FRAMES;
        this.armed = false;
        this.phase = "active";
        return this.output(true, evidence.blockingReason);
      }

      this.phase = "candidate";
      return this.output(false, evidence.blockingReason);
    }

    this.contactFrames = 0;
    if (!this.armed) {
      if (evidence.separated) this.releaseFrames += 1;
      else this.releaseFrames = 0;

      if (this.releaseFrames >= REQUIRED_RELEASE_FRAMES) {
        this.releaseFrames = 0;
        this.armed = true;
        this.phase = "neutral";
      } else {
        this.phase = "releasing";
      }
      return this.output(false, evidence.blockingReason);
    }

    this.releaseFrames = 0;
    this.phase = "neutral";
    return this.output(false, evidence.blockingReason);
  }

  reset(): void {
    this.phase = "neutral";
    this.armed = true;
    this.contactFrames = 0;
    this.releaseFrames = 0;
    this.lastTimestampMs = null;
  }

  private output(
    clicked: boolean,
    blockingReason: PinchBlockingReason | null,
  ): StablePinchOutput {
    return {
      phase: this.phase,
      clicked,
      active: !this.armed,
      contactFrames: this.contactFrames,
      requiredContactFrames: REQUIRED_CONTACT_FRAMES,
      releaseFrames: this.releaseFrames,
      blockingReason,
    };
  }
}
