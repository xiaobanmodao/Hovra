# Gesture Recognition Engine V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace single-frame absolute-threshold gesture classification with a stable, scale-invariant, replayable recognition pipeline that prioritizes low false activations while preserving all current desktop actions.

**Architecture:** MediaPipe remains the 21-landmark provider. New focused modules compute palm-local geometry, adaptively filter landmarks, derive continuous gesture features, stabilize candidates over time, lock one active action, and retain a privacy-safe trace ring buffer for deterministic replay. React and Electron consume the same action interface as today, while diagnostics expose candidate progress and allow an explicitly requested local JSON export.

**Tech Stack:** TypeScript, React 19, MediaPipe Tasks Vision 1.0.1, Electron 43, RobotJS, Vitest, Testing Library.

## Global Constraints

- Stability is preferred over minimum latency; normal candidate confirmation is 80 ms and p95 confirmation must remain at or below 120 ms.
- Hand loss or invalid landmarks for up to 120 ms must not generate a click or switch the user-controlled system-control toggle.
- Left, right, double-click, drag, and scroll remain mutually exclusive after one gesture is confirmed.
- No new runtime dependency or neural model is introduced.
- Trace data contains landmarks and derived values only; it never contains image, audio, username, or unrelated filesystem data.
- The existing centered mouse-transparent overlay and native-cursor replacement behavior must remain unchanged except for candidate/release styling.
- Every production behavior is implemented through a failing test observed before implementation.

---

### Task 1: Privacy-safe trace buffer and deterministic replay foundation

**Files:**
- Create: `src/gesture/gestureTrace.ts`
- Create: `src/gesture/gestureTrace.test.ts`
- Create: `src/gesture/gestureReplay.ts`
- Create: `src/gesture/gestureReplay.test.ts`

**Interfaces:**
- Consumes: relative frame timestamp, `Landmark[] | null`, derived diagnostic snapshot, and `GestureOutput`.
- Produces: `GestureTraceBuffer.push(frame)`, `snapshot()`, `serialize()`, `parseGestureTrace(json)`, and `replayGestureTrace(trace, processor)`.

- [ ] **Step 1: Write failing trace-buffer tests**

Assert a 10,000 ms ring buffer evicts frames older than the newest timestamp minus 10 seconds, deep-copies landmarks, rejects non-finite timestamps/features, and serializes only the versioned allow-listed schema.

```ts
const buffer = new GestureTraceBuffer(10_000);
buffer.push(frameAt(0));
buffer.push(frameAt(10_001));
expect(buffer.snapshot().frames.map((frame) => frame.t)).toEqual([10_001]);
expect(buffer.serialize()).not.toContain("image");
```

Assert replay calls the real processor in timestamp order and returns literal output events rather than trusting stored expected outputs.

- [ ] **Step 2: Verify RED**

Run: `npm test -- src/gesture/gestureTrace.test.ts src/gesture/gestureReplay.test.ts`

Expected: FAIL because the trace modules do not exist.

- [ ] **Step 3: Implement trace schema, buffer, parser, and replay**

Use `version: 1`, relative milliseconds, copied 21-point arrays, quality, features, phase, candidate, progress, lock, and emitted event names. `parseGestureTrace` validates every field and limits input to 2 MiB and 600 frames.

```ts
export type GestureTrace = { version: 1; frames: GestureTraceFrame[] };
export function replayGestureTrace<T>(
  trace: GestureTrace,
  process: (landmarks: Landmark[] | null, nowMs: number) => T,
): T[];
```

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- src/gesture/gestureTrace.test.ts src/gesture/gestureReplay.test.ts`

Expected: PASS with malformed, oversized, out-of-order, and privacy allow-list cases covered.

- [ ] **Step 5: Commit**

```bash
git add src/gesture/gestureTrace.ts src/gesture/gestureTrace.test.ts src/gesture/gestureReplay.ts src/gesture/gestureReplay.test.ts
git commit -m "feat: add gesture trace replay foundation"
```

### Task 2: Palm-local geometry and scale-invariant features

**Files:**
- Create: `src/gesture/handGeometry.ts`
- Create: `src/gesture/handGeometry.test.ts`
- Create: `src/gesture/gestureFeatures.ts`
- Create: `src/gesture/gestureFeatures.test.ts`
- Modify: `src/gesture/types.ts`
- Modify: `src/gesture/landmarkMetrics.ts`
- Modify: `src/gesture/landmarkMetrics.test.ts`

**Interfaces:**
- Consumes: complete finite 21-landmark hand.
- Produces: `buildHandGeometry(landmarks): HandGeometry | null` and `extractGestureFeatures(geometry): GestureFeatures`.

- [ ] **Step 1: Write failing scale and rotation invariance tests**

Create literal synthetic hands, then translate, uniformly scale, and rotate them. Assert normalized thumb-to-index/middle/ring ratios differ by no more than `1e-6`; local palm displacement maintains its sign after image rotation; missing/non-finite/degenerate landmarks return `null`.

```ts
expect(extractGestureFeatures(buildHandGeometry(scaleHand(hand, 1.8))!).leftPinchRatio)
  .toBeCloseTo(baseFeatures.leftPinchRatio, 6);
