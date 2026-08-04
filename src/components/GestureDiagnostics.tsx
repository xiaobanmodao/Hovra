import { useState } from "react";

import type { GestureOutput } from "../gesture/types";
import { gestureKindLabel, gesturePhaseLabel } from "../i18n/zh-CN";

type GestureDiagnosticsProps = {
  output: GestureOutput;
  onSaveTrace?: () => Promise<"saved" | "cancelled">;
};

const numberOrDash = (value: number | null, precision = 3): string =>
  value === null ? "—" : value.toFixed(precision);

export function GestureDiagnostics({ output, onSaveTrace }: GestureDiagnosticsProps) {
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

  return (
    <section className="recognition-diagnostics" aria-labelledby="recognition-diagnostics-title">
      <div className="recognition-diagnostics-heading">
        <div>
          <p className="eyebrow">识别引擎 V2</p>
          <h2 id="recognition-diagnostics-title">手势诊断</h2>
        </div>
        {onSaveTrace && (
          <button type="button" onClick={() => void saveTrace()}>
            保存诊断记录
          </button>
        )}
      </div>
      <dl>
        <div><dt>阶段</dt><dd>{gesturePhaseLabel(output.phase)}</dd></div>
        <div><dt>候选动作</dt><dd>{gestureKindLabel(output.candidate)}</dd></div>
        <div><dt>锁定动作</dt><dd>{gestureKindLabel(output.lockedGesture)}</dd></div>
        <div><dt>确认进度</dt><dd>{progressQuarter}/4</dd></div>
        <div><dt>手掌尺度</dt><dd>{numberOrDash(diagnostics.palmScale)}</dd></div>
        <div>
          <dt>捏合比例（左 / 右 / 双）</dt>
          <dd>{[diagnostics.leftPinchRatio, diagnostics.rightPinchRatio, diagnostics.doublePinchRatio]
            .map((value) => numberOrDash(value)).join(" / ")}</dd>
        </div>
        <div><dt>世界捏合比例</dt><dd>{numberOrDash(diagnostics.worldLeftPinchRatio)}</dd></div>
        <div><dt>深度验证</dt><dd>{diagnostics.pinchDepthReliable ? "可靠" : "不可用"}</dd></div>
        <div><dt>滚动评分</dt><dd>{numberOrDash(diagnostics.scrollPoseScore)}</dd></div>
        <div><dt>质量</dt><dd>{Math.round(diagnostics.quality * 100)}%</dd></div>
      </dl>
      {saveStatus && <p className="trace-save-status" role="status">{saveStatus}</p>}
    </section>
  );
}
