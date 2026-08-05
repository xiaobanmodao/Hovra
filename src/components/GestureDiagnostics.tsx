import { useState } from "react";

import type { GestureOutput } from "../gesture/types";
import {
  gestureKindLabel,
  gesturePhaseLabel,
  pinchBlockingReasonLabel,
  pinchQualityReasonLabel,
} from "../i18n/zh-CN";

type GestureDiagnosticsProps = {
  output: GestureOutput;
  onSaveTrace?: () => Promise<"saved" | "cancelled">;
  onSaveHandSample?: () => Promise<"saved" | "cancelled" | "unavailable">;
};

const numberOrDash = (value: number | null | undefined, precision = 3): string =>
  value == null ? "—" : value.toFixed(precision);

const palmFacingLabel = (score: number | null): string => {
  if (score === null) return "—";
  const label = score >= 0.72 ? "正面" : score >= 0.38 ? "斜向" : "侧向";
  return `${label}（${score.toFixed(3)}）`;
};

export function GestureDiagnostics({ output, onSaveTrace, onSaveHandSample }: GestureDiagnosticsProps) {
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const diagnostics = output.diagnostics;
  const progressQuarter = Math.min(4, Math.max(0, Math.round(output.confirmationProgress * 4)));

  const saveTrace = async () => {
    setSaveStatus(null);
    try {
      const result = await onSaveTrace?.();
      setSaveStatus(result === "saved" ? "诊断记录已保存到本机" : "已取消保存");
    } catch {
      setSaveStatus("诊断记录保存失败");
    }
  };

  const saveHandSample = async () => {
    setSaveStatus(null);
    try {
      const result = await onSaveHandSample?.();
      setSaveStatus(
        result === "saved"
          ? "当前手部样本已保存到本机"
          : result === "unavailable" ? "暂无可保存的手部样本" : "已取消保存",
      );
    } catch {
      setSaveStatus("手部样本保存失败");
    }
  };

  return (
    <section className="recognition-diagnostics" aria-labelledby="recognition-diagnostics-title">
      <div className="recognition-diagnostics-heading">
        <div>
          <p className="eyebrow">识别引擎 V5</p>
          <h2 id="recognition-diagnostics-title">手势诊断</h2>
        </div>
        {onSaveTrace && (
          <div className="diagnostic-actions">
            <button type="button" onClick={() => void saveTrace()}>保存诊断记录</button>
            {onSaveHandSample && (
              <button type="button" onClick={() => void saveHandSample()}>保存当前手部样本（仅本机）</button>
            )}
          </div>
        )}
      </div>
      <dl>
        <div><dt>阶段</dt><dd>{gesturePhaseLabel(output.phase)}</dd></div>
        <div><dt>候选动作</dt><dd>{gestureKindLabel(output.candidate)}</dd></div>
        <div><dt>锁定动作</dt><dd>{gestureKindLabel(output.lockedGesture)}</dd></div>
        <div><dt>确认进度</dt><dd>{progressQuarter}/4</dd></div>
        <div><dt>手掌尺度</dt><dd>{numberOrDash(diagnostics.palmScale)}</dd></div>
        <div><dt>二维指尖间隙</dt><dd>{numberOrDash(diagnostics.screenPinchGap)}</dd></div>
        <div><dt>画面宽高比</dt><dd>{numberOrDash(diagnostics.imageAspectRatio)}</dd></div>
        <div><dt>世界手掌尺度</dt><dd>{numberOrDash(diagnostics.worldPalmScale)}</dd></div>
        <div><dt>手掌朝向</dt><dd>{palmFacingLabel(diagnostics.palmFacingScore)}</dd></div>
        <div>
          <dt>捏合比例（左 / 右 / 双）</dt>
          <dd>{[diagnostics.leftPinchRatio, diagnostics.rightPinchRatio, diagnostics.doublePinchRatio]
            .map((value) => numberOrDash(value)).join(" / ")}</dd>
        </div>
        <div><dt>世界捏合比例</dt><dd>{numberOrDash(diagnostics.worldLeftPinchRatio)}</dd></div>
        <div><dt>判定模型</dt><dd>{diagnostics.pinchModelMode === "dual" ? "双模型融合" : "MediaPipe"}</dd></div>
        <div><dt>原生模型捏合比例</dt><dd>{numberOrDash(diagnostics.visionPinchRatio)}</dd></div>
        <div><dt>原生模型置信度</dt><dd>{diagnostics.visionConfidence == null
          ? "—"
          : `${Math.round(diagnostics.visionConfidence * 100)}%`}</dd></div>
        <div><dt>原生结果年龄</dt><dd>{diagnostics.visionAgeMs == null
          ? "—"
          : `${diagnostics.visionAgeMs.toFixed(0)} 毫秒`}</dd></div>
        <div><dt>原生推理耗时</dt><dd>{diagnostics.visionInferenceMs == null
          ? "—"
          : `${diagnostics.visionInferenceMs.toFixed(1)} 毫秒`}</dd></div>
        <div><dt>模型一致性</dt><dd>{diagnostics.modelAgreement == null
          ? "—"
          : diagnostics.modelAgreement ? "一致" : "不一致（已采用安全判定）"}</dd></div>
        <div><dt>深度验证</dt><dd>{diagnostics.pinchDepthReliable ? "可靠" : "不可用"}</dd></div>
        <div><dt>滚动评分</dt><dd>{numberOrDash(diagnostics.scrollPoseScore)}</dd></div>
        <div><dt>质量</dt><dd>{Math.round(diagnostics.quality * 100)}%</dd></div>
        <div><dt>接触概率</dt><dd>{diagnostics.pinchProbability === null
          ? "—"
          : `${Math.round(diagnostics.pinchProbability * 100)}%`}</dd></div>
        <div><dt>世界坐标质量</dt><dd>{Math.round(diagnostics.pinchWorldQuality * 100)}%</dd></div>
        <div><dt>投票</dt><dd>{diagnostics.pinchEnterVotes}/{diagnostics.pinchRequiredVotes}</dd></div>
        <div><dt>质量提示</dt><dd>{diagnostics.pinchQualityReasons.length === 0
          ? "无"
          : diagnostics.pinchQualityReasons.map(pinchQualityReasonLabel).join("、")}</dd></div>
        <div><dt>阻断原因</dt><dd>{diagnostics.pinchBlockingReason === null
          ? "—"
          : pinchBlockingReasonLabel(diagnostics.pinchBlockingReason)}</dd></div>
        <div><dt>有效帧率</dt><dd>{diagnostics.effectiveFps === null
          ? "—"
          : `${diagnostics.effectiveFps.toFixed(1)} 帧/秒`}</dd></div>
        <div><dt>推理耗时</dt><dd>{diagnostics.inferenceMs === null
          ? "—"
          : `${diagnostics.inferenceMs.toFixed(1)} 毫秒`}</dd></div>
      </dl>
      {saveStatus && <p className="trace-save-status" role="status">{saveStatus}</p>}
    </section>
  );
}
