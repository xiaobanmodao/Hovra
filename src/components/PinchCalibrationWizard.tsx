import { useEffect, useMemo, useState } from "react";

import {
  fitPinchCalibration,
  PinchCalibrationSeparationError,
  type PinchCalibrationChannel,
  type PinchCalibrationProfile,
  type PinchCalibrationSample,
} from "../gesture/pinchCalibration";
import { calibrationFailureGuidance } from "../gesture/pinchCalibrationGuidance";
import {
  evaluatePinchCalibrationReadiness,
  medianPinchCalibrationSample,
  type PinchCalibrationCaptureStage,
  type PinchCalibrationReadiness,
} from "../gesture/pinchCalibrationReadiness";
import {
  CalibrationGestureGuide,
  type CalibrationGuideStage,
} from "./CalibrationGestureGuide";

type CalibrationStage = "intro" | "baseline" | "front" | "side" | "negative" | "complete" | "error";

type PinchCalibrationWizardProps = {
  currentSample: PinchCalibrationSample | null;
  onComplete: (profile: PinchCalibrationProfile) => void;
  onCancel: () => void;
};

export function PinchCalibrationWizard({
  currentSample,
  onComplete,
  onCancel,
}: PinchCalibrationWizardProps) {
  const [stage, setStage] = useState<CalibrationStage>("intro");
  const [front, setFront] = useState<PinchCalibrationSample[]>([]);
  const [side, setSide] = useState<PinchCalibrationSample[]>([]);
  const [negative, setNegative] = useState<PinchCalibrationSample[]>([]);
  const [recentSamples, setRecentSamples] = useState<PinchCalibrationSample[]>([]);
  const [failedChannels, setFailedChannels] = useState<PinchCalibrationChannel[]>([]);

  const captureStage = isCaptureStage(stage) ? stage : null;
  const positives = useMemo(() => [...front, ...side], [front, side]);
  const readiness = useMemo(() => (
    captureStage === null
      ? null
      : evaluatePinchCalibrationReadiness({
        stage: captureStage,
        recentSamples,
        positives,
      })
  ), [captureStage, positives, recentSamples]);

  useEffect(() => {
    if (stage !== "baseline") return;
    const timer = window.setTimeout(() => setStage("front"), 3_000);
    return () => window.clearTimeout(timer);
  }, [stage]);

  useEffect(() => {
    setRecentSamples([]);
  }, [stage]);

  useEffect(() => {
    if (!currentSample) {
      setRecentSamples([]);
      return;
    }
    setRecentSamples((current) => (
      isCaptureStage(stage) ? [...current, currentSample].slice(-4) : current
    ));
  }, [currentSample]);

  const recordContact = () => {
    if (readiness?.state !== "ready") return;
    const capturedSample = medianPinchCalibrationSample(recentSamples.slice(-4));
    if (stage === "front") {
      const next = [...front, capturedSample];
      setFront(next);
      if (next.length >= 5) setStage("side");
    } else if (stage === "side") {
      const next = [...side, capturedSample];
      setSide(next);
      if (next.length >= 5) setStage("negative");
    }
    setRecentSamples([]);
  };

  const recordNegative = () => {
    if (readiness?.state !== "ready" || stage !== "negative") return;
    const capturedSample = medianPinchCalibrationSample(recentSamples.slice(-4));
    const next = [...negative, capturedSample];
    setNegative(next);
    setRecentSamples([]);
    if (next.length < 3) return;
    try {
      const profile = fitPinchCalibration({
        positives: [...front, ...side],
        negatives: next,
        baselineNoise: [0.02],
      });
      setStage("complete");
      onComplete(profile);
    } catch (error) {
      setFailedChannels(error instanceof PinchCalibrationSeparationError
        ? error.analysis.gaps.filter((gap) => !gap.pass).map((gap) => gap.channel)
        : []);
      setStage("error");
    }
  };

  return (
    <section className="pinch-calibration-wizard" aria-labelledby="pinch-calibration-title">
      <h3 id="pinch-calibration-title">个人点击校准</h3>
      {stage === "intro" && (
        <>
          <p>过程约 20 秒，只保存距离和质量数值，不保存图像或视频。</p>
          <button type="button" onClick={() => setStage("baseline")}>开始三秒基线采集</button>
        </>
      )}
      {stage === "baseline" && (
        <div aria-live="polite">
          <CalibrationGestureGuide stage="baseline" />
          <p>请自然移动手掌，正在采集三秒跟踪基线……</p>
        </div>
      )}
      {stage === "front" && (
        <SampleStep
          stage="front"
          count={front.length}
          total={5}
          readiness={readiness!}
          buttonLabel="记录当前接触"
          onRecord={recordContact}
        />
      )}
      {stage === "side" && (
        <SampleStep
          stage="side"
          count={side.length}
          total={5}
          readiness={readiness!}
          buttonLabel="记录当前接触"
          onRecord={recordContact}
        />
      )}
      {stage === "negative" && (
        <SampleStep
          stage="negative"
          count={negative.length}
          total={3}
          readiness={readiness!}
          buttonLabel="记录当前未接触样本"
          onRecord={recordNegative}
        />
      )}
      {stage === "complete" && <p role="status">校准完成，个人点击参数已启用。</p>}
      {stage === "error" && <CalibrationFailureNotice failedChannels={failedChannels} />}
      {stage !== "complete" && (
        <button type="button" className="calibration-cancel" onClick={onCancel}>取消校准</button>
      )}
    </section>
  );
}

