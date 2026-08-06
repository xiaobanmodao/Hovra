import { useState } from "react";

import type { GestureOutput } from "../gesture/types";
import {
  gestureKindLabel,
  gesturePhaseLabel,
  clickBlockingReasonLabel,
  pinchBlockingReasonLabel,
} from "../i18n/zh-CN";

type GestureDiagnosticsProps = {
  output: GestureOutput;
  onSaveTrace?: () => Promise<"saved" | "cancelled">;
};

const numberOrDash = (value: number | null | undefined, precision = 3): string =>
  value == null ? "—" : value.toFixed(precision);

const trackingSourceLabel = {
  observed: "实时观测",
  predicted: "短时预测",
  lost: "已丢失",
} as const;

export function GestureDiagnostics({ output, onSaveTrace }: GestureDiagnosticsProps) {
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const diagnostics = output.diagnostics;

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
          <p className="eyebrow">识别引擎：稳定内核</p>
          <h2 id="recognition-diagnostics-title">手势诊断</h2>
        </div>
        {onSaveTrace && (
          <div className="diagnostic-actions">
            <button type="button" onClick={() => void saveTrace()}>保存诊断记录</button>
          </div>
        )}
      </div>
      <dl>
        <div><dt>阶段</dt><dd>{gesturePhaseLabel(output.phase)}</dd></div>
        <div><dt>候选动作</dt><dd>{gestureKindLabel(output.candidate)}</dd></div>
        <div><dt>锁定动作</dt><dd>{gestureKindLabel(output.lockedGesture)}</dd></div>
        <div><dt>确认进度</dt><dd>{Math.round(output.confirmationProgress * 100)}%</dd></div>
        <div><dt>追踪来源</dt><dd>{trackingSourceLabel[diagnostics.trackingSource]}</dd></div>
        <div><dt>追踪质量</dt><dd>{Math.round(diagnostics.trackingQuality * 100)}%</dd></div>
        <div><dt>异常关节点</dt><dd>{diagnostics.rejectedLandmarkCount}</dd></div>
        <div><dt>手掌尺度</dt><dd>{numberOrDash(diagnostics.palmScale)}</dd></div>
        <div><dt>滚动姿势分数</dt><dd>{numberOrDash(diagnostics.scrollPoseScore)}</dd></div>
        <div><dt>二维捏合比例</dt><dd>{numberOrDash(diagnostics.pinchScreenRatio)}</dd></div>
        <div><dt>纵深捏合比例</dt><dd>{numberOrDash(diagnostics.pinchImageDepthGap)}</dd></div>
        <div><dt>空间捏合比例</dt><dd>{numberOrDash(diagnostics.pinchSpatialRatio)}</dd></div>
        <div><dt>接触阈值</dt><dd>{numberOrDash(diagnostics.pinchEnterRatio)}</dd></div>
        <div><dt>释放阈值</dt><dd>{numberOrDash(diagnostics.pinchExitRatio)}</dd></div>
        <div><dt>纵深数据</dt><dd>{diagnostics.pinchDepthReliable ? "可用" : "不可用（禁止点击）"}</dd></div>
        <div>
          <dt>连续接触确认</dt>
          <dd>{diagnostics.pinchEnterVotes}/{diagnostics.pinchRequiredVotes}</dd>
        </div>
        <div>
          <dt>几何阻断</dt>
          <dd>{diagnostics.pinchBlockingReason === null
            ? "—"
            : pinchBlockingReasonLabel(diagnostics.pinchBlockingReason)}</dd>
        </div>
        <div><dt>整手速度</dt><dd>{diagnostics.cursorSpeed == null
          ? "—"
          : `${diagnostics.cursorSpeed.toFixed(2)} 屏/秒`}</dd></div>
        <div>
          <dt>点击安全门</dt>
          <dd>{diagnostics.clickBlockingReason == null
            ? "允许"
            : clickBlockingReasonLabel(diagnostics.clickBlockingReason)}</dd>
        </div>
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
