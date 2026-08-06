import { describe, expect, it } from "vitest";

import type { StabilitySample, StabilityScenario } from "./stabilityTest";
import { analyzeStabilitySamples } from "./stabilityTuning";

const positiveScenarios: StabilityScenario[] = ["front", "left", "right", "near", "far"];

function completeSamples(contactRatio = 0.25, separateRatio = 0.62): StabilitySample[] {
  const samples: StabilitySample[] = [];
  let t = 0;
  positiveScenarios.forEach((scenario) => {
    for (let repetition = 1; repetition <= 4; repetition += 1) {
      samples.push({ t, label: "separate", scenario, repetition, clicked: false, locked: false,
        pinchRatio: separateRatio, screenRatio: separateRatio, depthRatio: 0.1, palmScale: 0.2,
        effectiveFps: 30, inferenceMs: 7 });
      t += 50;
      samples.push({ t, label: "contact", scenario, repetition, clicked: false, locked: false,
        pinchRatio: contactRatio, screenRatio: contactRatio, depthRatio: 0.03, palmScale: 0.2,
        effectiveFps: 30, inferenceMs: 8 });
      t += 50;
      samples.push({ t, label: "contact", scenario, repetition, clicked: true, locked: true,
        pinchRatio: contactRatio, screenRatio: contactRatio, depthRatio: 0.03, palmScale: 0.2,
        effectiveFps: 30, inferenceMs: 8 });
      t += 50;
    }
  });
  (["overlap", "fist", "open-palm", "fast-move"] as StabilityScenario[]).forEach((scenario) => {
    samples.push({ t, label: "separate", scenario, repetition: null, clicked: false, locked: false,
      pinchRatio: separateRatio, screenRatio: 0.1, depthRatio: 0.5, palmScale: 0.2,
      effectiveFps: 30, inferenceMs: 9 });
    t += 50;
  });
  return samples;
}

describe("stability tuning", () => {
  it("从覆盖完整且分离的样本生成有迟滞的安全建议", () => {
    const report = analyzeStabilitySamples(completeSamples(), { enterRatio: 0.33, exitRatio: 0.5 });
    expect(report.metrics).toMatchObject({ positives: 20, truePositives: 20, falsePositives: 0, duplicateClicks: 0, recall: 1 });
    expect(report.recommendation.safe).toBe(true);
    expect(report.recommendation.enterRatio).toBeGreaterThan(0.25);
    expect(report.recommendation.enterRatio).toBeLessThan(0.62);
    expect(report.recommendation.exitRatio).toBeGreaterThan(report.recommendation.enterRatio!);
  });

  it("正负距离分布重叠时拒绝自动调优", () => {
    const report = analyzeStabilitySamples(completeSamples(0.36, 0.34), { enterRatio: 0.33, exitRatio: 0.5 });
    expect(report.recommendation).toMatchObject({ safe: false, reason: "正负样本边界重叠" });
  });

  it("样本方向不全或存在误触时拒绝自动调优", () => {
    const missing = completeSamples().filter((sample) => sample.scenario !== "far");
    expect(analyzeStabilitySamples(missing, { enterRatio: 0.33, exitRatio: 0.5 }).recommendation.reason)
      .toBe("测试样本不足");
    const falseClick = completeSamples();
    falseClick.at(-1)!.clicked = true;
    expect(analyzeStabilitySamples(falseClick, { enterRatio: 0.33, exitRatio: 0.5 }).recommendation.reason)
      .toBe("负样本出现误触");
  });

  it("报告延迟和推理耗时的九十五分位", () => {
    const report = analyzeStabilitySamples(completeSamples(), { enterRatio: 0.33, exitRatio: 0.5 });
    expect(report.metrics.p95ActivationLatencyMs).toBe(50);
    expect(report.metrics.p95InferenceMs).toBe(9);
    expect(report.metrics.effectiveFps).toBe(30);
  });
});
