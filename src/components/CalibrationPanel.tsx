import { useId, useState } from "react";
import type { Point } from "../cursor/cursorController";
import { DEFAULT_GESTURE_SETTINGS } from "../gesture/config";
import type { GestureSettings, GestureState } from "../gesture/types";

type CalibrationPanelProps = {
  settings: GestureSettings;
  onSettingsChange: (next: GestureSettings) => void;
  pinchDistance: number | null;
  gestureState: GestureState;
  cursor: Point | null;
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
          aria-label={`Decrease ${accessibleLabel}`}
          disabled={value <= min}
          onClick={onDecrease}
        >
          −
        </button>
        <output aria-live="polite">{displayValue}</output>
        <button
          type="button"
          aria-label={`Increase ${accessibleLabel}`}
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
  pinchDistance,
  gestureState,
  cursor,
}: CalibrationPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const contentId = useId();

  const changeSetting = <Key extends keyof GestureSettings>(
    key: Key,
    adjustment: number,
    min: number,
    max: number,
    precision: number,
  ) => {
    const value = boundedStep(settings[key], adjustment, min, max, precision);
    if (value !== settings[key]) {
      onSettingsChange({ ...settings, [key]: value });
    }
  };

  return (
    <section className="calibration-panel" aria-labelledby={`${contentId}-heading`}>
      <div className="calibration-heading">
        <div>
          <p className="eyebrow">Live diagnostics</p>
          <h2 id={`${contentId}-heading`}>Calibration</h2>
        </div>
        <button
          type="button"
          className="calibration-toggle"
          aria-controls={contentId}
          aria-expanded={isExpanded}
          aria-label={`${isExpanded ? "Collapse" : "Expand"} calibration panel`}
          onClick={() => setIsExpanded((expanded) => !expanded)}
        >
          <span aria-hidden="true">{isExpanded ? "−" : "+"}</span>
        </button>
      </div>

      <div id={contentId} className="calibration-content" hidden={!isExpanded}>
          <dl className="calibration-diagnostics">
            <div>
              <dt>Pinch distance</dt>
              <dd>{pinchDistance === null ? "—" : pinchDistance.toFixed(3)}</dd>
            </div>
            <div>
              <dt>Gesture state</dt>
              <dd>{gestureState}</dd>
            </div>
            <div>
              <dt>Cursor</dt>
              <dd>{cursor === null ? "—" : `${Math.round(cursor.x)}, ${Math.round(cursor.y)}`}</dd>
            </div>
          </dl>

          <div className="calibration-controls">
            <SettingControl
              label="Pinch threshold"
              accessibleLabel="pinch threshold"
              value={settings.pinchDistance}
              displayValue={settings.pinchDistance.toFixed(3)}
              min={0.025}
              max={0.1}
              onDecrease={() => changeSetting("pinchDistance", -0.005, 0.025, 0.1, 3)}
              onIncrease={() => changeSetting("pinchDistance", 0.005, 0.025, 0.1, 3)}
            />
            <SettingControl
              label="Cursor smoothing"
              accessibleLabel="cursor smoothing"
              value={settings.cursorSmoothingFactor}
              displayValue={settings.cursorSmoothingFactor.toFixed(2)}
              min={0.05}
              max={1}
              onDecrease={() => changeSetting("cursorSmoothingFactor", -0.05, 0.05, 1, 2)}
              onIncrease={() => changeSetting("cursorSmoothingFactor", 0.05, 0.05, 1, 2)}
            />
            <SettingControl
              label="Drag hold"
              accessibleLabel="drag hold"
              value={settings.dragHoldMs}
              displayValue={`${settings.dragHoldMs} ms`}
              min={150}
              max={1000}
              onDecrease={() => changeSetting("dragHoldMs", -50, 150, 1000, 0)}
              onIncrease={() => changeSetting("dragHoldMs", 50, 150, 1000, 0)}
            />
          </div>

          <button
            type="button"
            className="calibration-reset"
            onClick={() => onSettingsChange({ ...DEFAULT_GESTURE_SETTINGS })}
          >
            Reset defaults
          </button>
      </div>
    </section>
  );
}
