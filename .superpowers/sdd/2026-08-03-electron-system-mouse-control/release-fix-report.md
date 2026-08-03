# Electron System Mouse Control Release Fix Report

Date: 2026-08-03
Base commit: `8d147e6`

## Scope

Resolved the final unified-review blockers without launching the Electron app, requesting Accessibility permission, or performing a real mouse action.

## P1: drag-aware native movement

- Added a fixed `drag(x, y)` capability to the renderer declaration and preload bridge.
- Added the trusted, normalized `gesture:drag` IPC channel and primary-display coordinate mapping.
- Added `MouseController.drag()`, which remains inert unless the main-owned session is active, Accessibility permission is still granted, the app is active, and the controller has recorded a successful button press.
- Serialized press, drag, release, and lifecycle-release actions so the renderer's concurrent `mouseDown()` and `drag()` calls execute in press-before-drag order.
- Backed the packaged adapter with `@jitsi/robotjs.dragMouse()`; normal hover movement still uses `moveMouse()`.
- Routed renderer movement through `drag()` whenever the gesture engine reports `dragging`; other live gesture states continue through `move()`.
- Added regression coverage for preload validation/whitelisting, trusted IPC, invalid/untrusted payloads, RobotJS delegation, renderer routing, press-state gating, concurrent ordering, and safety-pause invalidation.

## P2: shared pinch-distance metric

- Added `src/gesture/landmarkMetrics.ts` with the shared `thumbIndexDistance()` utility.
- Preserved the engine's three-dimensional Euclidean metric, treating an omitted `z` as zero.
- Updated both `GestureEngine` thresholding and `App` calibration diagnostics to call the same utility.
- Added utility, threshold-boundary, and live-diagnostic tests using a `3-4-5` distance fixture.

## TDD evidence

The initial targeted regression run failed for the intended missing behavior:

- 5 test files failed.
- 8 tests failed and 42 passed.
- Failures identified the absent drag adapter/controller/preload methods and channel, hover routing during drag, the missing shared metric module, and the calibration panel's two-dimensional `0.040` result instead of `0.050`.

After implementation and safety refinements, the targeted suite passed 53/53 tests.

## Release verification

All commands were run from `/Users/hht/Desktop/手势控制/.worktrees/gesture-calibration-panel`:

- `npm test` — 14 files passed, 93 tests passed.
- `npm run electron:typecheck` — passed.
- `npm run build` — passed; renderer production bundle generated.
- `npm run electron:make` — passed; macOS arm64 package and zip generated under ignored `out/make`.
- `git diff --check` — passed with no whitespace errors.

The verification path was fully headless: tests mocked RobotJS/Electron boundaries, packaging did not launch the app, and no Accessibility or native pointer action was requested.
