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
      drag: vi.fn<(x: number, y: number) => Promise<void>>().mockResolvedValue(),
      click: vi.fn<() => Promise<void>>().mockResolvedValue(),
      press: vi.fn<() => Promise<void>>().mockResolvedValue(),
      release: vi.fn<() => Promise<void>>().mockResolvedValue(),
    },
    cursor: {
      hide: vi.fn(),
      show: vi.fn(),
    },
  };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((next) => {
    resolve = next;
  });
  return { promise, resolve };
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

  it("keeps action IPC inert until the main-owned session is explicitly activated", async () => {
    const controller = createMouseController(deps);

    await controller.move(120, 80);
    await controller.click();
    await controller.mouseDown();

    expect(deps.mouse.move).not.toHaveBeenCalled();
    expect(deps.mouse.click).not.toHaveBeenCalled();
    expect(deps.mouse.press).not.toHaveBeenCalled();

    await expect(controller.activate()).resolves.toBe(true);
    await controller.move(120, 80);

    expect(deps.mouse.move).toHaveBeenCalledWith(120, 80);
  });

  it("replaces the native cursor only for an active control session", async () => {
    const controller = createMouseController(deps);

    await expect(controller.activate()).resolves.toBe(true);
    expect(deps.cursor.hide).toHaveBeenCalledOnce();

    await controller.releaseAndPause();
    expect(deps.cursor.show).toHaveBeenCalledOnce();
  });

  it("does not activate if focus is lost while permission is pending", async () => {
    let resolvePermission: ((granted: boolean) => void) | undefined;
    deps.permission.mockImplementation(
      () => new Promise<boolean>((resolve) => {
        resolvePermission = resolve;
      }),
    );
    const controller = createMouseController(deps);

    const activation = controller.activate();
    await vi.waitFor(() => expect(resolvePermission).toBeTypeOf("function"));
    deps.isActive.mockReturnValue(false);
    resolvePermission?.(true);

    await expect(activation).resolves.toBe(false);
    await controller.move(120, 80);
    expect(deps.mouse.move).not.toHaveBeenCalled();
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
      const controller = createMouseController(deps);
      await controller.activate();

      let resolvePermission: ((granted: boolean) => void) | undefined;
      deps.permission.mockImplementation(
        () =>
          new Promise<boolean>((resolve) => {
            resolvePermission = resolve;
          }),
      );
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
    await controller.activate();

    await controller.move(320.5, -12);
    await controller.click();

    expect(deps.mouse.move).toHaveBeenCalledOnce();
    expect(deps.mouse.move).toHaveBeenCalledWith(320.5, -12);
    expect(deps.mouse.click).toHaveBeenCalledOnce();
  });

  it("drags only after a tracked press and stops after release", async () => {
    const controller = createMouseController(deps);
    await controller.activate();

    await controller.drag(200, 100);
    await Promise.all([
      controller.mouseDown(),
      controller.drag(320.5, -12),
    ]);
    await controller.mouseUp();
    await controller.drag(400, 300);

    expect(deps.mouse.drag).toHaveBeenCalledOnce();
    expect(deps.mouse.drag).toHaveBeenCalledWith(320.5, -12);
  });

  it("drops hover movement and clicks while the tracked button remains down", async () => {
    const controller = createMouseController(deps);
    await controller.activate();
    await controller.mouseDown();

    await Promise.all([
      controller.move(320.5, -12),
      controller.click(),
    ]);

    expect(deps.mouse.move).not.toHaveBeenCalled();
    expect(deps.mouse.click).not.toHaveBeenCalled();

    await controller.mouseUp();
    await controller.move(400, 300);
    await controller.click();

    expect(deps.mouse.move).toHaveBeenCalledWith(400, 300);
    expect(deps.mouse.click).toHaveBeenCalledOnce();
  });

  it("finishes a queued terminal drag before releasing and accepting hover", async () => {
    const controller = createMouseController(deps);
    await controller.activate();
    await controller.mouseDown();
    const drag = deferred();
    deps.mouse.drag.mockReturnValueOnce(drag.promise);

    const terminalDrag = controller.drag(400, 300);
    await vi.waitFor(() => expect(deps.mouse.drag).toHaveBeenCalledOnce());
    const release = controller.mouseUp();
    const hover = controller.move(420, 310);
    const click = controller.click();

    await Promise.resolve();
    expect(deps.mouse.release).not.toHaveBeenCalled();
    expect(deps.mouse.move).not.toHaveBeenCalled();
    expect(deps.mouse.click).not.toHaveBeenCalled();

    drag.resolve();
    await Promise.all([terminalDrag, release, hover, click]);

    expect(deps.mouse.drag.mock.invocationCallOrder[0]).toBeLessThan(
      deps.mouse.release.mock.invocationCallOrder[0],
    );
    expect(deps.mouse.release.mock.invocationCallOrder[0]).toBeLessThan(
      deps.mouse.move.mock.invocationCallOrder[0],
    );
    expect(deps.mouse.move.mock.invocationCallOrder[0]).toBeLessThan(
      deps.mouse.click.mock.invocationCallOrder[0],
    );
  });

  it("invalidates a queued drag before an unconditional safety release", async () => {
    const controller = createMouseController(deps);
    await controller.activate();
    await controller.mouseDown();

    let resolvePermission: ((granted: boolean) => void) | undefined;
    deps.permission.mockImplementation(
      () => new Promise<boolean>((resolve) => {
        resolvePermission = resolve;
      }),
    );
    const drag = controller.drag(400, 300);
    await vi.waitFor(() => expect(resolvePermission).toBeTypeOf("function"));
    const release = controller.releaseAndPause();
    resolvePermission?.(true);

    await Promise.all([drag, release]);
    expect(deps.mouse.drag).not.toHaveBeenCalled();
    expect(deps.mouse.release).toHaveBeenCalledOnce();
  });

  it("presses and releases the left button idempotently", async () => {
    const controller = createMouseController(deps);
    await controller.activate();

    await controller.mouseDown();
    await controller.mouseDown();
    await controller.mouseUp();
    await controller.mouseUp();

    expect(deps.mouse.press).toHaveBeenCalledTimes(1);
    expect(deps.mouse.release).toHaveBeenCalledTimes(1);
  });

  it("serializes overlapping button state transitions", async () => {
    const controller = createMouseController(deps);
    await controller.activate();

    await Promise.all([controller.mouseDown(), controller.mouseDown()]);
    await Promise.all([controller.mouseUp(), controller.releaseAndPause()]);

    expect(deps.mouse.press).toHaveBeenCalledTimes(1);
    expect(deps.mouse.release).toHaveBeenCalledTimes(1);
  });

  it("releaseAndPause releases a pressed button once even after deactivation", async () => {
    const controller = createMouseController(deps);
    await controller.activate();

    await controller.mouseDown();
    deps.permission.mockResolvedValue(false);
    deps.isActive.mockReturnValue(false);

    await controller.releaseAndPause();
    await controller.releaseAndPause();

    expect(deps.mouse.release).toHaveBeenCalledTimes(1);
  });

  it("releaseAndPause deactivates before an unconditional tracked-button release", async () => {
    const controller = createMouseController(deps);
    await controller.activate();
    await controller.mouseDown();
    deps.permission.mockResolvedValue(false);
    deps.isActive.mockReturnValue(false);

    const release = controller.releaseAndPause();
    await controller.move(400, 300);
    await release;

    expect(deps.mouse.release).toHaveBeenCalledOnce();
    expect(deps.mouse.move).not.toHaveBeenCalled();
  });
});

