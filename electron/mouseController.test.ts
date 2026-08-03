import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createMouseController,
  pauseForLifecycle,
  registerMouseControllerIpc,
  type MouseController,
} from "./mouseController";

function createDependencies() {
  return {
    permission: vi.fn<() => Promise<boolean>>().mockResolvedValue(true),
    isActive: vi.fn<() => boolean>().mockReturnValue(true),
    mouse: {
      move: vi.fn<(x: number, y: number) => Promise<void>>().mockResolvedValue(),
      click: vi.fn<() => Promise<void>>().mockResolvedValue(),
      press: vi.fn<() => Promise<void>>().mockResolvedValue(),
      release: vi.fn<() => Promise<void>>().mockResolvedValue(),
    },
  };
}

describe("createMouseController", () => {
  let deps: ReturnType<typeof createDependencies>;

  beforeEach(() => {
    deps = createDependencies();
  });

  it("reports the current Accessibility permission without requesting it", async () => {
    const controller = createMouseController(deps);

    deps.permission.mockResolvedValueOnce(false).mockResolvedValueOnce(true);

    await expect(controller.permissionStatus()).resolves.toBe("denied");
    await expect(controller.permissionStatus()).resolves.toBe("granted");
    expect(deps.permission).toHaveBeenCalledTimes(2);
  });

  it("does not send system mouse actions while Accessibility permission is denied", async () => {
    deps.permission.mockResolvedValue(false);
    const controller = createMouseController(deps);

    await controller.move(120, 80);
    await controller.click();
    await controller.mouseDown();
    await controller.mouseUp();

    expect(deps.mouse.move).not.toHaveBeenCalled();
    expect(deps.mouse.click).not.toHaveBeenCalled();
    expect(deps.mouse.press).not.toHaveBeenCalled();
    expect(deps.mouse.release).not.toHaveBeenCalled();
  });

  it("does not send system mouse actions while the app is inactive", async () => {
    deps.isActive.mockReturnValue(false);
    const controller = createMouseController(deps);

    await controller.move(120, 80);
    await controller.click();
    await controller.mouseDown();
    await controller.mouseUp();

    expect(deps.mouse.move).not.toHaveBeenCalled();
    expect(deps.mouse.click).not.toHaveBeenCalled();
    expect(deps.mouse.press).not.toHaveBeenCalled();
    expect(deps.mouse.release).not.toHaveBeenCalled();
  });

  it.each([
    ["move", (controller: MouseController) => controller.move(120, 80)],
    ["click", (controller: MouseController) => controller.click()],
    ["mouseDown", (controller: MouseController) => controller.mouseDown()],
  ])(
    "does not send %s when the app deactivates while permission is pending",
    async (_name, invoke) => {
      let resolvePermission: ((granted: boolean) => void) | undefined;
      deps.permission.mockImplementation(
        () =>
          new Promise<boolean>((resolve) => {
            resolvePermission = resolve;
          }),
      );
      const controller = createMouseController(deps);

      const action = invoke(controller);
      await vi.waitFor(() => expect(resolvePermission).toBeTypeOf("function"));
      deps.isActive.mockReturnValue(false);
      resolvePermission?.(true);
      await action;

      expect(deps.mouse.move).not.toHaveBeenCalled();
      expect(deps.mouse.click).not.toHaveBeenCalled();
      expect(deps.mouse.press).not.toHaveBeenCalled();
    },
  );

  it.each([
    [Number.NaN, 0],
    [Number.POSITIVE_INFINITY, 0],
    [0, Number.NEGATIVE_INFINITY],
  ])("does not send non-finite coordinates (%s, %s)", async (x, y) => {
    const controller = createMouseController(deps);

    await controller.move(x, y);

    expect(deps.mouse.move).not.toHaveBeenCalled();
  });

  it("forwards finite coordinates and click actions", async () => {
    const controller = createMouseController(deps);

    await controller.move(320.5, -12);
    await controller.click();

    expect(deps.mouse.move).toHaveBeenCalledOnce();
    expect(deps.mouse.move).toHaveBeenCalledWith(320.5, -12);
    expect(deps.mouse.click).toHaveBeenCalledOnce();
  });

  it("presses and releases the left button idempotently", async () => {
    const controller = createMouseController(deps);

    await controller.mouseDown();
    await controller.mouseDown();
    await controller.mouseUp();
    await controller.mouseUp();

    expect(deps.mouse.press).toHaveBeenCalledTimes(1);
    expect(deps.mouse.release).toHaveBeenCalledTimes(1);
  });

  it("serializes overlapping button state transitions", async () => {
    const controller = createMouseController(deps);

    await Promise.all([controller.mouseDown(), controller.mouseDown()]);
    await Promise.all([controller.mouseUp(), controller.releaseAndPause()]);

    expect(deps.mouse.press).toHaveBeenCalledTimes(1);
    expect(deps.mouse.release).toHaveBeenCalledTimes(1);
  });

  it("releaseAndPause releases a pressed button once even after deactivation", async () => {
    const controller = createMouseController(deps);

    await controller.mouseDown();
    deps.permission.mockResolvedValue(false);
    deps.isActive.mockReturnValue(false);

    await controller.releaseAndPause();
    await controller.releaseAndPause();

    expect(deps.mouse.release).toHaveBeenCalledTimes(1);
  });
});

