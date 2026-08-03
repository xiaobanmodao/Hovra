# Electron System Mouse Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Package the gesture UI as a macOS Electron app that can safely control the real system mouse after explicit permission and user activation.

**Architecture:** The renderer retains all vision and gesture work. A preload bridge exposes a narrow typed mouse API. The main process owns permission checks, an idempotent mouse-button state machine, and macOS system-event adapter; renderer safety conditions always request a release before deactivation.

**Tech Stack:** Electron, Electron Forge, TypeScript, React, Vitest, `@mediapipe/tasks-vision`, `@nut-tree/nut-js`.

## Global Constraints

- macOS only; do not add Windows/Linux controls, keyboard simulation, scroll, global hotkeys, persistence, servers, telemetry, uploads, or accounts.
- System control starts paused and can only be enabled after auxiliary accessibility permission is granted.
- Preload exposes only `getPermissionStatus`, `move`, `click`, `mouseDown`, `mouseUp`, and `onSafetyPause`.
- Every safety path—open palm, lost hand, stale frame, toggle off, blur, app quit—must call idempotent `mouseUp` before paused state.
- The renderer must never import Electron or Node APIs directly.

---

## Planned file structure

- `electron/main.ts`: Electron bootstrap, window lifecycle, permission and IPC registration.
- `electron/preload.ts`: context-isolated typed bridge.
- `electron/mouseController.ts`: permission-gated, idempotent system-mouse adapter.
- `electron/mouseController.test.ts`: controller permission and release-state tests.
- `src/electron.d.ts`: browser-safe `window.gestureDesktop` API declarations.
- `src/components/SystemControlPanel.tsx`: status and explicit enable/pause UI.
- `src/components/SystemControlPanel.test.tsx`: permission and toggle tests.
- `src/App.tsx`: desktop bridge integration and gesture-to-mouse dispatch.
- `src/App.test.tsx`: safety-release integration tests.
- `package.json`, `forge.config.ts`, `vite.*`: Electron build/dev scripts.
- `README.md`: macOS permission and real-device acceptance instructions.

### Task 1: Set up Electron and a narrow preload bridge

**Files:**
- Modify: `package.json`
- Create: `forge.config.ts`
- Create: `electron/main.ts`
- Create: `electron/preload.ts`
- Create: `src/electron.d.ts`
- Create: `electron/preload.test.ts`

**Interfaces:**
- Produces `window.gestureDesktop?: { getPermissionStatus(): Promise<"granted" | "denied">; move(x: number, y: number): Promise<void>; click(): Promise<void>; mouseDown(): Promise<void>; mouseUp(): Promise<void>; onSafetyPause(listener: () => void): () => void }`.

- [ ] **Step 1: Write failing preload whitelist tests**

Mock `contextBridge.exposeInMainWorld`; import preload; assert it exposes exactly `gestureDesktop` with the six named methods and no `ipcRenderer`, `require`, Node globals, or arbitrary channel method.

- [ ] **Step 2: Run the preload test to confirm it fails**

Run: `npm test -- electron/preload.test.ts`

Expected: FAIL because Electron files do not exist.

- [ ] **Step 3: Add Electron Forge configuration, main window and preload**

Configure context isolation and sandboxing. Load the Vite renderer URL in development and bundled HTML in production. Use fixed IPC channel names internal to preload; validate action payloads are finite screen coordinates before forwarding. Do not expose raw IPC.

- [ ] **Step 4: Run focused test and renderer build**

