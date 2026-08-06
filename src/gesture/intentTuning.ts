import type { IntentFeedbackEvent } from "./intentFeedback";
import {
  PinchClickStateMachine,
  resolvePinchClickConfig,
  type PinchClickConfig,
} from "./pinchClickStateMachine";

export type IntentReplayMetrics = {
  falsePositiveClicks: number;
  intentionalClicks: number;
  missedIntentionalClicks: number;
};

export type IntentTuningReport = {
  labelledEvents: number;
  unlabelledEvents: number;
  baseline: IntentReplayMetrics;
  recommendation: {
    safe: boolean;
    config: PinchClickConfig | null;
    reason: string;
    predicted: IntentReplayMetrics | null;
  };
};

const MIN_INTENTIONAL_EVENTS = 3;
const MIN_FALSE_POSITIVE_EVENTS = 2;

export function analyzeIntentFeedback(
  events: IntentFeedbackEvent[],
  currentConfig: Partial<PinchClickConfig>,
): IntentTuningReport {
  const labelled = events.filter((event) => event.label !== "unlabeled");
  const intentional = labelled.filter((event) => event.label === "intentional");
  const falsePositives = labelled.filter((event) => event.label === "false-positive");
  const baselineConfig = resolvePinchClickConfig(currentConfig);
  const baseline = replayMetrics(labelled, baselineConfig);
  const base = {
    labelledEvents: labelled.length,
    unlabelledEvents: events.length - labelled.length,
    baseline,
  };

  if (
    intentional.length < MIN_INTENTIONAL_EVENTS
    || falsePositives.length < MIN_FALSE_POSITIVE_EVENTS
  ) {
    return {
      ...base,
      recommendation: { safe: false, config: null, reason: "真实标签不足", predicted: null },
    };
  }

  const candidates = candidateConfigs(baselineConfig)
    .map((config) => ({ config, metrics: replayMetrics(labelled, config) }))
    .sort((first, second) => (
      first.metrics.falsePositiveClicks - second.metrics.falsePositiveClicks
      || first.metrics.missedIntentionalClicks - second.metrics.missedIntentionalClicks
      || second.config.maxCursorSpeed - first.config.maxCursorSpeed
      || first.config.requiredContactFrames - second.config.requiredContactFrames
    ));
  const best = candidates[0];
  const minimumRetained = Math.ceil(intentional.length * 0.8);

  if (
    !best
    || best.metrics.falsePositiveClicks >= baseline.falsePositiveClicks
    || best.metrics.intentionalClicks < minimumRetained
  ) {
    return {
      ...base,
      recommendation: {
        safe: false,
        config: null,
        reason: "离线重放无法在保留正确点击的同时减少误触",
        predicted: best?.metrics ?? null,
      },
    };
  }

  return {
    ...base,
    recommendation: {
      safe: true,
      config: best.config,
      reason: `预计误触 ${baseline.falsePositiveClicks} → ${best.metrics.falsePositiveClicks}，正确点击保留 ${best.metrics.intentionalClicks}/${intentional.length}`,
      predicted: best.metrics,
    },
  };
}

function candidateConfigs(current: PinchClickConfig): PinchClickConfig[] {
  const speeds = uniqueNumbers([
    current.maxCursorSpeed,
    3,
    2.4,
    2.2,
    2,
    1.8,
    1.6,
  ]).filter((speed) => speed <= current.maxCursorSpeed);
  const contactFrames = uniqueNumbers([current.requiredContactFrames, 3]);
  const travels = uniqueNumbers([current.maxTravel, 0.1, 0.08])
    .filter((travel) => travel <= current.maxTravel);
  const configs: PinchClickConfig[] = [];
  for (const maxCursorSpeed of speeds) {
    for (const requiredContactFrames of contactFrames) {
      for (const maxTravel of travels) {
        configs.push(resolvePinchClickConfig({
          ...current,
          maxCursorSpeed,
          requiredContactFrames,
          maxTravel,
        }));
      }
    }
  }
  return deduplicateConfigs(configs);
}

function replayMetrics(events: IntentFeedbackEvent[], config: PinchClickConfig): IntentReplayMetrics {
  let falsePositiveClicks = 0;
  let intentionalClicks = 0;
  for (const event of events) {
    const clicked = replayEvent(event, config);
    if (clicked && event.label === "false-positive") falsePositiveClicks += 1;
    if (clicked && event.label === "intentional") intentionalClicks += 1;
  }
  const intentionalTotal = events.filter((event) => event.label === "intentional").length;
  return {
    falsePositiveClicks,
    intentionalClicks,
    missedIntentionalClicks: intentionalTotal - intentionalClicks,
  };
}

function replayEvent(event: IntentFeedbackEvent, config: PinchClickConfig): boolean {
  const machine = new PinchClickStateMachine(config);
  const frames = event.frames.slice().sort((first, second) => first.t - second.t);
  const epoch = frames[0]?.t ?? 0;
  let clicked = false;
  for (const frame of frames) {
    const output = machine.update(frame.evidence, frame.t - epoch);
    clicked = clicked || output.clicked;
  }
  return clicked;
}

function uniqueNumbers(values: number[]): number[] {
  return [...new Set(values.map((value) => Number(value.toFixed(4))))];
}

function deduplicateConfigs(configs: PinchClickConfig[]): PinchClickConfig[] {
  const seen = new Set<string>();
  return configs.filter((config) => {
    const key = JSON.stringify(config);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
