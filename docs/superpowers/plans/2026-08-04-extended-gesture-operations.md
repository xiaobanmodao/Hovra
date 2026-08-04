# Extended Gesture Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add first-frame virtual-cursor feedback plus global right-click, double-click, scrolling, left-click, and drag gestures while preserving explicit user control of the system-control session.

**Architecture:** Extend the pure `GestureEngine` to classify three thumb-to-fingertip pinches and a two-finger scrolling pose, then propagate typed one-frame events through React, the sandboxed preload bridge, trusted Electron IPC, `MouseController`, and RobotJS. Carry the current gesture visual state with pointer movement so the transparent global overlay responds on the first recognized frame; keep action execution serialized and independent from overlay rendering.

**Tech Stack:** React 19, TypeScript, MediaPipe Tasks Vision, Electron 43, RobotJS, Vitest, Testing Library.

## Global Constraints

- System control is enabled and disabled only by the user's explicit control; clicks, open-palm recognition, hand loss, and application switching must not disable it.
- Existing left short-pinch click and long-pinch drag behavior must remain available.
- A visual press state must appear on the first recognized pinch frame and must not wait for the 350 ms drag threshold.
- Double-click uses a distinct thumb-ring pinch, so single-click is never delayed by a double-click detection window.
- The overlay remains transparent to mouse input, unfocusable, always on top, and centered on the actual system pointer.
- No new runtime dependency is introduced.

---

### Task 1: Typed gesture classification and scroll accumulation

**Files:**
- Modify: `src/gesture/types.ts`
- Modify: `src/gesture/gestureEngine.ts`
- Test: `src/gesture/gestureEngine.test.ts`

**Interfaces:**
- Consumes: `Landmark[]`, `GestureSettings`, and monotonic `nowMs`.
- Produces: `GestureState = "tracking" | "left-pinching" | "right-pinching" | "double-pinching" | "dragging" | "scrolling" | "paused" | "lost"` and `GestureOutput` fields `click`, `rightClick`, `doubleClick`, `scrollY`, `dragStart`, `dragEnd`.

- [ ] **Step 1: Add failing gesture-engine tests**

Add real-landmark fixtures that make thumb-index, thumb-middle, and thumb-ring distances independently shortest. Assert that the first frame enters the matching pinch state; releasing produces exactly one matching action; holding only the left pinch for `dragHoldMs` emits `dragStart`; and nearest valid pinch wins when two fingertips are under the threshold.

```ts
expect(engine.update(leftPinch, 0).state).toBe("left-pinching");
expect(engine.update(tracking, 16).click).toBe(true);
expect(engine.update(rightPinch, 32).state).toBe("right-pinching");
expect(engine.update(tracking, 48).rightClick).toBe(true);
expect(engine.update(ringPinch, 64).state).toBe("double-pinching");
expect(engine.update(tracking, 80).doubleClick).toBe(true);
```

Add scrolling fixtures with index/middle PIP-to-tip direction extended and ring/pinky curled. Assert first frame yields zero, upward and downward displacement yield bounded signed integers, and leaving/re-entering starts from zero without a jump.

- [ ] **Step 2: Verify RED**

Run: `npm test -- src/gesture/gestureEngine.test.ts`

Expected: FAIL because the new states and output events do not exist.

- [ ] **Step 3: Implement minimal pure state machine**

Add landmark joint constants for index/middle/ring/pinky PIP points. Replace the single pinch timestamp with a typed active pinch, choose the nearest candidate under `pinchDistance`, and emit release actions from the previous state. Implement `isScrollPose()` and a scroll reference coordinate with a small dead zone and a per-frame clamp.

```ts
type PinchKind = "left" | "right" | "double";

type GestureOutput = {
  state: GestureState;
  cursor: Landmark | null;
  click: boolean;
  rightClick: boolean;
  doubleClick: boolean;
  scrollY: number;
  dragStart: boolean;
  dragEnd: boolean;
};
```

- [ ] **Step 4: Verify GREEN and regressions**

Run: `npm test -- src/gesture/gestureEngine.test.ts src/gesture/landmarkMetrics.test.ts`

Expected: PASS with existing lost, open-palm, click, and drag behavior preserved under renamed left-pinch state.

