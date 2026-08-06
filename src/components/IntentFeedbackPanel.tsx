import {
  intentFeedbackCounts,
  type IntentFeedbackEvent,
  type IntentLabel,
} from "../gesture/intentFeedback";
import type { IntentTuningReport } from "../gesture/intentTuning";

type IntentFeedbackPanelProps = {
  events: IntentFeedbackEvent[];
  report: IntentTuningReport;
  applied: boolean;
  onLabel(id: string, label: Exclude<IntentLabel, "unlabeled">): void;
  onApply(): void;
  onRestore(): void;
  onClear(): void;
};

export function IntentFeedbackPanel({
  events,
  report,
  applied,
  onLabel,
  onApply,
  onRestore,
  onClear,
}: IntentFeedbackPanelProps) {
  const counts = intentFeedbackCounts(events);
  const recent = events.at(-1) ?? null;

  return (
    <section className="intent-feedback-panel" aria-labelledby="intent-feedback-title">
      <div className="intent-feedback-heading">
        <div>
          <p className="eyebrow">不保存摄像头画面</p>
          <h2 id="intent-feedback-title">真实使用反馈</h2>
        </div>
        <button type="button" className="intent-clear" onClick={onClear} disabled={events.length === 0}>
          清空反馈记录
        </button>
      </div>

      <p className="intent-feedback-intro">
        正常使用即可。只有你明确标记的点击才参与防误触分析，未标注不会被当成正确点击。
      </p>

      <div className="intent-feedback-grid" aria-label="点击反馈统计">
        <div><span>正确点击</span><strong>正确 {counts.intentional}</strong></div>
        <div><span>误触</span><strong>误触 {counts.falsePositive}</strong></div>
        <div><span>待确认</span><strong>{counts.unlabeled} 次</strong></div>
      </div>

      <div className={`intent-recent ${recent?.label === "unlabeled" ? "is-pending" : ""}`}>
        <div>
          <strong>最近一次系统点击</strong>
          <span>{recent ? labelText(recent.label) : "尚无点击记录"}</span>
        </div>
        {recent?.label === "unlabeled" && (
          <div className="intent-label-actions">
            <button type="button" className="is-danger" onClick={() => onLabel(recent.id, "false-positive")}>
              这是误触
            </button>
            <button type="button" onClick={() => onLabel(recent.id, "intentional")}>
              这是正确点击
            </button>
          </div>
        )}
      </div>

      <div className={`intent-recommendation ${report.recommendation.safe ? "is-safe" : "is-waiting"}`}>
        <div>
          <strong>{report.recommendation.safe ? "已有安全建议" : "继续收集真实标签"}</strong>
          <p>{report.recommendation.reason}</p>
        </div>
        <div className="intent-recommendation-actions">
          <button type="button" onClick={onApply} disabled={!report.recommendation.safe}>
            应用防误触建议
          </button>
          {applied && (
            <button type="button" onClick={onRestore}>恢复应用前设置</button>
          )}
        </div>
      </div>
    </section>
  );
}

function labelText(label: IntentLabel): string {
  if (label === "intentional") return "已标记为正确点击";
  if (label === "false-positive") return "已标记为误触";
  return "未标注";
}

