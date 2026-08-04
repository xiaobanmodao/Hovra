export type NativeCursorVisibility = {
  hide(): void;
  show(): void;
  obscure(): void;
};

export type CursorVisibilityController = {
  hide(): void;
  show(): void;
  refresh(): void;
  dispose(): void;
};

export function createCursorVisibilityController(
  nativeCursor: NativeCursorVisibility,
): CursorVisibilityController {
  let isHidden = false;

  return {
    hide() {
      if (isHidden) return;
      nativeCursor.hide();
      isHidden = true;
    },
    show() {
      if (!isHidden) return;
      nativeCursor.show();
      isHidden = false;
    },
    refresh() {
      if (!isHidden) return;
      nativeCursor.obscure();
    },
    dispose() {
      if (isHidden) {
        nativeCursor.show();
        isHidden = false;
      }
    },
  };
}
