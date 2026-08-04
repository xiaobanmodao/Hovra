import { describe, expect, it, vi } from "vitest";

import { createCursorVisibilityController } from "./cursorVisibility";

describe("cursor visibility controller", () => {
  it("hides once and always restores the native cursor", () => {
    const nativeCursor = { hide: vi.fn(), show: vi.fn(), obscure: vi.fn() };
    const controller = createCursorVisibilityController(nativeCursor);

    controller.hide();
    controller.hide();
    controller.show();
    controller.show();

    expect(nativeCursor.hide).toHaveBeenCalledOnce();
    expect(nativeCursor.show).toHaveBeenCalledOnce();
  });

  it("restores the native cursor while disposing an active session", () => {
    const nativeCursor = { hide: vi.fn(), show: vi.fn(), obscure: vi.fn() };
    const controller = createCursorVisibilityController(nativeCursor);

    controller.hide();
    controller.dispose();

    expect(nativeCursor.show).toHaveBeenCalledOnce();
  });

  it("re-obscures the cursor after system events only while control is active", () => {
    const nativeCursor = { hide: vi.fn(), show: vi.fn(), obscure: vi.fn() };
    const controller = createCursorVisibilityController(nativeCursor);

    controller.refresh();
    controller.hide();
    controller.refresh();
    controller.show();
    controller.refresh();

    expect(nativeCursor.obscure).toHaveBeenCalledOnce();
  });
});
