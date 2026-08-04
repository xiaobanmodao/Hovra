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
    ? "浏览器演示模式"
    : permission === "denied"
      ? "需要辅助功能权限"
      : enabled
        ? "已启用"
        : "已暂停";

  return (
    <section className={`system-control-panel is-${permission}`} aria-labelledby="system-control-title">
      <div>
        <p className="eyebrow">系统鼠标</p>
        <h2 id="system-control-title">桌面控制</h2>
      </div>

      <div className="system-control-copy" aria-live="polite">
        <strong>{status}</strong>
        {permission === "browser" && (
          <p>请打开桌面应用控制系统指针；浏览器内仅提供安全演示。</p>
        )}
        {permission === "checking" && <p>正在检查 macOS 辅助功能权限…</p>}
        {permission === "denied" && (
          <p>请在“系统设置”→“隐私与安全性”→“辅助功能”中允许此应用。</p>
        )}
        {permission === "granted" && !enabled && (
          <p>系统控制已暂停，需由你主动启用。</p>
        )}
        {permission === "granted" && enabled && (
          <p>现在可用手势移动、点击、拖动、右键、双击和滚动。</p>
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
            {enabled ? "暂停系统控制" : "启用系统控制"}
          </button>
          {permission === "denied" && (
            <button
              className="system-control-settings-button"
              type="button"
              onClick={() => {
                void bridge?.openAccessibilitySettings();
              }}
            >
              打开辅助功能设置
            </button>
          )}
        </div>
      )}
    </section>
  );
}
