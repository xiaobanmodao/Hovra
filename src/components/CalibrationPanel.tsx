import { useId, useState } from "react";
import type { Point } from "../cursor/cursorController";
import {
  CALIBRATION_CONTROL_METADATA,
  DEFAULT_GESTURE_SETTINGS,
  type CalibrationControlMetadata,
} from "../gesture/config";
import type { GestureSettings, GestureState } from "../gesture/types";
import type {
  PinchCalibrationProfile,
  PinchCalibrationSample,
} from "../gesture/pinchCalibration";
import { gestureStateLabel } from "../i18n/zh-CN";
import { PinchCalibrationWizard } from "./PinchCalibrationWizard";

type CalibrationPanelProps = {
  settings: GestureSettings;
  onSettingsChange: (next: GestureSettings) => void;
  pinchRatio: number | null;
  gestureState: GestureState;
  cursor: Point | null;
  currentPinchSample: PinchCalibrationSample | null;
  hasPinchCalibration: boolean;
  onPinchCalibrationComplete: (profile: PinchCalibrationProfile) => void;
  onClearPinchCalibration: () => void;
};

type SettingControlProps = {
  label: string;
  accessibleLabel: string;
  value: number;
  displayValue: string;
  min: number;
  max: number;
  onDecrease: () => void;
  onIncrease: () => void;
};

function SettingControl({
  label,
  accessibleLabel,
  value,
  displayValue,
  min,
  max,
  onDecrease,
  onIncrease,
}: SettingControlProps) {
  const labelId = useId();

  return (
    <div className="calibration-control">
      <span id={labelId}>{label}</span>
      <div className="calibration-stepper" role="group" aria-labelledby={labelId}>
        <button
          type="button"
          aria-label={`调低${accessibleLabel}`}
          disabled={value <= min}
          onClick={onDecrease}
        >
          −
        </button>
        <output aria-live="polite">{displayValue}</output>
        <button
          type="button"
          aria-label={`调高${accessibleLabel}`}
          disabled={value >= max}
          onClick={onIncrease}
        >
          +
        </button>
      </div>
    </div>
  );
}

const boundedStep = (
  value: number,
  adjustment: number,
  min: number,
  max: number,
  precision: number,
) => Math.min(max, Math.max(min, Number((value + adjustment).toFixed(precision))));

export function CalibrationPanel({
  settings,
  onSettingsChange,
  pinchRatio,
  gestureState,
  cursor,
  currentPinchSample,
  hasPinchCalibration,
  onPinchCalibrationComplete,
  onClearPinchCalibration,
}: CalibrationPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [showPinchWizard, setShowPinchWizard] = useState(false);
  const contentId = useId();

  const changeSetting = <Key extends keyof GestureSettings>(
    metadata: CalibrationControlMetadata & { key: Key },
    adjustment: number,
  ) => {
    const value = boundedStep(
      settings[metadata.key],
      adjustment,
      metadata.min,
      metadata.max,
      metadata.precision,
    );
    if (value !== settings[metadata.key]) {
      onSettingsChange({ ...settings, [metadata.key]: value });
    }
  };

  return (
    <section className="calibration-panel" aria-labelledby={`${contentId}-heading`}>
      <div className="calibration-heading">
        <div>
          <p className="eyebrow">实时诊断</p>
          <h2 id={`${contentId}-heading`}>校准</h2>
        </div>
        <button
          type="button"
          className="calibration-toggle"
          aria-controls={contentId}
          aria-expanded={isExpanded}
          aria-label={`${isExpanded ? "收起" : "展开"}校准面板`}
          onClick={() => setIsExpanded((expanded) => !expanded)}
        >
          <span aria-hidden="true">{isExpanded ? "−" : "+"}</span>
        </button>
      </div>

      <div id={contentId} className="calibration-content" hidden={!isExpanded}>
          <dl className="calibration-diagnostics">
            <div>
              <dt>画面捏合比例</dt>
              <dd>{pinchRatio === null ? "—" : pinchRatio.toFixed(3)}</dd>
            </div>
            <div>
              <dt>手势状态</dt>
              <dd>{gestureStateLabel(gestureState)}</dd>
            </div>
            <div>
              <dt>光标</dt>
              <dd>{cursor === null ? "—" : `${Math.round(cursor.x)}, ${Math.round(cursor.y)}`}</dd>
            </div>
          </dl>

          <div className="calibration-controls">
            {CALIBRATION_CONTROL_METADATA.map((metadata) => {
              const value = settings[metadata.key];
              return (
                <SettingControl
                  key={metadata.key}
                  label={metadata.label}
                  accessibleLabel={metadata.accessibleLabel}
                  value={value}
                  displayValue={`${value.toFixed(metadata.precision)}${metadata.unit ? ` ${metadata.unit}` : ""}`}
                  min={metadata.min}
                  max={metadata.max}
                  onDecrease={() => changeSetting(metadata, -metadata.step)}
                  onIncrease={() => changeSetting(metadata, metadata.step)}
                />
              );
            })}
          </div>

          <div className="pinch-calibration-entry">
            {hasPinchCalibration && <p role="status">个人点击参数已启用</p>}
            {!showPinchWizard && (
              <button type="button" onClick={() => setShowPinchWizard(true)}>
                {hasPinchCalibration ? "重新进行个人点击校准" : "开始个人点击校准"}
              </button>
            )}
            {hasPinchCalibration && !showPinchWizard && (
              <button type="button" onClick={onClearPinchCalibration}>清除个人点击参数</button>
            )}
            {showPinchWizard && (
              <PinchCalibrationWizard
                currentSample={currentPinchSample}
                onComplete={(profile) => {
                  onPinchCalibrationComplete(profile);
                  setShowPinchWizard(false);
                }}
                onCancel={() => setShowPinchWizard(false)}
              />
            )}
          </div>

          <button
            type="button"
            className="calibration-reset"
            onClick={() => {
              onSettingsChange({ ...DEFAULT_GESTURE_SETTINGS });
              onClearPinchCalibration();
            }}
          >
            恢复默认设置
          </button>
      </div>
    </section>
  );
}
