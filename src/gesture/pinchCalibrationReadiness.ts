import { DEFAULT_PINCH_BOUNDARIES } from "./config";
import type { PinchCalibrationSample } from "./pinchCalibration";

export const PINCH_CALIBRATION_STABLE_FRAMES = 4;

const FALSE_OVERLAP_SAFETY_GAP = 0.08;
const PERSONAL_CONTACT_LIMITS = {
  image: 0.39,
  world: 0.45,
  depth: 0.24,
} as const;
const MAX_SPREAD = {
  image: 0.035,
  world: 0.05,
  depth: 0.04,
} as const;

export type PinchCalibrationCaptureStage = "front" | "side" | "negative";
export type PinchCalibrationReadinessState = "blocked" | "stabilizing" | "ready";
export type PinchCalibrationReadinessReason =
  | "no-hand"
  | "contact-image"
  | "contact-world"
  | "contact-depth"
  | "negative-overlap"
  | "negative-world"
  | "negative-depth"
  | "unstable"
  | "stabilizing"
  | "ready";
type PinchCalibrationCorrectionReason = Exclude<
  PinchCalibrationReadinessReason,
  "no-hand" | "stabilizing" | "unstable" | "ready"
>;
export type PinchCalibrationReadinessCheckKey = "image" | "world" | "depth" | "stability";

export type PinchCalibrationReadinessCheck = {
  key: PinchCalibrationReadinessCheckKey;
  label: string;
  passed: boolean;
  value: number;
  threshold: number;
  comparison: "at-most" | "at-least" | "frames";
};

export type PinchCalibrationReadiness = {
  state: PinchCalibrationReadinessState;
  reason: PinchCalibrationReadinessReason;
  title: string;
  detail: string;
  checks: PinchCalibrationReadinessCheck[];
  stableFrames: number;
  requiredStableFrames: number;
};

type ReadinessInput = {
  stage: PinchCalibrationCaptureStage;
  recentSamples: PinchCalibrationSample[];
  positives: PinchCalibrationSample[];
};

type SampleCriteria = {
  imageThreshold: number;
  worldThreshold: number;
  depthThreshold: number;
  imageComparison: "at-most";
  worldComparison: "at-most" | "at-least";
  depthComparison: "at-most" | "at-least";
};

export function evaluatePinchCalibrationReadiness({
  stage,
  recentSamples,
  positives,
}: ReadinessInput): PinchCalibrationReadiness {
  const window = recentSamples.slice(-PINCH_CALIBRATION_STABLE_FRAMES);
  const current = window.at(-1);
  if (!current) {
    return result(
      "blocked",
      "no-hand",
      "未检测到完整手部",
      "把整只手放入画面，并确保拇指和食指都清晰可见。",
      [],
      0,
    );
  }

  const criteria = criteriaFor(stage, positives);
  const checks = checksFor(current, criteria, 0, false);
  const failedReason = firstFailedReason(stage, checks);
  if (failedReason) {
    const copy = COPY[failedReason];
    return result("blocked", failedReason, copy.title, copy.detail, checks, 0);
  }

  const consecutiveValid = consecutiveValidSamples(window, criteria);
  if (consecutiveValid.length < PINCH_CALIBRATION_STABLE_FRAMES) {
    const stableFrames = consecutiveValid.length;
    return result(
      "stabilizing",
      "stabilizing",
      `保持姿势稳定 ${stableFrames}/${PINCH_CALIBRATION_STABLE_FRAMES}`,
      "动作方向正确，请短暂保持不动。",
      checksFor(current, criteria, stableFrames, false),
      stableFrames,
    );
  }

  if (!isStable(consecutiveValid)) {
    const unstableChecks = checksFor(
      current,
      criteria,
      PINCH_CALIBRATION_STABLE_FRAMES,
      false,
    );
    return result(
      "blocked",
      "unstable",
      "动作波动过大，请保持不动",
      "固定手腕和手指位置，等数值稳定后再记录。",
      unstableChecks,
      PINCH_CALIBRATION_STABLE_FRAMES,
    );
  }

  return result(
    "ready",
    "ready",
    "可以记录",
    "当前动作已连续稳定，可以保存这一组样本。",
    checksFor(current, criteria, PINCH_CALIBRATION_STABLE_FRAMES, true),
    PINCH_CALIBRATION_STABLE_FRAMES,
  );
}

export function medianPinchCalibrationSample(
  samples: PinchCalibrationSample[],
): PinchCalibrationSample {
  if (samples.length === 0) {
    throw new TypeError("Cannot calculate a calibration sample from an empty window");
  }
  return {
    imageRatio: median(samples.map((sample) => sample.imageRatio)),
    worldRatio: median(samples.map((sample) => sample.worldRatio)),
    depthGap: median(samples.map((sample) => sample.depthGap)),
  };
}

function criteriaFor(
  stage: PinchCalibrationCaptureStage,
  positives: PinchCalibrationSample[],
): SampleCriteria {
  if (stage !== "negative") {
    return {
      imageThreshold: PERSONAL_CONTACT_LIMITS.image,
      worldThreshold: PERSONAL_CONTACT_LIMITS.world,
      depthThreshold: PERSONAL_CONTACT_LIMITS.depth,
      imageComparison: "at-most",
      worldComparison: "at-most",
      depthComparison: "at-most",
    };
  }

  const imageContact = fittedContactBoundary(positives, "imageRatio", DEFAULT_PINCH_BOUNDARIES.imageContact);
  const worldContact = fittedContactBoundary(positives, "worldRatio", DEFAULT_PINCH_BOUNDARIES.worldContact);
  const depthContact = fittedContactBoundary(positives, "depthGap", DEFAULT_PINCH_BOUNDARIES.depthContact);
  return {
    imageThreshold: Math.min(
      DEFAULT_PINCH_BOUNDARIES.imageSeparate,
      imageContact + FALSE_OVERLAP_SAFETY_GAP,
    ),
    worldThreshold: worldContact + FALSE_OVERLAP_SAFETY_GAP,
    depthThreshold: depthContact + FALSE_OVERLAP_SAFETY_GAP,
    imageComparison: "at-most",
    worldComparison: "at-least",
    depthComparison: "at-least",
  };
}

