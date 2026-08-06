# Stable Scroll Restoration Implementation Plan

> **For Codex:** Execute this plan task by task with test-driven development. Keep double-click disabled and preserve the explicit system-control switch.

**Goal:** Restore a deliberate two-finger vertical scroll gesture with strict pose geometry, temporal confirmation, mutually exclusive action locking, bounded output, desktop dispatch, and browser feedback.

**Architecture:** Extend the current stable hand metrics with a palm anchor and four-finger pose score. Feed strict scroll evidence into a dedicated frame-based state machine, then integrate it as a third mutually exclusive `GestureEngine` lock beside left and right pinch. Reuse the existing Electron scroll bridge and cursor overlay.

**Tech Stack:** TypeScript, React, Vitest, MediaPipe landmarks, Electron Forge, RobotJS.

---

## Constraints

- Preserve left click, right click, long press/drag, open-palm stop, tracking stabilization, and explicit system-control ownership.
- Only observed, gesture-safe frames may acquire or advance scroll.
- Do not restore double-click or add new permissions, IPC channels, calibration controls, persistence, or network traffic.
- Use red-green tests before every production change.
- Keep scroll values as bounded integers in `[-12, 12]`.

### Task 1: Add strict two-finger pose geometry

**Files:**

- Modify: `src/gesture/stableHandMetrics.ts`
- Modify: `src/gesture/stableHandMetrics.test.ts`

**Step 1: Write failing tests**

Add cases for a valid scroll fixture, scale/rotation/aspect invariance, open palm, tracking pose, fist, left/right pinch, thumb-ring overlap, and malformed depth. Require:

```ts
expect(metrics).toMatchObject({
  scrollPoseContact: true,
  scrollPoseScore: expect.any(Number),
  scrollAnchor: expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }),
});
expect(metrics!.scrollPoseScore).toBeGreaterThanOrEqual(0.8);
```

**Step 2: Verify red**

Run `npx vitest run src/gesture/stableHandMetrics.test.ts`.

**Step 3: Implement geometry**

Refactor the existing per-finger open-palm measurement so it exposes extension scores. Compute the scroll score as the minimum of two extended and two curled conditions. Add thumb separation/depth gates and a wrist-plus-MCP palm anchor. Expose contact and retained-pose booleans using `0.80`/`0.55` hysteresis.

**Step 4: Verify green**

Run the focused test again.

**Step 5: Commit**

Commit as `feat: add strict two finger scroll metrics`.

### Task 2: Build the pure scroll state machine

**Files:**

- Create: `src/gesture/scrollGestureStateMachine.ts`
- Create: `src/gesture/scrollGestureStateMachine.test.ts`

**Step 1: Write failing tests**

Cover five-frame entry, no candidate output, three-frame release, release recovery without jump, immediate reset on null/invalid time, scale-normalized movement, dead-zone accumulation, residual accumulation, opposite signs, and `[-12, 12]` clamping.

Example:

```ts
expect(machine.update(evidence(0.50), 64)).toMatchObject({
  phase: "active",
  activated: true,
  scrollY: 0,
});
expect(machine.update(evidence(0.46), 80).scrollY).toBeGreaterThan(0);
```

**Step 2: Verify red**

Run `npx vitest run src/gesture/scrollGestureStateMachine.test.ts`.

**Step 3: Implement state machine**

Use five contact frames, three release frames, a palm-scale dead zone of `0.015`, gain `28`, integer residual accumulation, and per-frame clamp `12`. Reset anchor and residual at every cancellation or reactivation.

**Step 4: Verify green**

Run the focused test.

**Step 5: Commit**

Commit as `feat: add bounded scroll gesture state machine`.

### Task 3: Integrate scrolling into engine, trace, and regression

**Files:**

- Modify: `src/gesture/gestureEngine.ts`
- Modify: `src/gesture/gestureEngine.test.ts`
- Modify: `src/gesture/gestureEngine.replay.test.ts`
- Modify: `src/gesture/gestureRegression.ts`
- Modify: `src/gesture/gestureRegression.test.ts`
- Modify: `src/gesture/fixtures/gestureRegressionCases.ts`
- Modify: `src/gesture/gestureRegressionSuite.test.ts`

**Step 1: Write failing engine tests**

Require five safe pose frames before locking, zero entry jump, signed bounded movement, candidate/releasing phases, no clicks or drag, mutual exclusion with left/right, no output on open palm/fist/dropout/invalid time, and trace events with real pose score.

**Step 2: Write failing regression tests**

Add `scroll` to the semantic event union and collector. Add a valid scroll trace with upward and downward motion and ensure all existing negative cases reject unexpected scroll events.

**Step 3: Verify red**

Run the engine and regression test files.

**Step 4: Integrate the third lock**

Extend `gestureLock` to `left | right | scroll`. Give scroll acquisition priority only when its strict pose contact is true; suppress pinch machines while scrolling and reset scroll while another action owns the lock. Map state/phase/candidate/progress, emit `scrollY`, populate diagnostics, and record real scroll trace fields/events.

**Step 5: Verify green**

Run the focused engine, replay, trace, and regression suite.

**Step 6: Commit**

Commit as `feat: restore mutually exclusive scrolling`.

### Task 4: Dispatch and display scrolling

**Files:**

- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Modify: `src/components/Playground.tsx`
- Modify: `src/components/Playground.test.tsx`
- Modify: `src/components/SystemControlPanel.tsx`
- Modify: `src/components/SystemControlPanel.test.tsx`
- Modify: `src/components/GestureDiagnostics.tsx`
- Modify: `src/components/GestureDiagnostics.test.tsx`
- Modify: `README.md`

**Step 1: Write failing UI/dispatch tests**

Drive scroll pose entry and vertical movement through `App`. Assert the system pointer freezes from the candidate frame onward, overlay states include `candidate-scroll`, `scrolling`, and `releasing-scroll`, signed integer deltas call `bridge.scroll`, no mouse/click actions occur, and system control remains enabled. Require Chinese instructions, cumulative playground scroll output, and a real diagnostic score.

**Step 2: Verify red**

Run the focused React and Electron bridge tests.

**Step 3: Implement dispatch and feedback**

Generalize cursor state mapping for scroll. Freeze browser/system cursor during scroll intent, dispatch nonzero `scrollY` through the serialized command queue, retain the last pointer coordinate, show the existing blue cursor state, add playground accumulation, and update all user-facing Chinese text and README checks.

**Step 4: Verify green**

Run focused App/component tests plus preload, main, and mouse controller tests.

**Step 5: Commit**

Commit as `feat: dispatch and display stable scrolling`.

### Task 5: Full verification and integration

**Step 1: Run complete verification**

Run in the feature worktree:

```bash
npm run test:gesture-regression
npm test
npm run electron:typecheck
npm run build
git diff --check
```

**Step 2: Merge and verify main**

Fast-forward merge `codex/restore-scroll` into `main`, rerun the full suite on the merged tree, push `main`, remove the owned `.worktrees/restore-scroll` worktree, and delete the merged branch.

**Step 3: Restart the running desktop app**

Restart the existing Electron development session and confirm no uncaught error appears. Existing MediaPipe/OpenGL warnings are non-blocking.
