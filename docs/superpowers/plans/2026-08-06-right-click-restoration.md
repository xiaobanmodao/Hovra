# Stable Right Click Restoration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore one reliable global right-click from a short thumb–middle-finger pinch without changing current left-click, long-press drag, movement, or open-palm stop behavior.

**Architecture:** Extend the aspect-corrected 3D hand metrics with strict middle-finger pinch evidence, add a no-hold mode to the proven click state machine, and coordinate left/right machines through one engine-owned action lock. Reuse the existing Electron right-click bridge and overlay while expanding browser feedback and semantic trace regressions.

**Tech Stack:** TypeScript, React, Vitest, existing MediaPipe landmark input, Electron preload/IPC, RobotJS. No new dependencies.

## Global Constraints

- Right click is thumb + middle finger and fires once only after confirmed release.
- Require finite thumb/middle depth plus index and ring separation at the release threshold.
- Right contact requires at least 3 frames; release requires 2 frames; contact beyond 650 ms cancels.
- Left click keeps its current thresholds, 420 ms hold threshold, and drag behavior.
- Do not restore double click, scrolling, or other shortcuts.
- Do not add IPC channels, dependencies, network transfer, camera recording, or a trace schema version.
- All behavior changes use test-driven development and independently passing commits.

---

### Task 1: Strict spatial right-pinch metrics

**Files:**
- Modify: `src/gesture/stableHandMetrics.ts`
- Modify: `src/gesture/stableHandMetrics.test.ts`
- Modify: `src/gesture/fixtures/stable-gesture-sequences.ts`

**Interfaces:**
- Consumes: existing landmark constants, aspect-ratio correction, palm scale, and stable thresholds.
- Produces on `StableHandMetrics`: `rightScreenPinchRatio`, `rightDepthPinchRatio`, `rightSpatialPinchRatio`, `rightDepthReliable`, `rightPinchContact`, `rightPinchSeparated`, and `rightPinchBlockingReason`.

- [ ] **Step 1: Write failing geometry tests**

```ts
const right = measureStableHand(makeGestureHand("right"), 16 / 9, 0.5)!;
expect(right).toMatchObject({
  rightDepthReliable: true,
  rightPinchContact: true,
  rightPinchBlockingReason: "none",
});
expect(right.spatialPinchRatio).toBeGreaterThanOrEqual(right.pinchExitRatio);
expect(measureStableHand(makeGestureHand("left"), 16 / 9, 0.5)?.rightPinchContact)
  .toBe(false);
```

Also add literal tests for scale/rotation invariance, missing middle-tip depth, projected thumb/middle overlap with separated depth, and ambiguity when thumb is also too close to index or ring.

- [ ] **Step 2: Verify the geometry tests fail**

Run: `npx vitest run src/gesture/stableHandMetrics.test.ts`

Expected: FAIL because the right-pinch fields do not exist.

- [ ] **Step 3: Implement reusable target-pinch measurement**

Compute thumb-to-tip screen, depth, and spatial ratios for index, middle, and ring in the same metric coordinate system. Keep existing left fields unchanged and implement:

```ts
const rightPinchContact = rightDepthReliable
  && rightSpatialPinchRatio <= thresholds.enterRatio
  && spatialPinchRatio >= thresholds.exitRatio
  && ringSpatialPinchRatio >= thresholds.exitRatio;
const rightPinchSeparated = !rightDepthReliable
  || rightSpatialPinchRatio >= thresholds.exitRatio;
```

Return `depth` for projected middle overlap separated in depth, otherwise `image`; return `none` only for strict right contact. Adjust the synthetic right-hand fixture only if necessary to represent literal thumb–middle contact with index and ring outside release.

- [ ] **Step 4: Run focused geometry tests**

Run: `npx vitest run src/gesture/stableHandMetrics.test.ts src/gesture/gestureFeatures.test.ts`

Expected: PASS and existing left/open-palm/fist metrics remain green.

- [ ] **Step 5: Commit spatial metrics**

```bash
git add src/gesture/stableHandMetrics.ts src/gesture/stableHandMetrics.test.ts src/gesture/fixtures/stable-gesture-sequences.ts
git commit -m "feat: add strict spatial right pinch metrics"
```

### Task 2: No-hold short-pinch state machine mode

**Files:**
- Modify: `src/gesture/pinchClickStateMachine.ts`
- Modify: `src/gesture/pinchClickStateMachine.test.ts`

**Interfaces:**
- Consumes: existing `PinchClickEvidence`, motion/travel gates, release hysteresis and cooldown.
- Produces: `PinchClickConfig.holdEnabled: boolean`, default `true`; when false, `longPressMs` becomes the maximum tap duration and returns `timeout` without click or hold.

