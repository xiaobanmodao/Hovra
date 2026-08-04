export type CursorHelperProcess = {
  stdin?: { write(message: string): void };
  kill?(): void;
};

export type CursorVisibilityController = {
  hide(): void;
  show(): void;
  dispose(): void;
};

export function createCursorVisibilityController({
  helperPath,
  spawn,
}: {
  helperPath: string;
  spawn: (command: string, args: readonly string[]) => CursorHelperProcess;
}): CursorVisibilityController {
  const helper = spawn(helperPath, []);
  let isHidden = false;

  const send = (command: "hide" | "show") => helper.stdin?.write(`${command}\n`);

  return {
    hide() {
      if (isHidden) return;
      send("hide");
      isHidden = true;
    },
    show() {
      if (!isHidden) return;
      send("show");
      isHidden = false;
    },
    dispose() {
      if (isHidden) {
        send("show");
        isHidden = false;
      }
      helper.kill?.();
    },
  };
}
