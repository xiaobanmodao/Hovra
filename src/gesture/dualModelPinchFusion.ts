import type { AppleVisionObservation } from "../vision/appleVisionTypes";
import type { PinchBoundaries } from "./config";
import { buildImageHandGeometry } from "./handGeometry";
import type { PinchFrameFeatures } from "./pinchFeatures";
import type { PinchProbabilityResult } from "./pinchProbability";

const MAX_VISION_AGE_MS = 180;
const MIN_VISION_CONFIDENCE = 0.45;
const SIDE_VIEW_FACING_SCORE = 0.45;
const VISION_CONTACT_CLOSENESS = 0.72;
const VISION_SEPARATED_CLOSENESS = 0.2;
const APPROACH_VELOCITY_THRESHOLD = 0.55;
const APPROACH_MEMORY_MS = 300;
const REQUIRED_JOINTS = [0, 4, 5, 8] as const;

export type SecondaryPinchEvidence = {
  ratio: number;
  confidence: number;
  ageMs: number;
  inferenceMs: number;
  capturedAtMs: number;
};

export type PinchFusionOutput = {
  probability: PinchProbabilityResult;
  mode: "mediapipe" | "dual";
  modelsAgree: boolean | null;
  evidence: SecondaryPinchEvidence | null;
  strictVoting: boolean;
  voteEligible: boolean;
};

export function extractSecondaryPinchEvidence(
  observation: AppleVisionObservation | null,
  nowMs: number,
  imageAspectRatio: number,
): SecondaryPinchEvidence | null {
  if (!observation || !Number.isFinite(nowMs) || !Number.isFinite(observation.capturedAtMs)) return null;
  if (observation.landmarks.length !== 21 || observation.confidences.length !== 21) return null;
  const ageMs = nowMs - observation.capturedAtMs;
  if (ageMs < 0 || ageMs > MAX_VISION_AGE_MS) return null;
  const requiredConfidences = REQUIRED_JOINTS.map((index) => observation.confidences[index]);
  if (requiredConfidences.some((value) => !Number.isFinite(value) || value! < MIN_VISION_CONFIDENCE)) return null;
  const geometry = buildImageHandGeometry(observation.landmarks, imageAspectRatio);
  if (!geometry) return null;
  const confidence = Math.min(...requiredConfidences as number[]);
  return {
    ratio: geometry.pinchRatios.left,
    confidence,
    ageMs,
    inferenceMs: observation.inferenceMs,
    capturedAtMs: observation.capturedAtMs,
  };
}

export class DualModelPinchFusion {
  private previousVision: { ratio: number; capturedAtMs: number } | null = null;
  private lastVisionApproachAt: number | null = null;
  private lastCountedVisionAt: number | null = null;

  constructor(private readonly boundaries: PinchBoundaries) {}

  update(
    base: PinchProbabilityResult,
    features: PinchFrameFeatures,
    palmFacingScore: number,
    evidence: SecondaryPinchEvidence | null,
  ): PinchFusionOutput {
    if (!evidence) return this.mediaPipeOnly(base);

    const isDistinctObservation = evidence.capturedAtMs !== this.lastCountedVisionAt;
    if (isDistinctObservation) {
      this.observeApproach(evidence);
      this.lastCountedVisionAt = evidence.capturedAtMs;
    }
    const visionCloseness = closeness(
      evidence.ratio,
      this.boundaries.imageContact,
      this.boundaries.imageSeparate,
    );
    const visionApproachObserved = this.lastVisionApproachAt !== null
      && evidence.capturedAtMs - this.lastVisionApproachAt <= APPROACH_MEMORY_MS;
    if (!visionApproachObserved) this.lastVisionApproachAt = null;

    const mediaPipeContact = base.safetyGatePassed && base.probability >= base.entryThreshold;
    const visionContact = visionCloseness >= VISION_CONTACT_CLOSENESS;
    const sideView = Number.isFinite(palmFacingScore) && palmFacingScore < SIDE_VIEW_FACING_SCORE;

    if (sideView) {
      const safetyGatePassed = visionContact && visionApproachObserved;
      const approachScore = visionApproachObserved ? 1 : 0;
      const rawProbability = 0.8 * visionCloseness + 0.2 * approachScore;
      return {
        probability: {
          ...base,
          probability: safetyGatePassed
            ? clamp01(Math.max(base.entryThreshold, rawProbability))
            : Math.min(rawProbability, base.entryThreshold - 0.01),
          safetyGatePassed,
          approachObserved: visionApproachObserved,
          blockingReason: visionContact ? (visionApproachObserved ? "none" : "approach") : "vision",
        },
        mode: "dual",
        modelsAgree: mediaPipeContact === visionContact,
        evidence,
        strictVoting: true,
        voteEligible: isDistinctObservation,
      };
    }

    if (mediaPipeContact && visionCloseness < VISION_SEPARATED_CLOSENESS) {
      return {
        probability: {
          ...base,
          probability: Math.min(base.probability, base.entryThreshold - 0.01),
          safetyGatePassed: false,
          blockingReason: "vision",
        },
        mode: "dual",
        modelsAgree: false,
        evidence,
        strictVoting: false,
        voteEligible: true,
      };
    }

    return {
      probability: base,
      mode: "dual",
      modelsAgree: mediaPipeContact === visionContact,
      evidence,
      strictVoting: false,
      voteEligible: true,
    };
  }

  reset(): void {
    this.previousVision = null;
    this.lastVisionApproachAt = null;
    this.lastCountedVisionAt = null;
  }

  private observeApproach(evidence: SecondaryPinchEvidence): void {
    if (this.previousVision && evidence.capturedAtMs > this.previousVision.capturedAtMs) {
      const intervalSeconds = (evidence.capturedAtMs - this.previousVision.capturedAtMs) / 1_000;
      const velocity = (this.previousVision.ratio - evidence.ratio) / intervalSeconds;
      if (velocity >= APPROACH_VELOCITY_THRESHOLD) this.lastVisionApproachAt = evidence.capturedAtMs;
      if (evidence.capturedAtMs - this.previousVision.capturedAtMs > MAX_VISION_AGE_MS) {
        this.lastVisionApproachAt = null;
      }
    }
    this.previousVision = { ratio: evidence.ratio, capturedAtMs: evidence.capturedAtMs };
  }

  private mediaPipeOnly(base: PinchProbabilityResult): PinchFusionOutput {
    return {
      probability: base,
      mode: "mediapipe",
      modelsAgree: null,
      evidence: null,
      strictVoting: false,
      voteEligible: true,
    };
  }
}

function closeness(value: number, contact: number, separate: number): number {
  return clamp01((separate - value) / (separate - contact));
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