- [ ] **Step 5: Commit**

```bash
git add src/gesture/types.ts src/gesture/gestureEngine.ts src/gesture/gestureEngine.test.ts
git commit -m "feat: classify extended hand gestures"
```

### Task 2: Desktop action interfaces and IPC validation

**Files:**
- Modify: `electron/systemMouseAdapter.ts`
- Modify: `electron/systemMouseAdapter.test.ts`
- Modify: `electron/mouseController.ts`
- Modify: `electron/mouseController.test.ts`
- Modify: `electron/preload.ts`
- Modify: `electron/preload.test.ts`
- Modify: `src/electron.d.ts`

**Interfaces:**
- Consumes: trusted normalized pointer payload `{ x, y, state }`, finite scroll delta, and action-only IPC events.
- Produces: `GestureDesktopApi.rightClick()`, `doubleClick()`, `scroll(deltaY)`, and `move(x, y, state)`; controller methods with matching names; RobotJS actions.

- [ ] **Step 1: Add failing adapter, controller, preload, and IPC tests**

Assert RobotJS mappings:

```ts
await systemMouse.rightClick();
expect(robot.mouseClick).toHaveBeenCalledWith("right");
await systemMouse.doubleClick();
expect(robot.mouseClick).toHaveBeenCalledWith("left", true);
await systemMouse.scroll(-3);
expect(robot.scrollMouse).toHaveBeenCalledWith(0, -3);
```

Assert the controller drops these actions outside an active permitted session and while left drag is down, serializes them otherwise, refreshes cursor visibility, and emits overlay pulses. Assert preload rejects non-finite scroll values and invalid visual states; assert untrusted main-process events are ignored.

- [ ] **Step 2: Verify RED**

Run: `npm test -- electron/systemMouseAdapter.test.ts electron/mouseController.test.ts electron/preload.test.ts`

Expected: FAIL because action methods, channels, and validation are absent.

- [ ] **Step 3: Implement the narrow desktop bridge**

Add `rightClick`, `doubleClick`, and `scroll` methods to `SystemMouseAdapter` and `MouseController`. Add an exported `CursorOverlayState` union shared by controller validation. Update movement IPC to accept a validated state and update the overlay in the same queued movement action.

```ts
export type CursorOverlayState =
  | "tracking"
  | "left-pinching"
  | "right-pinching"
  | "double-pinching"
  | "dragging"
  | "scrolling";
```

Keep pointer/action validation at both preload and main-process boundaries. Clamp scroll in the gesture engine, then still reject non-integer or non-finite IPC input in the main process.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- electron/systemMouseAdapter.test.ts electron/mouseController.test.ts electron/preload.test.ts`

Expected: PASS, including pre-existing permission, queue, lifecycle, drag-release, and trusted-frame tests.

- [ ] **Step 5: Commit**

```bash
git add electron/systemMouseAdapter.ts electron/systemMouseAdapter.test.ts electron/mouseController.ts electron/mouseController.test.ts electron/preload.ts electron/preload.test.ts src/electron.d.ts
git commit -m "feat: add desktop gesture actions"
```

### Task 3: Immediate global overlay feedback

**Files:**
- Modify: `electron/main.ts`
- Modify: `electron/main.test.ts`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: `CursorOverlayState` on movement and action pulse names `left`, `right`, `double`.
- Produces: immediate state CSS classes and non-blocking click pulse animation in the 40 × 40 transparent overlay.

- [ ] **Step 1: Add failing overlay tests**

Assert the generated overlay document contains CSS selectors for all states and a pulse animation. Call the controller dependency with each state and assert the overlay receives the exact state message without moving off the centered bounds. Assert pulse refresh failure is caught and does not reject system input.

- [ ] **Step 2: Verify RED**

Run: `npm test -- electron/main.test.ts`

Expected: FAIL because the overlay only supports `tracking` and `dragging`.

- [ ] **Step 3: Implement overlay state renderer**

Replace the inline two-state CSS with compact styles for cyan tracking, compressed green left pinch, violet right pinch, magenta double pinch, amber dragging, and blue double-ring scrolling. Add a message sequence value so repeated click pulses restart their CSS animation. Preserve `cursor:none`, `setIgnoreMouseEvents(true, { forward: true })`, `showInactive()`, and debugger cursor hiding.

- [ ] **Step 4: Verify GREEN and coordinate regressions**

Run: `npm test -- electron/main.test.ts electron/overlayCoordinates.test.ts electron/cursorVisibility.test.ts`

Expected: PASS with exact overlay centering and native-cursor refresh tests unchanged.

- [ ] **Step 5: Commit**

```bash
git add electron/main.ts electron/main.test.ts src/styles.css
git commit -m "feat: show immediate gesture cursor feedback"
```

### Task 4: React dispatch and in-page diagnostics

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Modify: `src/components/Playground.tsx`
- Modify: `src/components/Playground.test.tsx`
- Modify: `src/components/SystemControlPanel.tsx`
- Modify: `src/components/SystemControlPanel.test.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: extended `GestureOutput` from Task 1 and `GestureDesktopApi` from Task 2.
- Produces: first-frame movement with exact overlay state, right-click/double-click/scroll calls, updated instructions, and visible test counters.

