import frontPinch from "../assets/pinch-calibration/front-thumb-index-contact.png";
import sidePinch from "../assets/pinch-calibration/side-thumb-index-contact.png";
import overlap from "../assets/pinch-calibration/false-overlap-separated.png";
import openPalm from "../assets/pinch-calibration/baseline-open-palm.png";
import {
  STABILITY_PROTOCOL,
  currentStabilityStep,
  type StabilitySession,
} from "../gesture/stabilityTest";
import type { StabilityReport } from "../gesture/stabilityTuning";

type Props = {
  session: StabilitySession;
  report: StabilityReport | null;
  applied: boolean;
  canStart: boolean;
  onStart: () => void;
  onCancel: () => void;
  onApply: () => void;
  onRestore: () => void;
};

const illustrations = {
  front: { src: frontPinch, alt: "拇指与食指捏合示意图" },
  side: { src: sidePinch, alt: "侧向拇指与食指捏合示意图" },
  overlap: { src: overlap, alt: "两指投影重合但不接触示意图" },
  open: { src: openPalm, alt: "手掌动作示意图" },
};

const isRunning = (phase: StabilitySession["phase"]) =>
  phase === "readiness" || phase === "positive" || phase === "negative" || phase === "analyzing";

export function StabilityTestPanel({
  session, report, applied, canStart, onStart, onCancel, onApply, onRestore,
}: Props) {
  const step = currentStabilityStep(session);
  const illustration = step ? illustrations[step.illustration] : illustrations.front;
  const positiveNumber = step?.phase === "positive"
    ? STABILITY_PROTOCOL.slice(0, session.stepIndex + 1).filter((item) => item.label === "contact").length || 1
    : 20;
  const remainingSeconds = step
    ? Math.max(0, Math.ceil((step.durationMs - session.stepElapsedMs) / 1_000))
    : session.phase === "readiness" ? Math.max(0, Math.ceil((10_000 - session.stepElapsedMs) / 1_000)) : 0;

  return (
    <section className="stability-test-panel" aria-labelledby="stability-test-title">
      <div className="stability-test-heading">
        <div>
          <p className="eyebrow">个人稳定性基准</p>
          <h2 id="stability-test-title">稳定性测试</h2>
        </div>
        {!isRunning(session.phase) && session.phase !== "complete" && (
          <button type="button" disabled={!canStart} onClick={onStart}>开始稳定性测试</button>
        )}
      </div>

      {(session.phase === "idle" || session.phase === "cancelled") && (
        <div className="stability-intro">
          <p>约 4 分钟完成 20 次多角度捏合和 4 组抗误触动作。</p>
          <p>测试期间系统鼠标会暂停，不保存摄像头画面。</p>
          {!canStart && <p role="status">请先启用摄像头并等待识别器准备就绪。</p>}
        </div>
      )}

      {isRunning(session.phase) && (
        <div className="stability-running">
          <img src={illustration.src} alt={illustration.alt} />
          <div className="stability-instruction">
            <p className="stability-progress">
              {session.phase === "readiness"
                ? "准备检查"
                : step?.phase === "positive"
                  ? `第 ${positiveNumber} 次，共 20 次`
                  : "抗误触测试"}
            </p>
            <h3>{session.phase === "readiness" ? "保持手掌完整可见" : step?.title ?? "正在分析"}</h3>
            <p>{session.phase === "readiness" ? "自然张开手掌，保持稳定" : step?.instruction ?? "正在生成结果"}</p>
            {session.phase !== "analyzing" && <strong className="stability-countdown">{remainingSeconds} 秒</strong>}
            <p className={`stability-quality ${session.quality.valid ? "is-valid" : "is-paused"}`} role="status">
              {session.quality.message}
            </p>
          </div>
          <button type="button" className="secondary-button" onClick={onCancel}>取消测试</button>
        </div>
      )}

      {session.phase === "complete" && report && (
        <div className="stability-results">
          <div className="stability-result-grid">
            <Result label="点击召回率" value={report.metrics.recall === null ? "—" : `${(report.metrics.recall * 100).toFixed(1)}%`} />
            <Result label="误触" value={`${report.metrics.falsePositives} 次`} />
            <Result label="重复点击" value={`${report.metrics.duplicateClicks} 次`} />
            <Result label="P95 响应" value={report.metrics.p95ActivationLatencyMs === null ? "—" : `${Math.round(report.metrics.p95ActivationLatencyMs)} 毫秒`} />
            <Result label="有效帧率" value={report.metrics.effectiveFps === null ? "—" : `${report.metrics.effectiveFps.toFixed(1)} 帧/秒`} />
            <Result label="推理 P95" value={report.metrics.p95InferenceMs === null ? "—" : `${report.metrics.p95InferenceMs.toFixed(1)} 毫秒`} />
          </div>
          <p className={`stability-recommendation ${report.recommendation.safe ? "is-safe" : "is-unsafe"}`} role="status">
            {report.recommendation.reason}
            {report.recommendation.safe && `：接触 ${report.recommendation.enterRatio?.toFixed(3)}，释放 ${report.recommendation.exitRatio?.toFixed(3)}`}
          </p>
          <div className="stability-actions">
            <button type="button" disabled={!report.recommendation.safe || applied} onClick={onApply}>应用推荐设置</button>
            <button type="button" className="secondary-button" disabled={!applied} onClick={onRestore}>恢复测试前设置</button>
            <button type="button" className="secondary-button" onClick={onStart}>重新测试</button>
          </div>
        </div>
      )}
    </section>
  );
}

function Result({ label, value }: { label: string; value: string }) {
  return <div><span>{label}</span><strong>{value}</strong></div>;
}
