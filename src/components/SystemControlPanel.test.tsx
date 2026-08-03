import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, vi } from "vitest";
import type { GestureDesktopApi } from "../electron.d";
import { SystemControlPanel } from "./SystemControlPanel";

const desktopApi = (
  permission: "granted" | "denied",
): GestureDesktopApi => ({
  getPermissionStatus: vi.fn().mockResolvedValue(permission),
  move: vi.fn().mockResolvedValue(undefined),
  click: vi.fn().mockResolvedValue(undefined),
  mouseDown: vi.fn().mockResolvedValue(undefined),
  mouseUp: vi.fn().mockResolvedValue(undefined),
  onSafetyPause: vi.fn(() => vi.fn()),
});

afterEach(() => {
  cleanup();
  delete window.gestureDesktop;
  vi.restoreAllMocks();
});

it("keeps system control paused and disables enable while Accessibility permission is denied", async () => {
  window.gestureDesktop = desktopApi("denied");

  render(
    <SystemControlPanel
      enabled={false}
      onEnable={vi.fn()}
      onPause={vi.fn()}
    />,
  );

  expect(await screen.findByText("Permission required")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Enable system control" })).toBeDisabled();
  expect(screen.getByText(/privacy & security.*accessibility/i)).toBeInTheDocument();
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

  const enable = await screen.findByRole("button", { name: "Enable system control" });
  await waitFor(() => expect(enable).toBeEnabled());
  expect(screen.getByText("Paused")).toBeInTheDocument();

  fireEvent.click(enable);
  expect(onEnable).toHaveBeenCalledOnce();

  rerender(
    <SystemControlPanel
      enabled
      onEnable={onEnable}
      onPause={vi.fn()}
    />,
  );
  expect(screen.getByText("Enabled")).toBeInTheDocument();
});

it("labels a missing desktop bridge as browser demo mode", () => {
  render(
    <SystemControlPanel
      enabled={false}
      onEnable={vi.fn()}
      onPause={vi.fn()}
    />,
  );

  expect(screen.getByText("Browser demo")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Enable system control" })).not.toBeInTheDocument();
});
