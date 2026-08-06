import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import type { IntentFeedbackEvent } from "../gesture/intentFeedback";
import type { IntentTuningReport } from "../gesture/intentTuning";
import { DEFAULT_PINCH_CLICK_CONFIG } from "../gesture/pinchClickStateMachine";
import { IntentFeedbackPanel } from "./IntentFeedbackPanel";

const event = (label: IntentFeedbackEvent["label"] = "unlabeled"): IntentFeedbackEvent => ({
  id: "click-1",
  clickedAt: 100,
  clickCursor: { x: 0.4, y: 0.5 },
  label,
  frames: [],
});

const unsafeReport: IntentTuningReport = {
  labelledEvents: 0,
  unlabelledEvents: 1,
  baseline: { falsePositiveClicks: 0, intentionalClicks: 0, missedIntentionalClicks: 0 },
  recommendation: { safe: false, config: null, reason: "真实标签不足", predicted: null },
};

it("用中文让用户标记最近一次真实系统点击", () => {
  const onLabel = vi.fn();
  render(
    <IntentFeedbackPanel
      events={[event()]}
      report={unsafeReport}
      applied={false}
      onLabel={onLabel}
      onApply={vi.fn()}
      onRestore={vi.fn()}
      onClear={vi.fn()}
    />,
  );

  expect(screen.getByRole("heading", { name: "真实使用反馈" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "这是误触" }));
  expect(onLabel).toHaveBeenCalledWith("click-1", "false-positive");
  fireEvent.click(screen.getByRole("button", { name: "这是正确点击" }));
  expect(onLabel).toHaveBeenCalledWith("click-1", "intentional");
  expect(screen.getByText("未标注")).toBeInTheDocument();
});

it("样本不足时不允许应用虚假的个性化设置", () => {
  render(
    <IntentFeedbackPanel
      events={[event()]}
      report={unsafeReport}
      applied={false}
      onLabel={vi.fn()}
      onApply={vi.fn()}
      onRestore={vi.fn()}
      onClear={vi.fn()}
    />,
  );

  expect(screen.getByText("真实标签不足")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "应用防误触建议" })).toBeDisabled();
});

it("安全建议可以应用并可恢复，清空入口明确", () => {
  const onApply = vi.fn();
  const onRestore = vi.fn();
  const onClear = vi.fn();
  const safeReport: IntentTuningReport = {
    ...unsafeReport,
    labelledEvents: 5,
    unlabelledEvents: 0,
    recommendation: {
      safe: true,
      config: { ...DEFAULT_PINCH_CLICK_CONFIG, maxCursorSpeed: 2.4 },
      reason: "预计误触 2 → 0，正确点击保留 3/3",
      predicted: { falsePositiveClicks: 0, intentionalClicks: 3, missedIntentionalClicks: 0 },
    },
  };
  render(
    <IntentFeedbackPanel
      events={[event("intentional")]}
      report={safeReport}
      applied
      onLabel={vi.fn()}
      onApply={onApply}
      onRestore={onRestore}
      onClear={onClear}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "应用防误触建议" }));
  fireEvent.click(screen.getByRole("button", { name: "恢复应用前设置" }));
  fireEvent.click(screen.getByRole("button", { name: "清空反馈记录" }));
  expect(onApply).toHaveBeenCalledOnce();
  expect(onRestore).toHaveBeenCalledOnce();
  expect(onClear).toHaveBeenCalledOnce();
});