- [ ] **Step 1: Write failing no-hold tests**

```ts
const machine = new PinchClickStateMachine({
  holdEnabled: false,
  requiredContactFrames: 3,
  longPressMs: 650,
});
machine.update(separated, 0);
machine.update(contact, 16);
machine.update(contact, 32);
machine.update(contact, 48);
expect(machine.update(contact, 666)).toMatchObject({
  clicked: false,
  holdStarted: false,
  holding: false,
  blockingReason: "timeout",
  phase: "cooldown",
});
```

Verify valid short contact/release clicks once, a held no-hold gesture never emits `holdStarted`, and the default left machine still starts a hold at 420 ms.

- [ ] **Step 2: Verify the no-hold tests fail**

Run: `npx vitest run src/gesture/pinchClickStateMachine.test.ts`

Expected: FAIL because `holdEnabled` is absent and a long contact enters holding.

- [ ] **Step 3: Implement configuration and timeout**

Add `holdEnabled` to the config and resolver with default `true`. In the active contact branch at `longPressMs`, preserve the current hold path when enabled; otherwise call the cancellation path and return a non-click output with `blockingReason: "timeout"`.

- [ ] **Step 4: Run state-machine and left-engine tests**

Run: `npx vitest run src/gesture/pinchClickStateMachine.test.ts src/gesture/gestureEngine.test.ts`

Expected: PASS; existing left short-click and hold tests remain unchanged.

- [ ] **Step 5: Commit no-hold mode**

```bash
git add src/gesture/pinchClickStateMachine.ts src/gesture/pinchClickStateMachine.test.ts
git commit -m "feat: add short-pinch timeout mode"
```

### Task 3: Engine action lock, right output, traces and regression

**Files:**
- Modify: `src/gesture/gestureEngine.ts`
- Modify: `src/gesture/gestureEngine.test.ts`
- Modify: `src/gesture/gestureEngine.replay.test.ts`
- Modify: `src/gesture/gestureRegression.ts`
- Modify: `src/gesture/gestureRegression.test.ts`
- Modify: `src/gesture/fixtures/gestureRegressionCases.ts`
- Modify: `src/gesture/gestureRegressionSuite.test.ts`

**Interfaces:**
- Consumes: right metrics from Task 1 and no-hold mode from Task 2.
- Produces: mutually exclusive left/right recognition, `rightClick` output and trace event, and semantic `rightClick` regression support.

- [ ] **Step 1: Write failing engine and regression tests**

Drive separated warm-up, three right-contact frames and two release frames:

```ts
expect(outputs.some((output) => output.state === "right-pinching")).toBe(true);
expect(outputs.filter((output) => output.rightClick)).toHaveLength(1);
expect(outputs.some((output) => output.click || output.dragStart || output.dragEnd)).toBe(false);
expect(engine.getTrace().frames.at(-1)?.events).toEqual(["rightClick"]);
```

Add 650 ms timeout, missing-hand, open-palm cancellation, ambiguous contact, left pinch without right-click, and unchanged left drag cases. Extend `GestureRegressionEventKind` and collection with `rightClick`; add `右键短捏合` to the fixed matrix and ensure all negative cases reject unexpected right-clicks.

- [ ] **Step 2: Verify engine/regression tests fail**

Run: `npx vitest run src/gesture/gestureEngine.test.ts src/gesture/gestureEngine.replay.test.ts src/gesture/gestureRegression.test.ts src/gesture/gestureRegressionSuite.test.ts`

Expected: FAIL because engine output is hard-coded to `rightClick: false` and regression ignores it.

- [ ] **Step 3: Implement two machines and one action lock**

Rename the current field to `leftPinch`; add `rightPinch` with `holdEnabled: false`, `longPressMs: 650`, contact frames `Math.max(3, settings.pinchContactFrames ?? 2)`, and existing release/speed/travel values. Add `gestureLock: "left" | "right" | null`.

Establish a lock only from strict contact. Route real evidence to the locked machine and suppressed evidence to the other. Derive state, phase, candidate, lock, progress and click cursor from the selected output. Right output keeps `longPressProgress: 0` and never maps hold events. Unsafe/missing frames reset the lock and feed null to both machines. Open-palm suppression must retain a left `holdEnded` safety pulse.

Make the output helper accept `rightClick`; record real `features.rightPinchRatio`, append `rightClick` to trace events, and select diagnostic votes/blocking reason from the locked machine.

- [ ] **Step 4: Run engine and regression tests**

