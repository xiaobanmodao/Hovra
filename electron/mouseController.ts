export type PermissionStatus = "granted" | "denied";

export interface SystemMouseAdapter {
  move(x: number, y: number): Promise<void>;
  click(): Promise<void>;
  press(): Promise<void>;
  release(): Promise<void>;
}

export interface MouseControllerDependencies {
  permission(): boolean | Promise<boolean>;
  isActive(): boolean;
  mouse: SystemMouseAdapter;
}

export interface MouseController {
  permissionStatus(): Promise<PermissionStatus>;
  activate(): Promise<boolean>;
  move(x: number, y: number): Promise<void>;
  click(): Promise<void>;
  mouseDown(): Promise<void>;
  mouseUp(): Promise<void>;
  releaseAndPause(): Promise<void>;
}

export interface IpcMainRegistrar {
  handle(
    channel: string,
    listener: (event: unknown, payload?: unknown) => Promise<unknown>,
  ): void;
}

export interface ScreenBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MouseControllerIpcSecurity {
  isTrustedEvent(event: unknown): boolean;
  canActivate(event: unknown): boolean;
  getPrimaryDisplayBounds(): ScreenBounds;
}

interface LifecyclePauseCallbacks {
  deactivate(): void;
  finally(): void;
}

export function createMouseController(
  deps: MouseControllerDependencies,
): MouseController {
  let isSessionActive = false;
  let activationGeneration = 0;
  let isButtonDown = false;
  let buttonQueue = Promise.resolve();

  async function permissionStatus(): Promise<PermissionStatus> {
    return (await deps.permission()) ? "granted" : "denied";
  }

  async function canAct(): Promise<boolean> {
    if (!isSessionActive || !deps.isActive() || !(await deps.permission())) {
      return false;
    }

    return isSessionActive && deps.isActive();
  }

  async function releasePressedButton(): Promise<void> {
    if (!isButtonDown) {
      return;
    }

    await deps.mouse.release();
    isButtonDown = false;
  }

  function queueButtonOperation(operation: () => Promise<void>): Promise<void> {
    const result = buttonQueue.then(operation, operation);
    buttonQueue = result.catch(() => undefined);
    return result;
  }

  return {
    permissionStatus,

    async activate(): Promise<boolean> {
      const generation = ++activationGeneration;
      isSessionActive = false;
      if (!deps.isActive() || !(await deps.permission())) {
        return false;
      }

      if (generation !== activationGeneration || !deps.isActive()) {
        return false;
      }

      isSessionActive = true;
      return true;
    },

    async move(x: number, y: number): Promise<void> {
      if (!Number.isFinite(x) || !Number.isFinite(y) || !(await canAct())) {
        return;
      }

      await deps.mouse.move(x, y);
    },

    async click(): Promise<void> {
      if (!(await canAct())) {
        return;
      }

      await deps.mouse.click();
    },

    mouseDown(): Promise<void> {
      return queueButtonOperation(async () => {
        if (isButtonDown || !(await canAct())) {
          return;
        }

        await deps.mouse.press();
        isButtonDown = true;
      });
    },

    mouseUp(): Promise<void> {
      return queueButtonOperation(async () => {
        await releasePressedButton();
      });
    },

    releaseAndPause(): Promise<void> {
      isSessionActive = false;
      activationGeneration += 1;
      return queueButtonOperation(releasePressedButton);
    },
  };
}

export function registerMouseControllerIpc(
  ipcMain: IpcMainRegistrar,
  controller: MouseController,
  security: MouseControllerIpcSecurity,
): void {
  ipcMain.handle("gesture:get-permission-status", (event) => {
    if (!security.isTrustedEvent(event)) {
      return Promise.resolve("denied");
    }

    return controller.permissionStatus();
  });
  ipcMain.handle("gesture:activate", (event) => {
    if (!security.isTrustedEvent(event) || !security.canActivate(event)) {
      return Promise.resolve(false);
    }

    return controller.activate();
  });
  ipcMain.handle("gesture:move", async (event, payload) => {
    if (!security.isTrustedEvent(event) || !isNormalizedMovePayload(payload)) {
      return;
    }

    const bounds = security.getPrimaryDisplayBounds();
    await controller.move(
      bounds.x + payload.x * Math.max(0, bounds.width - 1),
      bounds.y + payload.y * Math.max(0, bounds.height - 1),
    );
  });
  ipcMain.handle("gesture:click", (event) => {
    if (!security.isTrustedEvent(event)) {
      return Promise.resolve();
    }

    return controller.click();
  });
  ipcMain.handle("gesture:mouse-down", (event) => {
    if (!security.isTrustedEvent(event)) {
      return Promise.resolve();
    }

    return controller.mouseDown();
  });
  ipcMain.handle("gesture:mouse-up", (event) => {
    if (!security.isTrustedEvent(event)) {
      return Promise.resolve();
    }

    return controller.mouseUp();
  });
  ipcMain.handle("gesture:release-and-pause", (event) => {
    if (!security.isTrustedEvent(event)) {
      return Promise.resolve();
    }

    return controller.releaseAndPause();
  });
}

export async function pauseForLifecycle(
  controller: MouseController,
  callbacks: LifecyclePauseCallbacks,
): Promise<void> {
  callbacks.deactivate();
  try {
    await controller.releaseAndPause();
  } finally {
    callbacks.finally();
  }
}

function isNormalizedMovePayload(
  payload: unknown,
): payload is { x: number; y: number } {
  if (typeof payload !== "object" || payload === null) {
    return false;
  }

  const candidate = payload as { x?: unknown; y?: unknown };
  return (
    typeof candidate.x === "number" &&
    Number.isFinite(candidate.x) &&
    candidate.x >= 0 &&
    candidate.x <= 1 &&
    typeof candidate.y === "number" &&
    Number.isFinite(candidate.y) &&
    candidate.y >= 0 &&
    candidate.y <= 1
  );
}
