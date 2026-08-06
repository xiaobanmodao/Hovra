import type { GestureOutput } from "./types";

export type StabilityPhase =
  | "idle" | "readiness" | "positive" | "negative"
  | "analyzing" | "complete" | "cancelled";
export type StabilityLabel = "contact" | "separate" | "ignore";
export type StabilityScenario =
  | "front" | "left" | "right" | "near" | "far"
  | "overlap" | "fist" | "open-palm" | "fast-move";

export type StabilityStep = {
  phase: "positive" | "negative";
  scenario: StabilityScenario;
  label: StabilityLabel;
  title: string;
  instruction: string;
  durationMs: number;
  repetition?: number;
  illustration: "front" | "side" | "overlap" | "open";
};

export type StabilityQuality = { valid: boolean; message: string };
export type StabilitySample = {
  t: number;
  label: StabilityLabel;
  scenario: StabilityScenario;
  repetition: number | null;
  clicked: boolean;
  locked: boolean;
  pinchRatio: number;
  screenRatio: number | null;
  depthRatio: number | null;
  palmScale: number;
  effectiveFps: number | null;
  inferenceMs: number | null;
};

export type StabilityObservation = {
  nowMs: number;
  output: GestureOutput;
  handPresent: boolean;
  pageFocused: boolean;
};

export type StabilitySession = {
  phase: StabilityPhase;
  startedAt: number;
  lastObservedAt: number | null;
  stepIndex: number;
  stepElapsedMs: number;
  samples: StabilitySample[];
  quality: StabilityQuality;
};

const positiveSteps = (scenario: Extract<StabilityScenario, "front" | "left" | "right" | "near" | "far">, title: string): StabilityStep[] =>
  Array.from({ length: 4 }, (_, index) => {
    const common = { phase: "positive" as const, scenario, repetition: index + 1, title };
    const illustration = scenario === "left" || scenario === "right" ? "side" as const : "front" as const;
    return [
      { ...common, label: "separate" as const, instruction: "拇指与食指自然分开", durationMs: 1_500, illustration },
      { ...common, label: "ignore" as const, instruction: "现在缓慢捏合", durationMs: 700, illustration },
      { ...common, label: "contact" as const, instruction: "拇指与食指轻触并保持", durationMs: 1_600, illustration },
      { ...common, label: "ignore" as const, instruction: "现在缓慢松开", durationMs: 700, illustration },
      { ...common, label: "separate" as const, instruction: "保持两指完全分开", durationMs: 1_500, illustration },
    ];
  }).flat();

const negativeStep = (
  scenario: Extract<StabilityScenario, "overlap" | "fist" | "open-palm" | "fast-move">,
  title: string,
  instruction: string,
  illustration: StabilityStep["illustration"],
): StabilityStep => ({ phase: "negative", scenario, label: "separate", title, instruction, durationMs: 15_000, illustration });

export const STABILITY_PROTOCOL: readonly StabilityStep[] = [
  ...positiveSteps("front", "正面捏合"),
  ...positiveSteps("left", "向左侧转动手掌"),
  ...positiveSteps("right", "向右侧转动手掌"),
  ...positiveSteps("near", "近距离捏合"),
  ...positiveSteps("far", "远距离捏合"),
  negativeStep("overlap", "投影重合但不接触", "让两指在画面中重合，但前后保持分开", "overlap"),
  negativeStep("fist", "握拳抗误触", "自然握拳并轻微转动", "open"),
  negativeStep("open-palm", "张掌抗误触", "张开手掌并保持", "open"),
  negativeStep("fast-move", "快速移动抗误触", "保持两指分开，左右快速移动手掌", "front"),
];

const READINESS_MS = 10_000;
const MAX_SAMPLES = 9_000;

export function createStabilitySession(nowMs: number): StabilitySession {
  const startedAt = Number.isFinite(nowMs) ? nowMs : 0;
  return {
    phase: "readiness", startedAt, lastObservedAt: null, stepIndex: 0,
    stepElapsedMs: 0, samples: [], quality: { valid: false, message: "请将一只手完整放入画面" },
  };
}

