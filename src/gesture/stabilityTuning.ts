import type { StablePinchThresholds } from "./stableHandMetrics";
import type { StabilitySample, StabilityScenario } from "./stabilityTest";

export type StabilityMetrics = {
  positives: number;
  truePositives: number;
  falsePositives: number;
  duplicateClicks: number;
  recall: number | null;
  p95ActivationLatencyMs: number | null;
  effectiveFps: number | null;
  p95InferenceMs: number | null;
};

export type ScenarioResult = { trials: number; recognized: number; recall: number | null };
export type StabilityRecommendation = {
  safe: boolean;
  enterRatio: number | null;
  exitRatio: number | null;
  reason: string;
};
export type StabilityReport = {
  metrics: StabilityMetrics;
  scenarios: Partial<Record<StabilityScenario, ScenarioResult>>;
  recommendation: StabilityRecommendation;
  passed: boolean;
};

const POSITIVE_SCENARIOS: StabilityScenario[] = ["front", "left", "right", "near", "far"];

export function analyzeStabilitySamples(
  samples: readonly StabilitySample[],
  current: StablePinchThresholds,
): StabilityReport {
  const finite = samples.filter((sample) => Number.isFinite(sample.pinchRatio));
  const groups = new Map<string, StabilitySample[]>();
  for (const sample of finite) {
    if (sample.label !== "contact" || sample.repetition === null) continue;
    const key = `${sample.scenario}:${sample.repetition}`;
    groups.set(key, [...(groups.get(key) ?? []), sample]);
  }
  let truePositives = 0;
  let duplicateClicks = 0;
  const latencies: number[] = [];
  for (const frames of groups.values()) {
    const clicks = frames.filter((sample) => sample.clicked);
    if (clicks.length > 0) {
      truePositives += 1;
      duplicateClicks += Math.max(0, clicks.length - 1);
    }
    const activated = frames.find((sample) => sample.locked || sample.clicked);
    if (activated) latencies.push(Math.max(0, activated.t - frames[0]!.t));
  }
  const positives = groups.size;
  const falsePositives = finite.filter((sample) => sample.label === "separate" && sample.clicked).length;
  const fps = finite.flatMap((sample) => sample.effectiveFps !== null && Number.isFinite(sample.effectiveFps) ? [sample.effectiveFps] : []);
  const inference = finite.flatMap((sample) => sample.inferenceMs !== null && Number.isFinite(sample.inferenceMs) ? [sample.inferenceMs] : []);
  const metrics: StabilityMetrics = {
    positives, truePositives, falsePositives, duplicateClicks,
    recall: positives === 0 ? null : truePositives / positives,
    p95ActivationLatencyMs: percentile(latencies, 0.95),
    effectiveFps: fps.length === 0 ? null : median(fps),
    p95InferenceMs: percentile(inference, 0.95),
  };
  const scenarios: StabilityReport["scenarios"] = {};
  for (const scenario of POSITIVE_SCENARIOS) {
    const trials = [...groups.entries()].filter(([key]) => key.startsWith(`${scenario}:`));
    const recognized = trials.filter(([, frames]) => frames.some((sample) => sample.clicked)).length;
    scenarios[scenario] = { trials: trials.length, recognized, recall: trials.length ? recognized / trials.length : null };
  }
  const recommendation = recommendThresholds(finite, metrics, scenarios, current);
  return {
    metrics, scenarios, recommendation,
    passed: positives === 20 && (metrics.recall ?? 0) >= 0.9 && falsePositives === 0
      && duplicateClicks === 0 && (metrics.p95ActivationLatencyMs ?? Infinity) <= 150
      && (metrics.effectiveFps ?? 0) >= 24,
  };
}

function recommendThresholds(
  samples: readonly StabilitySample[],
  metrics: StabilityMetrics,
  scenarios: StabilityReport["scenarios"],
  current: StablePinchThresholds,
): StabilityRecommendation {
  if (metrics.positives < 20 || POSITIVE_SCENARIOS.some((scenario) => scenarios[scenario]?.trials !== 4)) {
    return unsafe("测试样本不足");
  }
  if (metrics.falsePositives > 0) return unsafe("负样本出现误触");
  const contact = samples.filter((sample) => sample.label === "contact").map((sample) => sample.pinchRatio);
  const separate = samples.filter((sample) => sample.label === "separate").map((sample) => sample.pinchRatio);
  const contactEdge = percentile(contact, 0.9);
  const separateEdge = percentile(separate, 0.1);
  if (contactEdge === null || separateEdge === null) return unsafe("测试样本不足");
  if (separateEdge - contactEdge < 0.08) return unsafe("正负样本边界重叠");
  const enterRatio = round(clamp((contactEdge + separateEdge) / 2, 0.24, 0.46));
  const exitRatio = round(clamp(Math.max(enterRatio + 0.12, contactEdge + 0.16), enterRatio + 0.12, 0.62));
  if (!Number.isFinite(current.enterRatio) || !Number.isFinite(current.exitRatio)) return unsafe("当前设置无效");
  return { safe: true, enterRatio, exitRatio, reason: "样本边界清晰，可安全应用" };
}

function unsafe(reason: string): StabilityRecommendation {
  return { safe: false, enterRatio: null, exitRatio: null, reason };
}
function percentile(values: number[], amount: number): number | null {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  return sorted[Math.max(0, Math.ceil(sorted.length * amount) - 1)]!;
}
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
function round(value: number): number {
  return Number(value.toFixed(3));
}