Run: `npx vitest run src/gesture/stableHandMetrics.test.ts src/gesture/pinchClickStateMachine.test.ts src/gesture/gestureEngine.test.ts src/gesture/gestureEngine.replay.test.ts src/gesture/gestureRegression.test.ts src/gesture/gestureRegressionSuite.test.ts src/gesture/gestureTrace.test.ts`

Expected: PASS with one right-click event, no cross-action events and legacy trace parsing unchanged.

- [ ] **Step 5: Commit engine integration**

```bash
git add src/gesture/gestureEngine.ts src/gesture/gestureEngine.test.ts src/gesture/gestureEngine.replay.test.ts src/gesture/gestureRegression.ts src/gesture/gestureRegression.test.ts src/gesture/fixtures/gestureRegressionCases.ts src/gesture/gestureRegressionSuite.test.ts
git commit -m "feat: restore mutually exclusive right click recognition"
```

### Task 4: Desktop dispatch and browser feedback

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Modify: `src/components/Playground.tsx`
- Modify: `src/components/Playground.test.tsx`
- Modify: `src/components/SystemControlPanel.tsx`
- Modify: `src/components/SystemControlPanel.test.tsx`
- Modify: `README.md`

**Interfaces:**
- Consumes: `GestureOutput.rightClick`, `clickCursor`, existing `desktopBridge.rightClick()` and right overlay states.
- Produces: locked-coordinate global right click, candidate/release cursor feedback, browser right-click count and Chinese instructions.

- [ ] **Step 1: Write failing React integration tests**

In `App.test.tsx`, run right contact/release and assert one right-click, no left/mouse-down action, a locked-point move before right click, and visible `已启用`. Leave only `double` and `scroll` in the disabled-action table. In `Playground.test.tsx`, require `拇指 + 中指：右键` and verify an in-target right pulse increments `右键次数` while an outside pulse does not. Require active system-control help to mention right click.

- [ ] **Step 2: Verify React tests fail**

Run: `npx vitest run src/App.test.tsx src/components/Playground.test.tsx src/components/SystemControlPanel.test.tsx`

Expected: FAIL because the renderer does not dispatch or display right clicks.

- [ ] **Step 3: Implement renderer dispatch and feedback**

Extend `desktopCursorState` with `candidate-right` and `releasing-right`. Before left click, handle `output.rightClick` by moving to mapped `clickCursor` and awaiting `desktopBridge.rightClick()`. Do not change the system-control flag.

Add a right-click count in `Playground` using the same bounds rule as left click. Update hints, active system-control text, README feature list and verification list; do not claim double click or scroll.

- [ ] **Step 4: Run renderer and Electron boundary tests**

Run: `npx vitest run src/App.test.tsx src/components/Playground.test.tsx src/components/SystemControlPanel.test.tsx electron/preload.test.ts electron/mouseController.test.ts electron/main.test.ts`

Expected: PASS and existing Electron right-click boundary tests remain green.

- [ ] **Step 5: Commit renderer integration**

```bash
git add src/App.tsx src/App.test.tsx src/components/Playground.tsx src/components/Playground.test.tsx src/components/SystemControlPanel.tsx src/components/SystemControlPanel.test.tsx README.md
git commit -m "feat: dispatch and display stable right clicks"
```

### Task 5: Full verification and publication

**Files:**
- No source changes expected.

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces: verified `main` and restarted Electron development app.

- [ ] **Step 1: Run focused regression**

Run: `npm run test:gesture-regression`

Expected: evaluator and expanded fixed matrix pass.

- [ ] **Step 2: Run complete verification**

Run in parallel where possible: `npm test`, `npm run electron:typecheck`, `npm run build`, and `git diff --check`.

Expected: every command exits zero without failures or type errors.

- [ ] **Step 3: Restart Electron and inspect startup**

Restart the existing Electron Forge session. Confirm no uncaught renderer/main/preload exception; MediaPipe informational GPU or projection warnings are allowed.

- [ ] **Step 4: Merge and publish using standing approval**

Fast-forward `codex/restore-right-click` into `main`, rerun `npm test` on `main`, push `main`, and delete the local feature branch only after push succeeds.

## Plan self-review

- Spec coverage: Task 1 covers 3D geometry/exclusivity; Task 2 short-only timing; Task 3 lock/safety/trace/regression; Task 4 global dispatch/Chinese feedback; Task 5 runtime/build/publication.
- Placeholder scan: every behavior, type, command, failure condition and commit scope is explicit.
- Type consistency: metric names, `holdEnabled`, engine outputs and renderer consumers match across tasks.