export function cancelStabilitySession(session: StabilitySession): StabilitySession {
  return { ...session, phase: "cancelled" };
}

export function completeStabilitySession(session: StabilitySession): StabilitySession {
  return session.phase === "analyzing" ? { ...session, phase: "complete" } : session;
}

export function currentStabilityStep(session: StabilitySession): StabilityStep | null {
  return STABILITY_PROTOCOL[session.stepIndex] ?? null;
}

export function advanceStabilitySession(
  session: StabilitySession,
  observation: StabilityObservation,
): StabilitySession {
  if (["idle", "analyzing", "complete", "cancelled"].includes(session.phase)) return session;
  const nowMs = Number.isFinite(observation.nowMs) ? observation.nowMs : session.lastObservedAt ?? session.startedAt;
  const quality = evaluateStabilityQuality(observation);
  if (!quality.valid) return { ...session, lastObservedAt: nowMs, quality };

  const delta = session.lastObservedAt === null ? 0 : Math.max(0, Math.min(250, nowMs - session.lastObservedAt));
  if (session.phase === "readiness") {
    // During readiness, long gaps still represent observed valid time in synthetic replay and background-safe UI ticks.
    const readinessDelta = session.lastObservedAt === null ? 0 : Math.max(0, nowMs - session.lastObservedAt);
    const elapsed = session.stepElapsedMs + readinessDelta;
    return elapsed >= READINESS_MS
      ? { ...session, phase: "positive", stepElapsedMs: 0, lastObservedAt: nowMs, quality }
      : { ...session, stepElapsedMs: elapsed, lastObservedAt: nowMs, quality };
  }

  const step = currentStabilityStep(session);
  if (!step) return { ...session, phase: "analyzing", lastObservedAt: nowMs, quality };
  const sample: StabilitySample = {
    t: nowMs - session.startedAt,
    label: step.label,
    scenario: step.scenario,
    repetition: step.repetition ?? null,
    clicked: observation.output.click,
    locked: observation.output.lockedGesture === "left",
    pinchRatio: observation.output.diagnostics.pinchSpatialRatio ?? observation.output.diagnostics.leftPinchRatio ?? Number.NaN,
    screenRatio: observation.output.diagnostics.pinchScreenRatio ?? null,
    depthRatio: observation.output.diagnostics.pinchImageDepthGap,
    palmScale: observation.output.diagnostics.palmScale!,
    effectiveFps: observation.output.diagnostics.effectiveFps,
    inferenceMs: observation.output.diagnostics.inferenceMs,
  };
  const samples = [...session.samples, sample].slice(-MAX_SAMPLES);
  const elapsed = session.stepElapsedMs + delta;
  if (elapsed < step.durationMs) return { ...session, samples, stepElapsedMs: elapsed, lastObservedAt: nowMs, quality };

  const stepIndex = session.stepIndex + 1;
  const next = STABILITY_PROTOCOL[stepIndex];
  return {
    ...session, samples, stepIndex, stepElapsedMs: 0, lastObservedAt: nowMs, quality,
    phase: next ? next.phase : "analyzing",
  };
}

export function evaluateStabilityQuality(observation: StabilityObservation): StabilityQuality {
  const { diagnostics } = observation.output;
  if (!observation.pageFocused) return { valid: false, message: "窗口失去焦点，测试已暂停" };
  if (!observation.handPresent || diagnostics.quality <= 0 || diagnostics.palmScale === null) {
    return { valid: false, message: "手掌未完整进入画面" };
  }
  if (!diagnostics.pinchDepthReliable) return { valid: false, message: "纵深数据不稳定，请调整手掌角度" };
  if (diagnostics.palmScale < 0.025) return { valid: false, message: "手掌距离过远，请靠近摄像头" };
  if (diagnostics.palmScale > 0.75) return { valid: false, message: "手掌距离过近，请稍微后移" };
  if (diagnostics.effectiveFps !== null && diagnostics.effectiveFps < 24) {
    return { valid: false, message: "帧率不足，请改善光线或关闭占用摄像头的程序" };
  }
  return { valid: true, message: "采样质量良好" };
}
