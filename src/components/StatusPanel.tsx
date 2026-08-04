type StatusPanelProps = {
  camera: string;
  tracker: string;
  gesture: string;
};

export function StatusPanel({ camera, tracker, gesture }: StatusPanelProps) {
  return (
    <section
      className="status-panel"
      role="status"
      aria-live="polite"
      aria-label="摄像头、追踪器和手势状态"
    >
      <div>
        <span>摄像头</span>
        <strong>{camera}</strong>
      </div>
      <div>
        <span>追踪器</span>
        <strong>{tracker}</strong>
      </div>
      <div>
        <span>手势</span>
        <strong>{gesture}</strong>
      </div>
    </section>
  );
}