function SampleStep({
  stage,
  count,
  total,
  readiness,
  buttonLabel,
  onRecord,
}: {
  stage: Exclude<CalibrationGuideStage, "baseline">;
  count: number;
  total: number;
  readiness: PinchCalibrationReadiness;
  buttonLabel: string;
  onRecord: () => void;
}) {
  return (
    <div className="calibration-sample-step" aria-live="polite">
      <CalibrationGestureGuide stage={stage} />
      <div className="calibration-sample-console">
        <p>已记录 {count}/{total}</p>
        <ReadinessPanel readiness={readiness} />
        <button type="button" disabled={readiness.state !== "ready"} onClick={onRecord}>
          {buttonLabel}
        </button>
      </div>
    </div>
  );
}

function ReadinessPanel({ readiness }: { readiness: PinchCalibrationReadiness }) {
  return (
    <section
      className="calibration-readiness"
      data-state={readiness.state}
      aria-live="polite"
      aria-label="实时可记录判定"
    >
      <div className="calibration-readiness-copy">
        <strong>{readiness.title}</strong>
        <p>{readiness.detail}</p>
      </div>
      {readiness.checks.length > 0 && (
        <ul className="calibration-readiness-checks">
          {readiness.checks.map((check) => (
            <li key={check.key} data-passed={check.passed ? "true" : "false"}>
              <span>{check.label}</span>
              <strong>
                {check.key === "stability" && readiness.state === "stabilizing"
                  ? `${readiness.stableFrames}/${readiness.requiredStableFrames}`
                  : check.passed ? "通过" : "未通过"}
              </strong>
              <small>{formatReadinessMeasurement(check)}</small>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function formatReadinessMeasurement(
  check: PinchCalibrationReadiness["checks"][number],
): string {
  if (check.comparison === "frames") {
    return `${check.value}/${check.threshold} 帧`;
  }
  const symbol = check.comparison === "at-most" ? "≤" : "≥";
  return `${check.value.toFixed(2)} ${symbol} ${check.threshold.toFixed(2)}`;
}

function CalibrationFailureNotice({ failedChannels }: { failedChannels: PinchCalibrationChannel[] }) {
  return (
    <div className="calibration-failure" role="alert">
      <strong>样本区分度不足，未保存配置</strong>
      {failedChannels.length > 0 ? (
        <ul>
          {calibrationFailureGuidance(failedChannels).map((guidance) => (
            <li key={guidance}>{guidance}</li>
          ))}
        </ul>
      ) : (
        <p>样本数据无效，请重新校准并等待“可以记录”后再保存。</p>
      )}
    </div>
  );
}

function isCaptureStage(stage: CalibrationStage): stage is PinchCalibrationCaptureStage {
  return stage === "front" || stage === "side" || stage === "negative";
}
