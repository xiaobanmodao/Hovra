import { useState } from "react";

import type { GestureOutput } from "../gesture/types";

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
      setSaveStatus(result === "saved" ? "Trace saved locally" : "Save cancelled");
    } catch {
      setSaveStatus("Trace save failed");
    }
  };

  return (
    <section className="recognition-diagnostics" aria-labelledby="recognition-diagnostics-title">
      <div className="recognition-diagnostics-heading">
        <div>
          <p className="eyebrow">Recognition engine V2</p>
          <h2 id="recognition-diagnostics-title">Gesture diagnostics</h2>
        </div>
        {onSaveTrace && (
          <button type="button" onClick={() => void saveTrace()}>
            Save diagnostic trace
          </button>
        )}
      </div>
      <dl>
        <div><dt>Phase</dt><dd>{output.phase}</dd></div>
        <div><dt>Candidate</dt><dd>{output.candidate ?? "—"}</dd></div>
        <div><dt>Locked action</dt><dd>{output.lockedGesture ?? "—"}</dd></div>
        <div><dt>Confirmation</dt><dd>{progressQuarter}/4</dd></div>
        <div><dt>Palm scale</dt><dd>{numberOrDash(diagnostics.palmScale)}</dd></div>
        <div>
          <dt>Pinch ratios L / R / D</dt>
          <dd>{[diagnostics.leftPinchRatio, diagnostics.rightPinchRatio, diagnostics.doublePinchRatio]
            .map((value) => numberOrDash(value)).join(" / ")}</dd>
        </div>
        <div><dt>Scroll score</dt><dd>{numberOrDash(diagnostics.scrollPoseScore)}</dd></div>
        <div><dt>Quality</dt><dd>{Math.round(diagnostics.quality * 100)}%</dd></div>
      </dl>
      {saveStatus && <p className="trace-save-status" role="status">{saveStatus}</p>}
    </section>
  );
}