```

Assert two-finger pose scores use MCP/PIP/DIP/tip joint geometry and remain stable under translation and scale.

- [ ] **Step 2: Verify RED**

Run: `npm test -- src/gesture/handGeometry.test.ts src/gesture/gestureFeatures.test.ts`

Expected: FAIL because geometry and feature extraction are absent.

- [ ] **Step 3: Implement palm basis and continuous features**

Add MCP, PIP, DIP, and tip landmark constants. Build origin from wrist and four MCP joints, normalized x-axis from index MCP toward pinky MCP, orthogonal y-axis toward middle MCP, and robust scale from palm width plus wrist-to-middle-MCP length. Export ratios, per-finger extension scores, open-palm score, scroll-pose score, palm center, and local projection helpers.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- src/gesture/handGeometry.test.ts src/gesture/gestureFeatures.test.ts src/gesture/landmarkMetrics.test.ts`

Expected: PASS for near/mid/far synthetic hands, rotations, invalid inputs, and joint-angle pose cases.

- [ ] **Step 5: Commit**

```bash
git add src/gesture/types.ts src/gesture/landmarkMetrics.ts src/gesture/landmarkMetrics.test.ts src/gesture/handGeometry.ts src/gesture/handGeometry.test.ts src/gesture/gestureFeatures.ts src/gesture/gestureFeatures.test.ts
git commit -m "feat: derive scale invariant gesture features"
```

### Task 3: Adaptive landmark filtering

**Files:**
- Create: `src/gesture/adaptiveLandmarkFilter.ts`
- Create: `src/gesture/adaptiveLandmarkFilter.test.ts`

**Interfaces:**
- Consumes: `Landmark[] | null` and monotonic `nowMs`.
- Produces: `AdaptiveLandmarkFilter.update(landmarks, nowMs): Landmark[] | null` and `reset()`.

- [ ] **Step 1: Write failing temporal-filter tests**

Assert stationary alternating noise has lower output range than input, rapid intentional motion reaches at least 80% of the target within 100 ms, timestamps control smoothing, and null input, timestamp reversal, or a gap over 250 ms resets history.

- [ ] **Step 2: Verify RED**

Run: `npm test -- src/gesture/adaptiveLandmarkFilter.test.ts`

Expected: FAIL because the filter module does not exist.

- [ ] **Step 3: Implement dependency-free adaptive low-pass filter**

