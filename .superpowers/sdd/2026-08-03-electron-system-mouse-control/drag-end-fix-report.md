# Drag-End P1 Fix Report

Date: 2026-08-03
Base commit: `789a16a`

## Scope

Resolved the terminal drag-frame ordering issue without launching the Electron
application, requesting Accessibility permission, opening System Settings, or
emitting a real mouse event.

## Root cause

- A normal pinch release produces one terminal `GestureOutput` with
  `state: "tracking"`, a live cursor, and `dragEnd: true`.
- `App` selected the movement bridge only from `output.state`, so that terminal
  cursor used `move()` before the renderer asynchronously invoked `mouseUp()`.
- Main serialized press, drag, and release, but ordinary move and click bypassed
  that queue and did not check `isButtonDown`. The main-process state machine
  therefore did not independently enforce pressed-state routing.

## Fix

- `App` now routes a live terminal `dragEnd` cursor through `drag()` before it
  invokes `mouseUp()`. Lost/open-palm safety outputs still take the existing
  unconditional `releaseAndPause()` path.
- `MouseController` now serializes move, drag, click, press, ordinary release,
  and safety release through one action queue.
- Move and click inspect `isButtonDown` inside the queue and remain inert while
  the controller tracks a successful press. Drag remains inert unless that
  press is tracked. A queued terminal drag therefore completes before release,
  while hover/click actions cannot bypass pressed state.
- Existing permission, focus, activation-generation, trusted-event, normalized
  coordinate, fixed-channel preload, and unconditional safety-release gates were
  preserved. No IPC capability or renderer authority was widened.

## Regression coverage

- `src/App.test.tsx` proves the pinch-release frame adds one final drag, adds no
  hover move, and invokes drag before mouse-up.
- `electron/mouseController.test.ts` proves move/click are dropped while pressed,
  become available after release, and cannot overtake a pending terminal drag or
  its ordered release.
- `electron/systemMouseAdapter.test.ts` proves the packaged RobotJS boundary maps
  the terminal sequence to left-button down, `dragMouse`, then left-button up,
  never substituting `moveMouse` for the drag.
- Main/preload focused regressions were rerun to cover the trusted IPC boundary,
  payload validation, activation/lifecycle gates, and fixed preload surface.

## TDD evidence

The RED run was:

```text
npm test -- src/App.test.tsx electron/mouseController.test.ts
```

It failed for the intended behavior with 3 failures and 38 passes:

- the renderer emitted one extra hover move on the drag-ending frame;
- move reached the adapter while the tracked button was down;
- hover overtook the queued release while terminal drag was pending.

After the minimal routing and queue changes, the App/controller/adapter focused
run passed 44/44 tests. The broader App/controller/adapter/main/preload focused
run passed 63/63 tests.

## Fresh final verification

All commands ran from
`/Users/hht/Desktop/手势控制/.worktrees/gesture-calibration-panel`:

- `npm test` — 14 files passed, 95/95 tests passed.
- `npm run electron:typecheck` — passed.
- `npm run build` — TypeScript project build and Vite production build passed.
- `npm run electron:make` — Forge packaged darwin/arm64 and produced the zip.
- Packaged app exists at
  `out/hand-gesture-control-darwin-arm64/hand-gesture-control.app`.
- Zip exists at
  `out/make/zip/darwin/arm64/hand-gesture-control-darwin-arm64-0.0.0.zip`.
- `git diff --check` — passed before report creation and is rerun at the final
  diff gate.

## Safety statement

Electron, RobotJS, permission, screen, and preload interactions in the tests were
mocked. Forge only built/package artifacts. The generated application was not
launched, macOS Accessibility state was not queried or changed by a real app,
System Settings was not opened, and no native pointer API was called.
