# Gesture Calibration Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a session-only diagnostic and calibration panel that supports real-camera tuning of the hand gesture demo.

**Architecture:** Define a `GestureSettings` value object whose defaults are exported from the gesture configuration, and inject it into the gesture engine. `App` owns one session-local settings state and passes it to a focused `CalibrationPanel`, which displays diagnostic input/output values and edits settings without persistence.

**Tech Stack:** React, TypeScript, Vitest, React Testing Library, MediaPipe Tasks Vision.

## Global Constraints

- Keep camera frames, keypoints, and calibration values in local browser memory only; add no server, upload, account, localStorage, cookies, or persistent profile.
- Retain existing defaults: pinch distance `0.055`, drag hold `350ms`, open-palm distance `0.18`, cursor smoothing `0.2`, stale frame timeout `500ms`.
- Clamp controls to: pinch `0.025–0.100` in `0.005` steps; smoothing `0.05–1.00` in `0.05` steps; drag hold `150–1000ms` in `50ms` steps.
- Existing click, drag, pause, lost-hand, whole-viewport and resize behavior must remain unchanged.

---

## Planned file structure

- `src/gesture/config.ts`: default settings object and range metadata.
- `src/gesture/types.ts`: `GestureSettings` type.
- `src/gesture/gestureEngine.ts`: settings-injected threshold handling.
- `src/gesture/gestureEngine.test.ts`: non-default threshold behavior tests.
- `src/components/CalibrationPanel.tsx`: collapsible diagnostic/control UI.
- `src/components/CalibrationPanel.test.tsx`: display, clamp, reset and collapse tests.
- `src/App.tsx`: settings state, current pinch distance calculation and panel wiring.
- `src/App.test.tsx`: end-to-end settings propagation test.
- `src/styles.css`: compact responsive calibration panel styles.
- `README.md`: calibration procedure and Edge verification record template.

### Task 1: Make gesture settings injectable

**Files:**
- Modify: `src/gesture/config.ts`
- Modify: `src/gesture/types.ts`
- Modify: `src/gesture/gestureEngine.ts`
- Modify: `src/gesture/gestureEngine.test.ts`

**Interfaces:**
- Produces: `type GestureSettings = { pinchDistance: number; dragHoldMs: number; openPalmMinTipDistance: number; cursorSmoothingFactor: number; cameraStaleFrameMs: number }`.
- Produces: `DEFAULT_GESTURE_SETTINGS: Readonly<GestureSettings>`.
- Produces: `new GestureEngine(settings?: GestureSettings)`; omitted settings use defaults.

- [ ] **Step 1: Write failing non-default-setting tests**

```ts
const engine = new GestureEngine({ ...DEFAULT_GESTURE_SETTINGS, pinchDistance: 0.1, dragHoldMs: 600 });
expect(engine.update(handWithPinchDistance(0.08), 0).state).toBe("pinching");
expect(engine.update(handWithPinchDistance(0.08), 500).dragStart).toBe(false);
expect(engine.update(handWithPinchDistance(0.08), 600).dragStart).toBe(true);
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `npm test -- src/gesture/gestureEngine.test.ts`

Expected: FAIL because the constructor does not accept settings.

- [ ] **Step 3: Implement defaults and settings injection**

Export the exact default object and preserve named primitive exports only where existing consumers need them. Store a private settings value in `GestureEngine`; replace direct threshold references with its properties. Do not mutate the supplied object.

- [ ] **Step 4: Run focused gesture tests and build**

Run: `npm test -- src/gesture/gestureEngine.test.ts && npm run build`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/gesture/config.ts src/gesture/types.ts src/gesture/gestureEngine.ts src/gesture/gestureEngine.test.ts
git commit -m "feat: make gesture thresholds configurable"
```

### Task 2: Build and test the calibration panel

**Files:**
- Create: `src/components/CalibrationPanel.tsx`
- Create: `src/components/CalibrationPanel.test.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: `settings: GestureSettings`, `onSettingsChange(next: GestureSettings): void`, `pinchDistance: number | null`, `gestureState: GestureState`, `cursor: Point | null`.
- Produces: `CalibrationPanel` with a collapse control, three bounded numeric controls, and reset action.

- [ ] **Step 1: Write failing panel tests**

Render with default settings and assert displayed labels include `Pinch distance`, `0.055`, `tracking`, and formatted cursor `320, 240`. Click the threshold increment control enough times to exceed `0.100` and assert the callback never receives more than `0.100`. Click reset after a changed setting and assert the callback receives `DEFAULT_GESTURE_SETTINGS`. Toggle collapse and assert diagnostic content is hidden while the toggle remains available.

- [ ] **Step 2: Run the panel test to confirm it fails**

Run: `npm test -- src/components/CalibrationPanel.test.tsx`

Expected: FAIL because `CalibrationPanel` does not exist.

- [ ] **Step 3: Implement accessible panel controls**

Use a `button` with `aria-expanded` for collapse. Use labeled decrement/increment buttons rather than free-form text inputs. Apply the exact ranges and steps from Global Constraints before invoking `onSettingsChange`. Display `—` for null pinch distance/cursor. Reset sends a fresh copy of defaults.

- [ ] **Step 4: Run panel tests and full suite**

Run: `npm test -- src/components/CalibrationPanel.test.tsx && npm test && npm run build`

Expected: all commands pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/CalibrationPanel.tsx src/components/CalibrationPanel.test.tsx src/styles.css
git commit -m "feat: add gesture calibration panel"
```

### Task 3: Wire live diagnostics and document the Edge test

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Modify: `README.md`

**Interfaces:**
- Consumes: `CalibrationPanel` and `GestureSettings`.
- Produces: session-local settings state wired into `GestureEngine`, current pinch distance calculated from landmarks, and documented Edge procedure.

- [ ] **Step 1: Write a failing App propagation test**

Mock `GestureEngine` and render `App`; use the panel increment control for drag hold. Assert the next engine instance receives settings with `dragHoldMs: 400`, then click reset and assert it receives default `350`. Mock landmarks with thumb/index points separated by `0.04` and assert panel displays `0.040`.

- [ ] **Step 2: Run the App test to confirm it fails**

Run: `npm test -- src/App.test.tsx`

Expected: FAIL because settings and diagnostic values are not wired to the app.

- [ ] **Step 3: Wire App state and update README**

Initialize `useState(() => ({ ...DEFAULT_GESTURE_SETTINGS }))`. Recreate the engine only when settings change, keeping the existing animation cleanup. Calculate two-dimensional thumb/index distance from landmark indices `4` and `8`; pass `null` when unavailable. Add an Edge checklist that records final pinch, smoothing and hold values plus observations for movement, click, drag and pause.

- [ ] **Step 4: Run complete verification**

Run: `npm test && npm run build && git diff --check`

Expected: all tests and build pass with no whitespace errors.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/App.test.tsx README.md
git commit -m "feat: wire live gesture calibration"
```

## Self-review

- Spec coverage: Task 1 supplies session-configurable gesture logic, Task 2 delivers the diagnostic UI and bounded edits, Task 3 supplies live values and the required Edge test procedure.
- Placeholder scan: every code/test step lists concrete behavior, values and commands.
- Type consistency: `GestureSettings` begins in Task 1 and flows unchanged through the panel/App in Tasks 2–3; App continues passing existing cursor and gesture outputs to full-page interaction components.