Use a One-Euro-style scalar filter for x/y/z with configurable `minCutoff`, `beta`, and derivative cutoff. Filter all 21 landmarks using a shared timestamp and return copied data. Reject non-finite landmarks as null rather than propagating NaN.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- src/gesture/adaptiveLandmarkFilter.test.ts`

Expected: PASS for jitter reduction, fast response, reset, and invalid data.

- [ ] **Step 5: Commit**

```bash
git add src/gesture/adaptiveLandmarkFilter.ts src/gesture/adaptiveLandmarkFilter.test.ts
git commit -m "feat: filter hand landmarks adaptively"
```

### Task 4: Hysteresis classifier and time-based stabilizer

**Files:**
- Create: `src/gesture/gestureClassifier.ts`
- Create: `src/gesture/gestureClassifier.test.ts`
- Create: `src/gesture/gestureStabilizer.ts`
- Create: `src/gesture/gestureStabilizer.test.ts`
- Modify: `src/gesture/config.ts`
- Create: `src/gesture/config.test.ts`
- Modify: `src/gesture/types.ts`

**Interfaces:**
- Consumes: `GestureFeatures`, current locked gesture, input quality, and `nowMs`.
- Produces: `GestureCandidate`, `GestureStabilizerOutput { phase, candidate, lockedGesture, progress, activated, released, timedOut }`.

- [ ] **Step 1: Write failing classifier and stabilizer tests**

Assert sensitivity maps to bounded normalized enter/exit thresholds, exit is always wider than entry, and the strongest pinch wins only before lock. Assert 79 ms does not activate, 80 ms activates, a one-to-three-frame wobble does not release, 60 ms confirmed release does, and a 120 ms neutral cooldown blocks a different gesture.

```ts
expect(stabilizer.update(leftCandidate, 79).activated).toBeNull();
expect(stabilizer.update(leftCandidate, 80).activated).toBe("left");
expect(stabilizer.update(rightCandidate, 90).lockedGesture).toBe("left");
```

Assert invalid input never activates; 120 ms continuous invalid input cancels clicks, while an active drag returns a timeout signal for safe release.

- [ ] **Step 2: Verify RED**

Run: `npm test -- src/gesture/gestureClassifier.test.ts src/gesture/gestureStabilizer.test.ts`

Expected: FAIL because classifier and stabilizer are absent.

- [ ] **Step 3: Implement classifier, stable preset, and phase machine**

Replace raw `pinchDistance` with `gestureSensitivity` from `0` to `1`, default `0.5`. Map it to a pinch entry ratio from `0.24` to `0.34`, exit ratio equal to entry plus `0.12`, fixed 80 ms entry, 60 ms release, 100 ms scroll entry, 120 ms cooldown, 120 ms dropout grace, and 350 ms drag hold. Use time durations, not assumed frame counts.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- src/gesture/gestureClassifier.test.ts src/gesture/gestureStabilizer.test.ts src/gesture/config.test.ts`

Expected: PASS for threshold boundaries, lock, hysteresis, timing, cooldown, and dropout safety.

- [ ] **Step 5: Commit**

```bash
git add src/gesture/config.ts src/gesture/config.test.ts src/gesture/types.ts src/gesture/gestureClassifier.ts src/gesture/gestureClassifier.test.ts src/gesture/gestureStabilizer.ts src/gesture/gestureStabilizer.test.ts
git commit -m "feat: stabilize gesture candidates over time"
```

### Task 5: Recognition engine V2 integration and action compatibility

**Files:**
- Modify: `src/gesture/gestureEngine.ts`
- Modify: `src/gesture/gestureEngine.test.ts`
- Create: `src/gesture/fixtures/stable-gesture-sequences.ts`
- Create: `src/gesture/gestureEngine.replay.test.ts`
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`

**Interfaces:**
- Consumes: modules from Tasks 1–4.
- Produces: existing `GestureOutput` action fields plus `phase`, `candidate`, `lockedGesture`, `confirmationProgress`, and `diagnostics`.

- [ ] **Step 1: Write failing end-to-end sequence and replay tests**

Cover 20 synthetic repetitions for each click kind at three scales, neutral pointer motion without clicks, overlapping fingertip jitter without cross-action switching, 1–3 dropped frames, long left pinch drag, scroll entry/exit, and confirmation latency at or below 120 ms. Assert the existing Electron bridge receives the same left/right/double/drag/scroll calls and explicit system control remains enabled.

- [ ] **Step 2: Verify RED**

Run: `npm test -- src/gesture/gestureEngine.test.ts src/gesture/gestureEngine.replay.test.ts src/App.test.tsx`

Expected: FAIL because the existing engine activates from one raw frame and lacks diagnostics.

- [ ] **Step 3: Replace engine internals with the V2 pipeline**

Compose filter → geometry → features → classifier → stabilizer → locked action state machine → trace buffer. Click only after confirmed release; drag starts 350 ms after confirmed left activation; timeout loss cancels click and ends drag. Preserve the current cursor landmark and one-frame action booleans so desktop IPC does not need semantic changes.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- src/gesture/gestureEngine.test.ts src/gesture/gestureEngine.replay.test.ts src/App.test.tsx`

Expected: PASS for the quantitative synthetic acceptance suite and existing action dispatch behavior.

- [ ] **Step 5: Commit**

```bash
git add src/gesture/gestureEngine.ts src/gesture/gestureEngine.test.ts src/gesture/fixtures/stable-gesture-sequences.ts src/gesture/gestureEngine.replay.test.ts src/App.tsx src/App.test.tsx
git commit -m "feat: integrate stable gesture engine v2"
```

### Task 6: Candidate diagnostics, sensitivity control, and local trace export

