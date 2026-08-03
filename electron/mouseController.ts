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

interface LifecyclePauseCallbacks {
  deactivate(): void;
  finally(): void;
}

export function createMouseController(
  deps: MouseControllerDependencies,
): MouseController {
  let isButtonDown = false;
  let buttonQueue = Promise.resolve();

  async function permissionStatus(): Promise<PermissionStatus> {
    return (await deps.permission()) ? "granted" : "denied";
  }

  async function canAct(): Promise<boolean> {
    if (!deps.isActive() || !(await deps.permission())) {
      return false;
    }

    return deps.isActive();
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
        if (!isButtonDown || !(await canAct())) {
          return;
        }

        await releasePressedButton();
      });
    },

    releaseAndPause(): Promise<void> {
      return queueButtonOperation(releasePressedButton);
    },
  };
}

export function registerMouseControllerIpc(
  ipcMain: IpcMainRegistrar,
  controller: MouseController,
): void {
  ipcMain.handle("gesture:get-permission-status", () =>
    controller.permissionStatus(),
  );
  ipcMain.handle("gesture:move", async (_event, payload) => {
    if (!isFiniteMovePayload(payload)) {
      return;
    }

    await controller.move(payload.x, payload.y);
  });
  ipcMain.handle("gesture:click", () => controller.click());
  ipcMain.handle("gesture:mouse-down", () => controller.mouseDown());
  ipcMain.handle("gesture:mouse-up", () => controller.mouseUp());
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

function isFiniteMovePayload(
  payload: unknown,
): payload is { x: number; y: number } {
  if (typeof payload !== "object" || payload === null) {
    return false;
  }

  const candidate = payload as { x?: unknown; y?: unknown };
  return (
    typeof candidate.x === "number" &&
    Number.isFinite(candidate.x) &&
    typeof candidate.y === "number" &&
    Number.isFinite(candidate.y)
  );
}
