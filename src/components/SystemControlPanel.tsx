import { useEffect, useState } from "react";

type PermissionState = "browser" | "checking" | "granted" | "denied";

type SystemControlPanelProps = {
  enabled: boolean;
  onEnable: () => void | Promise<void>;
  onPause: () => void | Promise<void>;
};

const PERMISSION_POLL_MS = 2_000;

export function SystemControlPanel({
  enabled,
  onEnable,
  onPause,
}: SystemControlPanelProps) {
  const bridge = window.gestureDesktop;
  const [permission, setPermission] = useState<PermissionState>(
    bridge ? "checking" : "browser",
  );

  useEffect(() => {
    if (!bridge) {
      setPermission("browser");
      return;
    }

    let active = true;
    const checkPermission = async () => {
      try {
        const nextPermission = await bridge.getPermissionStatus();
        if (active) {
          setPermission(nextPermission);
        }
      } catch {
        if (active) {
          setPermission("denied");
        }
      }
    };

    void checkPermission();
    const poll = window.setInterval(() => {
      void checkPermission();
    }, PERMISSION_POLL_MS);

    return () => {
      active = false;
      window.clearInterval(poll);
    };
  }, [bridge]);

  useEffect(() => {
    if (enabled && permission === "denied") {
      void onPause();
    }
  }, [enabled, onPause, permission]);

  const status = permission === "browser"
    ? "Browser demo"
    : permission === "denied"
      ? "Permission required"
      : enabled
        ? "Enabled"
        : "Paused";

  return (
    <section className={`system-control-panel is-${permission}`} aria-labelledby="system-control-title">
      <div>
        <p className="eyebrow">System mouse</p>
        <h2 id="system-control-title">Desktop control</h2>
      </div>

      <div className="system-control-copy" aria-live="polite">
        <strong>{status}</strong>
        {permission === "browser" && (
          <p>Open the Electron app to control the system pointer. This browser remains a safe demo.</p>
        )}
        {permission === "checking" && <p>Checking macOS Accessibility permission…</p>}
        {permission === "denied" && (
          <p>Allow this app in System Settings → Privacy &amp; Security → Accessibility.</p>
        )}
        {permission === "granted" && !enabled && (
          <p>System control is paused until you explicitly enable it.</p>
        )}
        {permission === "granted" && enabled && (
          <p>Gestures can move, click, drag, right-click, double-click and scroll.</p>
        )}
      </div>

      {permission !== "browser" && (
        <div className="system-control-actions">
          <button
            className="system-control-button"
            type="button"
            disabled={permission !== "granted"}
            onClick={() => {
              if (enabled) {
                void onPause();
              } else if (permission === "granted") {
                void onEnable();
              }
            }}
          >
            {enabled ? "Pause system control" : "Enable system control"}
          </button>
          {permission === "denied" && (
            <button
              className="system-control-settings-button"
              type="button"
              onClick={() => {
                void bridge?.openAccessibilitySettings();
              }}
            >
              Open Accessibility Settings
            </button>
          )}
        </div>
      )}
    </section>
  );
}
