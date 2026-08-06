import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, vi } from "vitest";
import type { GestureDesktopApi } from "../electron.d";
import { SystemControlPanel } from "./SystemControlPanel";

const desktopApi = (
  permission: "granted" | "denied",
): GestureDesktopApi => ({
  getPermissionStatus: vi.fn().mockResolvedValue(permission),
  activate: vi.fn().mockResolvedValue(true),
  move: vi.fn().mockResolvedValue(undefined),
  drag: vi.fn().mockResolvedValue(undefined),
  click: vi.fn().mockResolvedValue(undefined),
  rightClick: vi.fn().mockResolvedValue(undefined),
  doubleClick: vi.fn().mockResolvedValue(undefined),
  scroll: vi.fn().mockResolvedValue(undefined),
  mouseDown: vi.fn().mockResolvedValue(undefined),
  mouseUp: vi.fn().mockResolvedValue(undefined),
  releaseAndPause: vi.fn().mockResolvedValue(undefined),
  saveGestureTrace: vi.fn().mockResolvedValue("saved"),
  openAccessibilitySettings: vi.fn().mockResolvedValue(undefined),
  onSafetyPause: vi.fn(() => vi.fn()),
});

afterEach(() => {
  cleanup();
  delete window.gestureDesktop;
  vi.restoreAllMocks();
});

it("keeps system control paused and disables enable while Accessibility permission is denied", async () => {
  const bridge = desktopApi("denied");
  window.gestureDesktop = bridge;

  render(
    <SystemControlPanel
      enabled={false}
      onEnable={vi.fn()}
      onPause={vi.fn()}
    />,
  );

  expect(await screen.findByText("需要辅助功能权限")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "启用系统控制" })).toBeDisabled();
  expect(screen.getByText(/隐私与安全性.*辅助功能/)).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "打开辅助功能设置" }));
  expect(bridge.openAccessibilitySettings).toHaveBeenCalledOnce();
});

it("enables system control only after granted permission and an explicit click", async () => {
  window.gestureDesktop = desktopApi("granted");
  const onEnable = vi.fn();

  const { rerender } = render(
    <SystemControlPanel
      enabled={false}
      onEnable={onEnable}
      onPause={vi.fn()}
    />,
  );

  const enable = await screen.findByRole("button", { name: "启用系统控制" });
  await waitFor(() => expect(enable).toBeEnabled());
  expect(screen.getByText("已暂停")).toBeInTheDocument();

  fireEvent.click(enable);
  expect(onEnable).toHaveBeenCalledOnce();

  rerender(
    <SystemControlPanel
      enabled
      onEnable={onEnable}
      onPause={vi.fn()}
    />,
  );
  expect(screen.getByText("已启用")).toBeInTheDocument();
  expect(screen.getByText(/保持捏合可长按/)).toBeInTheDocument();
  expect(screen.getByText(/拇指与中指短捏合可右键/)).toBeInTheDocument();
});

it("labels a missing desktop bridge as browser demo mode", () => {
  render(
    <SystemControlPanel
      enabled={false}
      onEnable={vi.fn()}
      onPause={vi.fn()}
    />,
  );

  expect(screen.getByText("浏览器演示模式")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "启用系统控制" })).not.toBeInTheDocument();
});

it("稳定性测试期间禁止重新启用系统控制", async () => {
  window.gestureDesktop = desktopApi("granted");
  render(<SystemControlPanel enabled={false} disabled onEnable={vi.fn()} onPause={vi.fn()} />);
  expect(await screen.findByRole("button", { name: "启用系统控制" })).toBeDisabled();
  expect(screen.getByText("稳定性测试期间保持暂停")).toBeInTheDocument();
});