Run: `npm test -- electron/preload.test.ts && npm run build`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json forge.config.ts electron src/electron.d.ts
git commit -m "feat: add secure Electron gesture shell"
```

### Task 2: Implement permission-gated system mouse controller

**Files:**
- Create: `electron/mouseController.ts`
- Create: `electron/mouseController.test.ts`
- Modify: `electron/main.ts`

**Interfaces:**
- Produces `createMouseController(deps): { permissionStatus(): Promise<"granted" | "denied">; move(x: number, y: number): Promise<void>; click(): Promise<void>; mouseDown(): Promise<void>; mouseUp(): Promise<void>; releaseAndPause(): Promise<void> }`.

- [ ] **Step 1: Write failing permission and idempotence tests**

```ts
await controller.mouseDown();
expect(deps.mouse.press).not.toHaveBeenCalled(); // denied permission
deps.permission.mockResolvedValue(true);
await controller.mouseDown();
await controller.mouseUp();
await controller.mouseUp();
expect(deps.mouse.release).toHaveBeenCalledTimes(1);
```

Also assert non-finite coordinates do not reach the system adapter and `releaseAndPause` releases a pressed button once.

- [ ] **Step 2: Run controller tests to confirm they fail**

Run: `npm test -- electron/mouseController.test.ts`

Expected: FAIL because controller does not exist.

- [ ] **Step 3: Implement controller and IPC handlers**

Use `systemPreferences.isTrustedAccessibilityClient(false)` for status. Instantiate `@nut-tree/nut-js` only in main process. Gate every action by granted permission and active state; track `isButtonDown`; use `try/finally` lifecycle cleanup to call `releaseAndPause` on `before-quit` and BrowserWindow `blur`.

- [ ] **Step 4: Run controller tests and build**

Run: `npm test -- electron/mouseController.test.ts && npm run build`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add electron/main.ts electron/mouseController.ts electron/mouseController.test.ts
git commit -m "feat: add permission-gated system mouse controller"
```

### Task 3: Wire the renderer control panel and safety events

**Files:**
- Create: `src/components/SystemControlPanel.tsx`
- Create: `src/components/SystemControlPanel.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes `window.gestureDesktop` and current `GestureOutput`/cursor.
- Produces `SystemControlPanel` with `paused`, `enabled`, and `permission-required` UI states.

- [ ] **Step 1: Write failing panel and safety tests**

Mock `window.gestureDesktop`. Assert denied permission disables the enable control; granted permission plus user click enables it. In App, simulate `dragStart`, then `lost`, open-palm, stale frame, and window blur; assert `mouseUp` is called before the displayed state becomes paused for each condition.

- [ ] **Step 2: Run tests to confirm failure**

Run: `npm test -- src/components/SystemControlPanel.test.tsx src/App.test.tsx`

Expected: FAIL because desktop UI and dispatch behavior do not exist.

- [ ] **Step 3: Implement explicit enable/pause and dispatch**

Treat missing `gestureDesktop` as browser-demo mode. In desktop mode, poll permission on mount and display instruction when denied. When enabled: call `move` for tracking/pinching/dragging cursor frames, `click` for short pinch, `mouseDown` on drag start and `mouseUp` on drag end. A single `pauseSystemControl` helper must await `mouseUp`, then set UI state false; call it for every listed safety condition and on window blur/unmount.

- [ ] **Step 4: Run UI tests and complete suite**

Run: `npm test && npm run build`

Expected: all tests and build pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/SystemControlPanel.tsx src/components/SystemControlPanel.test.tsx src/App.tsx src/App.test.tsx src/styles.css
git commit -m "feat: wire safe desktop gesture controls"
```

### Task 4: Package and manually validate the macOS app

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add exact macOS manual validation steps**

Document: install dependencies; run `npm run electron:dev`; open System Settings → Privacy & Security → Accessibility; enable the app; return to app; confirm permission status changes; enable system control; test move, click, drag and each safety pause; quit while dragging and confirm the pointer is released.

- [ ] **Step 2: Run package and test checks**

Run: `npm test && npm run build && npm run electron:make`

Expected: test suite and builds succeed; generated macOS artifact is listed.

- [ ] **Step 3: Commit documentation**

```bash
git add README.md
git commit -m "docs: add macOS system-control verification"
```

## Self-review

- Spec coverage: Tasks 1–2 implement Electron isolation, permission gating and main-process mouse control; Task 3 implements explicit user activation and all safety pauses; Task 4 covers packaging and device acceptance.
- Placeholder scan: all actions, interfaces, values and test commands are concrete.
- Type consistency: preload’s typed API is declared in Task 1, used by controller IPC in Task 2, and consumed by renderer Task 3.
