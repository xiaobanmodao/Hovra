import { describe, expect, it, vi } from "vitest";

import { createCursorVisibilityController } from "./cursorVisibility";

describe("cursor visibility controller", () => {
  it("hides once and always restores the native cursor", () => {
    const write = vi.fn();
    const controller = createCursorVisibilityController({
      helperPath: "/tmp/cursor-helper",
      spawn: vi.fn(() => ({ stdin: { write } })),
    });

    controller.hide();
    controller.hide();
    controller.show();
    controller.show();

    expect(write).toHaveBeenNthCalledWith(1, "hide\n");
    expect(write).toHaveBeenNthCalledWith(2, "show\n");
    expect(write).toHaveBeenCalledTimes(2);
  });

  it("restores the native cursor while disposing an active session", () => {
    const write = vi.fn();
    const controller = createCursorVisibilityController({
      helperPath: "/tmp/cursor-helper",
      spawn: vi.fn(() => ({ stdin: { write } })),
    });

    controller.hide();
    controller.dispose();

    expect(write).toHaveBeenLastCalledWith("show\n");
  });
});