- [ ] **Step 1: Add failing application tests**

On the first left-pinch frame at `100 ms`, assert `bridge.move` is already called with `"left-pinching"` and the DOM cursor has `is-left-pinching`; do not advance to `dragHoldMs`. Drive middle and ring pinch/release frames and assert one right-click and one double-click. Drive two-finger scroll frames and assert a signed scroll call while `bridge.move` does not change the system pointer.

Assert click, right-click, double-click, open-palm completion, and hand loss leave the explicit system-control toggle enabled; active drag still performs a safety mouse-up.

- [ ] **Step 2: Verify RED**

Run: `npm test -- src/App.test.tsx src/components/Playground.test.tsx src/components/SystemControlPanel.test.tsx`

Expected: FAIL on missing bridge methods, renamed state, feedback parameter, and diagnostics.

- [ ] **Step 3: Implement dispatch and interface copy**

Extend `INITIAL_OUTPUT`; send active visual state with every non-scroll movement; invoke one-frame actions without awaiting them in the recognition loop; keep failures routed through the existing safety pause. During scrolling, dispatch only `scrollY` and retain the last system pointer coordinate. Update the playground with separate right/double/scroll diagnostics and instructions for all gestures.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- src/App.test.tsx src/components/Playground.test.tsx src/components/SystemControlPanel.test.tsx`

Expected: PASS with first-frame feedback and explicit control persistence proven.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/App.test.tsx src/components/Playground.tsx src/components/Playground.test.tsx src/components/SystemControlPanel.tsx src/components/SystemControlPanel.test.tsx src/styles.css
git commit -m "feat: dispatch and demonstrate extended gestures"
```

### Task 5: Full verification, package, and runtime smoke test

**Files:**
- Modify only if a verification failure exposes a covered defect.

**Interfaces:**
- Consumes: complete application and design acceptance criteria.
- Produces: tested packaged macOS application and one clean running instance.

- [ ] **Step 1: Run the full automated suite**

Run:

```bash
npm test
npm run build
npm run electron:typecheck
npm run electron:make
```

Expected: all tests pass, both TypeScript builds pass, and Electron Forge creates the arm64 application and ZIP.

- [ ] **Step 2: Audit requirements against evidence**

Map every success criterion in `docs/superpowers/specs/2026-08-04-extended-gesture-operations-design.md` to a named test or runtime observation. Confirm no old `pinching` state, two-state overlay signature, or action interface remains.

- [ ] **Step 3: Launch one packaged instance**

Terminate only existing `hand-gesture-control` application processes, launch `out/hand-gesture-control-darwin-arm64/hand-gesture-control.app`, and verify the process remains alive without startup errors. Do not terminate unrelated Electron or browser processes.

- [ ] **Step 4: Runtime smoke test**

Confirm the camera view loads, the system-control switch remains user-controlled, the overlay remains centered and mouse-transparent, the native cursor stays hidden while active, and action states appear immediately. Hardware hand motion remains the final human acceptance check, while deterministic gesture and system adapter behavior is covered by automated tests.

- [ ] **Step 5: Commit any verification-only corrections**

If corrections were needed, commit only those files with a focused message. If none were needed, leave the verified commits unchanged.