function createControllerDouble(): MouseController {
  return {
    permissionStatus: vi.fn().mockResolvedValue("granted"),
    activate: vi.fn().mockResolvedValue(true),
    move: vi.fn().mockResolvedValue(undefined),
    drag: vi.fn().mockResolvedValue(undefined),
    click: vi.fn().mockResolvedValue(undefined),
    mouseDown: vi.fn().mockResolvedValue(undefined),
    mouseUp: vi.fn().mockResolvedValue(undefined),
    releaseAndPause: vi.fn().mockResolvedValue(undefined),
  };
}

describe("main-process mouse IPC", () => {
  const trustedWebContents = {};
  const trustedFrame = { url: "file:///app/index.html" } as {
    url: string;
    top?: unknown;
  };
  trustedFrame.top = trustedFrame;
  const trustedEvent = {
    sender: trustedWebContents,
    senderFrame: trustedFrame,
  };
  const authorization = {
    isTrustedEvent: (event: unknown) => event === trustedEvent,
    canActivate: (event: unknown) => event === trustedEvent,
    getPrimaryDisplayBounds: () => ({ x: -1512, y: 42, width: 1512, height: 982 }),
  };

  it("registers only fixed gesture channels and maps normalized movement to primary display bounds", async () => {
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

    registerMouseControllerIpc(ipcMain, controller, authorization);

    expect([...handlers.keys()].sort()).toEqual([
      "gesture:activate",
      "gesture:click",
      "gesture:drag",
      "gesture:get-permission-status",
      "gesture:mouse-down",
      "gesture:mouse-up",
      "gesture:move",
      "gesture:release-and-pause",
    ]);

    await handlers.get("gesture:move")?.(trustedEvent, { x: 0.25, y: 0.5 });
    await handlers.get("gesture:drag")?.(trustedEvent, { x: 0.75, y: 0.25 });
    await handlers.get("gesture:drag")?.(trustedEvent, { x: -0.01, y: 0.25 });
    await handlers.get("gesture:drag")?.(trustedEvent, { x: 0.75 });
    await handlers.get("gesture:move")?.(trustedEvent, { x: Number.NaN, y: 0.5 });
    await handlers.get("gesture:move")?.(trustedEvent, { x: 2, y: 0.5 });
    await handlers.get("gesture:move")?.(trustedEvent, { x: 0.25 });

    expect(controller.move).toHaveBeenCalledTimes(1);
    expect(controller.move).toHaveBeenCalledWith(-1134.25, 532.5);
    expect(controller.drag).toHaveBeenCalledOnce();
    expect(controller.drag).toHaveBeenCalledWith(-378.75, 287.25);
  });

  it("forwards activation, permission, release, and button actions for the trusted top frame", async () => {
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
      authorization,
    );

    await expect(
      handlers.get("gesture:get-permission-status")?.(trustedEvent),
    ).resolves.toBe("granted");
    await expect(handlers.get("gesture:activate")?.(trustedEvent)).resolves.toBe(true);
    await handlers.get("gesture:click")?.(trustedEvent);
    await handlers.get("gesture:mouse-down")?.(trustedEvent);
    await handlers.get("gesture:mouse-up")?.(trustedEvent);
    await handlers.get("gesture:release-and-pause")?.(trustedEvent);

    expect(controller.activate).toHaveBeenCalledOnce();
    expect(controller.click).toHaveBeenCalledOnce();
    expect(controller.mouseDown).toHaveBeenCalledOnce();
    expect(controller.mouseUp).toHaveBeenCalledOnce();
    expect(controller.releaseAndPause).toHaveBeenCalledOnce();
  });

  it("rejects activation from a trusted frame while its renderer-ready gate is closed", async () => {
    const handlers = new Map<
      string,
      (event: unknown, payload?: unknown) => Promise<unknown>
    >();
    const controller = createControllerDouble();
    registerMouseControllerIpc(
      { handle: (channel, handler) => handlers.set(channel, handler) },
      controller,
      {
        ...authorization,
        canActivate: () => false,
      },
    );

    await expect(handlers.get("gesture:activate")?.(trustedEvent)).resolves.toBe(false);
    expect(controller.activate).not.toHaveBeenCalled();
  });

  it("keeps mapped points inside the inclusive primary-display edges", async () => {
    const handlers = new Map<
      string,
      (event: unknown, payload?: unknown) => Promise<unknown>
    >();
    const controller = createControllerDouble();
    registerMouseControllerIpc(
      { handle: (channel, handler) => handlers.set(channel, handler) },
      controller,
      authorization,
    );

    await handlers.get("gesture:move")?.(trustedEvent, { x: 0, y: 0 });
    await handlers.get("gesture:move")?.(trustedEvent, { x: 1, y: 1 });

    expect(vi.mocked(controller.move).mock.calls).toEqual([
      [-1512, 42],
      [-1, 1023],
    ]);
  });

  it("keeps renderer action IPC paused before activation and after safety release", async () => {
    const handlers = new Map<
      string,
      (event: unknown, payload?: unknown) => Promise<unknown>
    >();
    const deps = createDependencies();
    const controller = createMouseController(deps);
    registerMouseControllerIpc(
      { handle: (channel, handler) => handlers.set(channel, handler) },
      controller,
      authorization,
    );

    await handlers.get("gesture:move")?.(trustedEvent, { x: 0.5, y: 0.5 });
    await handlers.get("gesture:click")?.(trustedEvent);
    await handlers.get("gesture:mouse-down")?.(trustedEvent);
    expect(deps.mouse.move).not.toHaveBeenCalled();
    expect(deps.mouse.click).not.toHaveBeenCalled();
    expect(deps.mouse.press).not.toHaveBeenCalled();

    await handlers.get("gesture:activate")?.(trustedEvent);
    await handlers.get("gesture:mouse-down")?.(trustedEvent);
    await handlers.get("gesture:release-and-pause")?.(trustedEvent);
    await handlers.get("gesture:click")?.(trustedEvent);

    expect(deps.mouse.press).toHaveBeenCalledOnce();
    expect(deps.mouse.release).toHaveBeenCalledOnce();
    expect(deps.mouse.click).not.toHaveBeenCalled();
  });

  it("rejects every request from an untrusted sender or origin", async () => {
    const handlers = new Map<
      string,
      (event: unknown, payload?: unknown) => Promise<unknown>
    >();
    const controller = createControllerDouble();

    registerMouseControllerIpc(
      { handle: (channel, handler) => handlers.set(channel, handler) },
      controller,
      authorization,
    );

    const untrustedEvent = { sender: {}, senderFrame: { url: "https://evil.example" } };
    await expect(
      handlers.get("gesture:get-permission-status")?.(untrustedEvent),
    ).resolves.toBe("denied");
    await expect(handlers.get("gesture:activate")?.(untrustedEvent)).resolves.toBe(false);
    await handlers.get("gesture:move")?.(untrustedEvent, { x: 0.5, y: 0.5 });
    await handlers.get("gesture:drag")?.(untrustedEvent, { x: 0.5, y: 0.5 });
    await handlers.get("gesture:click")?.(untrustedEvent);
    await handlers.get("gesture:mouse-down")?.(untrustedEvent);
    await handlers.get("gesture:mouse-up")?.(untrustedEvent);
    await handlers.get("gesture:release-and-pause")?.(untrustedEvent);

    expect(controller.permissionStatus).not.toHaveBeenCalled();
    expect(controller.activate).not.toHaveBeenCalled();
    expect(controller.move).not.toHaveBeenCalled();
    expect(controller.drag).not.toHaveBeenCalled();
    expect(controller.click).not.toHaveBeenCalled();
    expect(controller.mouseDown).not.toHaveBeenCalled();
    expect(controller.mouseUp).not.toHaveBeenCalled();
    expect(controller.releaseAndPause).not.toHaveBeenCalled();
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