function createControllerDouble(): MouseController {
  return {
    permissionStatus: vi.fn().mockResolvedValue("granted"),
    move: vi.fn().mockResolvedValue(undefined),
    click: vi.fn().mockResolvedValue(undefined),
    mouseDown: vi.fn().mockResolvedValue(undefined),
    mouseUp: vi.fn().mockResolvedValue(undefined),
    releaseAndPause: vi.fn().mockResolvedValue(undefined),
  };
}

describe("main-process mouse IPC", () => {
  it("registers only the fixed gesture channels and validates move payloads", async () => {
    const handlers = new Map<
      string,
      (event: unknown, payload?: unknown) => Promise<unknown>
    >();
    const ipcMain = {
      handle: vi.fn(
        (
          channel: string,
          handler: (event: unknown, payload?: unknown) => Promise<unknown>,
        ) => handlers.set(channel, handler),
      ),
    };
    const controller = createControllerDouble();

    registerMouseControllerIpc(ipcMain, controller);

    expect([...handlers.keys()].sort()).toEqual([
      "gesture:click",
      "gesture:get-permission-status",
      "gesture:mouse-down",
      "gesture:mouse-up",
      "gesture:move",
    ]);

    await handlers.get("gesture:move")?.({}, { x: 20, y: 30 });
    await handlers.get("gesture:move")?.({}, { x: Number.NaN, y: 30 });
    await handlers.get("gesture:move")?.({}, { x: 20 });

    expect(controller.move).toHaveBeenCalledTimes(1);
    expect(controller.move).toHaveBeenCalledWith(20, 30);
  });

  it("forwards permission and button actions to the controller", async () => {
    const handlers = new Map<
      string,
      (event: unknown, payload?: unknown) => Promise<unknown>
    >();
    const controller = createControllerDouble();

    registerMouseControllerIpc(
      {
        handle: (channel, handler) => handlers.set(channel, handler),
      },
      controller,
    );

    await expect(
      handlers.get("gesture:get-permission-status")?.({}),
    ).resolves.toBe("granted");
    await handlers.get("gesture:click")?.({});
    await handlers.get("gesture:mouse-down")?.({});
    await handlers.get("gesture:mouse-up")?.({});

    expect(controller.click).toHaveBeenCalledOnce();
    expect(controller.mouseDown).toHaveBeenCalledOnce();
    expect(controller.mouseUp).toHaveBeenCalledOnce();
  });
});

describe("mouse lifecycle pause", () => {
  it("deactivates first, releases, then notifies the renderer", async () => {
    const events: string[] = [];
    const controller = createControllerDouble();
    vi.mocked(controller.releaseAndPause).mockImplementation(async () => {
      events.push("release");
    });

    await pauseForLifecycle(controller, {
      deactivate: () => events.push("deactivate"),
      finally: () => events.push("notify"),
    });

    expect(events).toEqual(["deactivate", "release", "notify"]);
  });

  it("runs final lifecycle cleanup when releasing rejects", async () => {
    const controller = createControllerDouble();
    vi.mocked(controller.releaseAndPause).mockRejectedValue(
      new Error("release failed"),
    );
    const finish = vi.fn();

    await expect(
      pauseForLifecycle(controller, {
        deactivate: vi.fn(),
        finally: finish,
      }),
    ).rejects.toThrow("release failed");

    expect(finish).toHaveBeenCalledOnce();
  });
});
