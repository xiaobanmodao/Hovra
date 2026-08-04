import { useEffect, useState } from "react";

import {
  fitPinchCalibration,
  type PinchCalibrationProfile,
  type PinchCalibrationSample,
} from "../gesture/pinchCalibration";
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

  useEffect(() => {
    if (stage !== "baseline") return;
    const timer = window.setTimeout(() => setStage("front"), 3_000);
    return () => window.clearTimeout(timer);
  }, [stage]);

  const recordContact = () => {
    if (!currentSample) return;
    if (stage === "front") {
      const next = [...front, currentSample];
      setFront(next);
      if (next.length >= 5) setStage("side");
    } else if (stage === "side") {
      const next = [...side, currentSample];
      setSide(next);
      if (next.length >= 5) setStage("negative");
    }
  };

  const recordNegative = () => {
    if (!currentSample || stage !== "negative") return;
    const next = [...negative, currentSample];
    setNegative(next);
    if (next.length < 3) return;
    try {
      const profile = fitPinchCalibration({
        positives: [...front, ...side],
        negatives: next,
        baselineNoise: [0.02],
      });
      setStage("complete");
      onComplete(profile);
    } catch {
      setStage("error");
    }
  };

  const unavailable = currentSample === null;
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
          unavailable={unavailable}
          buttonLabel="记录当前接触"
          onRecord={recordContact}
        />
      )}
      {stage === "side" && (
        <SampleStep
          stage="side"
          count={side.length}
          total={5}
          unavailable={unavailable}
          buttonLabel="记录当前接触"
          onRecord={recordContact}
        />
      )}
      {stage === "negative" && (
        <SampleStep
          stage="negative"
          count={negative.length}
          total={3}
          unavailable={unavailable}
          buttonLabel="记录当前未接触样本"
          onRecord={recordNegative}
        />
      )}
      {stage === "complete" && <p role="status">校准完成，个人点击参数已启用。</p>}
      {stage === "error" && <p role="alert">样本区分度不足，未保存配置，请重新校准。</p>}
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
  unavailable,
  buttonLabel,
  onRecord,
}: {
  stage: Exclude<CalibrationGuideStage, "baseline">;
  count: number;
  total: number;
  unavailable: boolean;
  buttonLabel: string;
  onRecord: () => void;
}) {
  return (
    <div aria-live="polite">
      <CalibrationGestureGuide stage={stage} />
      <p>已记录 {count}/{total}</p>
      <button type="button" disabled={unavailable} onClick={onRecord}>{buttonLabel}</button>
      {unavailable && <p>请先把手完整放入画面</p>}
    </div>
  );
}