function fittedContactBoundary(
  samples: PinchCalibrationSample[],
  key: keyof PinchCalibrationSample,
  fallback: number,
): number {
  return samples.length === 0
    ? fallback
    : quantile(samples.map((sample) => sample[key]), 0.9) * 1.08;
}

function checksFor(
  current: PinchCalibrationSample,
  criteria: SampleCriteria,
  stableFrames: number,
  stabilityPassed: boolean,
): PinchCalibrationReadinessCheck[] {
  return [
    {
      key: "image",
      label: "画面距离",
      passed: current.imageRatio <= criteria.imageThreshold,
      value: current.imageRatio,
      threshold: criteria.imageThreshold,
      comparison: criteria.imageComparison,
    },
    {
      key: "world",
      label: "三维距离",
      passed: compare(current.worldRatio, criteria.worldThreshold, criteria.worldComparison),
      value: current.worldRatio,
      threshold: criteria.worldThreshold,
      comparison: criteria.worldComparison,
    },
    {
      key: "depth",
      label: "前后深度",
      passed: compare(current.depthGap, criteria.depthThreshold, criteria.depthComparison),
      value: current.depthGap,
      threshold: criteria.depthThreshold,
      comparison: criteria.depthComparison,
    },
    {
      key: "stability",
      label: "稳定帧",
      passed: stabilityPassed,
      value: stableFrames,
      threshold: PINCH_CALIBRATION_STABLE_FRAMES,
      comparison: "frames",
    },
  ];
}

function firstFailedReason(
  stage: PinchCalibrationCaptureStage,
  checks: PinchCalibrationReadinessCheck[],
): PinchCalibrationCorrectionReason | null {
  const failed = new Set(checks.filter((check) => !check.passed).map((check) => check.key));
  if (stage === "negative") {
    if (failed.has("image")) return "negative-overlap";
    if (failed.has("world")) return "negative-world";
    if (failed.has("depth")) return "negative-depth";
    return null;
  }
  if (failed.has("image")) return "contact-image";
  if (failed.has("world")) return "contact-world";
  if (failed.has("depth")) return "contact-depth";
  return null;
}

function consecutiveValidSamples(
  samples: PinchCalibrationSample[],
  criteria: SampleCriteria,
): PinchCalibrationSample[] {
  const result: PinchCalibrationSample[] = [];
  for (let index = samples.length - 1; index >= 0; index -= 1) {
    const current = samples[index]!;
    if (!samplePasses(current, criteria)) break;
    result.unshift(current);
  }
  return result;
}

function samplePasses(current: PinchCalibrationSample, criteria: SampleCriteria): boolean {
  return current.imageRatio <= criteria.imageThreshold
    && compare(current.worldRatio, criteria.worldThreshold, criteria.worldComparison)
    && compare(current.depthGap, criteria.depthThreshold, criteria.depthComparison);
}

function compare(value: number, threshold: number, comparison: "at-most" | "at-least"): boolean {
  return comparison === "at-most" ? value <= threshold : value >= threshold;
}

function isStable(samples: PinchCalibrationSample[]): boolean {
  return spread(samples.map((sample) => sample.imageRatio)) <= MAX_SPREAD.image
    && spread(samples.map((sample) => sample.worldRatio)) <= MAX_SPREAD.world
    && spread(samples.map((sample) => sample.depthGap)) <= MAX_SPREAD.depth;
}

function spread(values: number[]): number {
  return Math.max(...values) - Math.min(...values);
}

function result(
  state: PinchCalibrationReadinessState,
  reason: PinchCalibrationReadinessReason,
  title: string,
  detail: string,
  checks: PinchCalibrationReadinessCheck[],
  stableFrames: number,
): PinchCalibrationReadiness {
  return {
    state,
    reason,
    title,
    detail,
    checks,
    stableFrames,
    requiredStableFrames: PINCH_CALIBRATION_STABLE_FRAMES,
  };
}

const COPY: Record<
  PinchCalibrationCorrectionReason,
  { title: string; detail: string }
> = {
  "contact-image": {
    title: "让拇指和食指真正接触",
    detail: "从画面中看，两指尖距离仍然偏大。请让指腹轻碰。",
  },
  "contact-world": {
    title: "让拇指和食指真正接触",
    detail: "两指的实际空间距离仍然偏大，请让指腹真实接触。",
  },
  "contact-depth": {
    title: "让两指处于同一前后位置",
    detail: "两指存在明显前后错位，请对齐后让指腹真实接触。",
  },
  "negative-overlap": {
    title: "让两指尖在画面中重合",
    detail: "保持实际不接触，同时从摄像头正面看让两指尖重合。",
  },
  "negative-world": {
    title: "增加两指的实际空间距离",
    detail: "两指虽然看似重合，但实际距离还不够，请再分开一些。",
  },
  "negative-depth": {
    title: "增加两指的前后距离",
    detail: "沿摄像头前后方向把两指分开 2–3 厘米，并保持画面重合。",
  },
};

function quantile(values: number[], probability: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.ceil(probability * sorted.length) - 1);
  return sorted[index]!;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1]! + sorted[middle]!) / 2
    : sorted[middle]!;
}
