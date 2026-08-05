import type { GestureTraceV4 } from "./gestureTrace";

export type PinchBenchmarkLabel = "contact" | "separate" | "ignore";

export type PinchBenchmarkMetrics = {
  positives: number;
  truePositives: number;
  falsePositives: number;
  duplicateClicks: number;
  recall: number | null;
  p95ActivationLatencyMs: number | null;
  effectiveFps: number;
};

export function benchmarkPinchTrace(
  trace: GestureTraceV4,
  labels: ReadonlyMap<number, PinchBenchmarkLabel>,
): PinchBenchmarkMetrics {
  let positives = 0;
  let truePositives = 0;
  let falsePositives = 0;
  let duplicateClicks = 0;
  let previousLabel: PinchBenchmarkLabel | null = null;
  let activeSegment: { startedAt: number; consumed: boolean; activatedAt: number | null } | null = null;
  const activationLatencies: number[] = [];

  for (const frame of trace.frames) {
    const label = labels.get(frame.t) ?? "ignore";
    if (label === "contact" && previousLabel !== "contact") {
      positives += 1;
      activeSegment = { startedAt: frame.t, consumed: false, activatedAt: null };
    }
    if (
      label === "contact"
      && activeSegment
      && activeSegment.activatedAt === null
      && frame.lockedGesture === "left"
    ) {
      activeSegment.activatedAt = frame.t;
      activationLatencies.push(frame.t - activeSegment.startedAt);
    }

    if (frame.events.includes("click")) {
      if (!activeSegment) {
        falsePositives += 1;
      } else if (activeSegment.consumed) {
        duplicateClicks += 1;
      } else {
        activeSegment.consumed = true;
        truePositives += 1;
      }
    }
    if (label !== "ignore") previousLabel = label;
  }

  return {
    positives,
    truePositives,
    falsePositives,
    duplicateClicks,
    recall: positives === 0 ? null : truePositives / positives,
    p95ActivationLatencyMs: activationLatencies.length === 0 ? null : percentile95(activationLatencies),
    effectiveFps: effectiveFps(trace.frames.map((frame) => frame.t)),
  };
}

function percentile95(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * 0.95) - 1]!;
}

function effectiveFps(timestamps: number[]): number {
  if (timestamps.length < 2) return 0;
  const intervals = timestamps.slice(1).map((timestamp, index) => timestamp - timestamps[index]!);
  const positive = intervals.filter((interval) => interval > 0);
  if (positive.length === 0) return 0;
  const average = positive.reduce((sum, interval) => sum + interval, 0) / positive.length;
  return Number((1_000 / average).toFixed(3));
}
