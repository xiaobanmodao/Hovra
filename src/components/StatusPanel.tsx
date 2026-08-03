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
      aria-label="Camera, tracker and gesture status"
    >
      <div>
        <span>Camera</span>
        <strong>{camera}</strong>
      </div>
      <div>
        <span>Tracker</span>
        <strong>{tracker}</strong>
      </div>
      <div>
        <span>Gesture</span>
        <strong>{gesture}</strong>
      </div>
    </section>
  );
}