**Files:**
- Create: `src/components/GestureDiagnostics.tsx`
- Create: `src/components/GestureDiagnostics.test.tsx`
- Modify: `src/components/CalibrationPanel.tsx`
- Modify: `src/components/CalibrationPanel.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Modify: `src/styles.css`
- Modify: `electron/preload.ts`
- Modify: `electron/preload.test.ts`
- Modify: `electron/main.ts`
- Modify: `electron/main.test.ts`
- Create: `electron/gestureTraceExporter.ts`
- Create: `electron/gestureTraceExporter.test.ts`
- Modify: `src/electron.d.ts`

**Interfaces:**
- Consumes: V2 output diagnostics and `GestureTraceBuffer.serialize()`.
- Produces: candidate/releasing overlay states, `gestureSensitivity` control, and `saveGestureTrace(json): Promise<"saved" | "cancelled">`.

- [ ] **Step 1: Write failing UI, overlay, preload, and exporter tests**

Assert candidate name, locked action, phase, `3/4`-style frame progress, hand scale, three pinch ratios, scroll score, and quality render from real props. Assert sensitivity is the only pinch control and stays in `[0,1]`. Assert overlay supports pale candidate and dim releasing classes.

Assert preload rejects trace strings over 2 MiB or invalid JSON; the main process accepts only trusted renderer events; exporter uses a `.json` save dialog, writes only after user selection, returns `cancelled` without writing, and reports write failure without changing mouse control.

- [ ] **Step 2: Verify RED**

Run: `npm test -- src/components/GestureDiagnostics.test.tsx src/components/CalibrationPanel.test.tsx electron/gestureTraceExporter.test.ts electron/preload.test.ts electron/main.test.ts`

Expected: FAIL because diagnostics, sensitivity, candidate styling, and export bridge do not exist.

- [ ] **Step 3: Implement diagnostics and export path**

Add the diagnostics component beside calibration, derive overlay state from `phase + candidate`, and replace the pinch threshold stepper with sensitivity. Expose one fixed save channel; main validates version/schema before showing `dialog.showSaveDialog`, then writes UTF-8 JSON using `node:fs/promises`. Browser demo displays diagnostics but omits the save button when no Electron bridge exists.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- src/components/GestureDiagnostics.test.tsx src/components/CalibrationPanel.test.tsx src/App.test.tsx electron/gestureTraceExporter.test.ts electron/preload.test.ts electron/main.test.ts`

Expected: PASS with privacy, cancellation, trust-boundary, UI, and overlay behavior covered.

- [ ] **Step 5: Commit**

```bash
git add src/components/GestureDiagnostics.tsx src/components/GestureDiagnostics.test.tsx src/components/CalibrationPanel.tsx src/components/CalibrationPanel.test.tsx src/App.tsx src/App.test.tsx src/styles.css electron/preload.ts electron/preload.test.ts electron/main.ts electron/main.test.ts electron/gestureTraceExporter.ts electron/gestureTraceExporter.test.ts src/electron.d.ts
git commit -m "feat: add gesture diagnostics and trace export"
```

### Task 7: Full acceptance, package, and runtime validation

**Files:**
- Modify only if verification exposes a defect covered by the approved specification.

**Interfaces:**
- Consumes: completed V2 pipeline and packaging configuration.
- Produces: clean tested repository, packaged macOS arm64 app, and a running final instance.

- [ ] **Step 1: Run all automated gates**

```bash
npm test
npm run build
npm run electron:typecheck
npm run electron:make
```

Expected: zero failures, clean TypeScript builds, Electron package, and arm64 ZIP.

- [ ] **Step 2: Audit the specification requirement by requirement**

Map every success criterion in `docs/superpowers/specs/2026-08-04-gesture-recognition-engine-v2-design.md` to a named unit, sequence, replay, UI, IPC, or runtime test. Treat the 20-repetition and p95 tests as required evidence, not optional diagnostics.

- [ ] **Step 3: Launch only the packaged project app**

Stop only the existing exact `hand-gesture-control.app` main process, launch `out/hand-gesture-control-darwin-arm64/hand-gesture-control.app`, and confirm camera active, system control explicitly paused, V2 diagnostics visible, and the process remains alive.

- [ ] **Step 4: Capture a real trace for human motion acceptance**

With the user operating the hand, save one local diagnostic trace and replay it through the test harness. Verify 20 attempts per action, two minutes neutral motion, near/mid/far distance, cross-action errors, dropout behavior, and p95 latency. If hardware input is unavailable to the agent, leave this as an explicit user acceptance item and do not claim those physical-environment measurements were performed.

- [ ] **Step 5: Commit verification-only corrections if needed**

Commit only files needed to fix a witnessed verification defect. If no correction is needed, preserve the already verified commits.
