# Gesture Trace Regression Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replay fixed raw hand-landmark traces through the real Hovra gesture engine and fail automatically on missed, duplicate, out-of-window, or unexpected semantic actions.

**Architecture:** A pure regression evaluator validates a case, replays its trace through a fresh `GestureEngine`, converts outputs to a small semantic event stream, and matches those events against non-overlapping time windows. A separate fixture module builds privacy-safe raw landmark traces for the six critical interaction scenarios; Vitest runs them in the existing CI path.

**Tech Stack:** TypeScript, Vitest, existing `GestureEngine`, `GestureTraceV5`, and synthetic landmark fixtures. No new dependencies.

## Global Constraints

- Do not add UI, camera capture, video, image, audio, or personal data.
- Do not trust stored trace phases, locks, or events as current expected output.
- Replay must use strict existing trace parsing and the real current `GestureEngine`.
- Default behavior rejects every unmatched click, drag-start, drag-end, or pause event.
- Keep right-click and scrolling outside this phase.
- Use test-driven development and commit each independently passing task.

---

### Task 1: Semantic event-window regression evaluator

**Files:**
- Create: `src/gesture/gestureRegression.ts`
- Create: `src/gesture/gestureRegression.test.ts`

**Interfaces:**
- Consumes: `GestureTrace`, `GestureEngine.update(...)`, and `replayGestureTrace(...)`.
- Produces: `runGestureRegression(testCase): GestureRegressionReport` and `evaluateGestureEvents(testCase, actualEvents): GestureRegressionReport`.

- [ ] **Step 1: Write failing evaluator tests**

Cover an exact click match, a missing click, duplicate clicks, an unexpected drag, pause de-duplication via the real runner, overlapping same-kind expectation windows, inverted windows, invalid counts, and a case where `minCount > maxCount`.

```ts
const testCase: GestureRegressionCase = {
  name: "短捏合",
  trace: emptyTrace,
  expectations: [{ event: "click", startMs: 80, endMs: 120 }],
};

expect(evaluateGestureEvents(testCase, [{ event: "click", t: 96 }])).toMatchObject({
  passed: true,
  failures: [],
});
expect(evaluateGestureEvents(testCase, [
  { event: "click", t: 96 },
  { event: "click", t: 112 },
]).failures).toContainEqual(expect.objectContaining({ code: "count" }));
```

- [ ] **Step 2: Run the tests and verify the red state**

Run: `npx vitest run src/gesture/gestureRegression.test.ts`

Expected: FAIL because `gestureRegression.ts` does not exist.

- [ ] **Step 3: Implement strict types, validation, collection, and matching**

Use these public types:

```ts
export type GestureRegressionEventKind = "click" | "dragStart" | "dragEnd" | "pause";
export type GestureRegressionEvent = { event: GestureRegressionEventKind; t: number };
export type GestureRegressionExpectation = {
  event: GestureRegressionEventKind;
  startMs: number;
  endMs: number;
  minCount?: number;
  maxCount?: number;
};
export type GestureRegressionCase = {
  name: string;
  trace: GestureTrace;
  expectations: GestureRegressionExpectation[];
};
export type GestureRegressionFailure = {
  code: "count" | "unexpected";
  message: string;
};
export type GestureRegressionReport = {
  name: string;
  passed: boolean;
  events: GestureRegressionEvent[];
  failures: GestureRegressionFailure[];
};
```

`runGestureRegression` validates the trace via `replayGestureTrace`, creates a fresh engine, emits boolean output actions at their source frame timestamp, and emits `pause` only on the transition from a non-paused output to `state === "paused"`. `evaluateGestureEvents` sorts deterministic failures, defaults each window to exactly one occurrence, rejects overlapping same-kind windows, marks all events inside a matching window as consumed, reports invalid counts through `TypeError`, and reports every unconsumed event as `unexpected`.

- [ ] **Step 4: Run the evaluator tests**

Run: `npx vitest run src/gesture/gestureRegression.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the evaluator**

```bash
git add src/gesture/gestureRegression.ts src/gesture/gestureRegression.test.ts
git commit -m "feat: add semantic gesture regression evaluator"
```

### Task 2: Six-scenario raw trace regression matrix

**Files:**
- Create: `src/gesture/fixtures/gestureRegressionCases.ts`
- Create: `src/gesture/gestureRegressionSuite.test.ts`

**Interfaces:**
- Consumes: `makeGestureHand`, `GestureTraceV5`, and `runGestureRegression` from Task 1.
- Produces: `GESTURE_REGRESSION_CASES: readonly GestureRegressionCase[]`.

- [ ] **Step 1: Write the failing suite test**

```ts
describe.each(GESTURE_REGRESSION_CASES)("$name", (testCase) => {
  it("通过真实引擎自动回放", () => {
    const report = runGestureRegression(testCase);
    expect(report.failures, report.failures.map((failure) => failure.message).join("\n"))
      .toEqual([]);
    expect(report.passed).toBe(true);
  });
});
```

Add a coverage assertion that case names are exactly `短捏合`、`长按`、`张掌停止`、`握拳防误触`、`纵深分离防误触` and `移动防误触`.

- [ ] **Step 2: Run the suite and verify the red state**

Run: `npx vitest run src/gesture/gestureRegressionSuite.test.ts`

Expected: FAIL because the fixture module does not exist.

- [ ] **Step 3: Build raw trace helpers and cases**

Construct valid version-5 frames with raw `landmarks` and `worldLandmarks`; keep stored diagnostics `features: null`, `phase: "neutral"`, empty stored `events`, and never derive expectations from an engine run.

```ts
const rawFrame = (t: number, image: Landmark[] | null, world = image): GestureTraceFrame => ({
  t,
  landmarks: image,
  worldLandmarks: world,
  quality: image ? 1 : 0,
  features: null,
  phase: image ? "neutral" : "lost",
  candidate: null,
  confirmationProgress: 0,
  lockedGesture: null,
  events: [],
});
```

Use 16 ms timestamps and at least three tracking warm-up frames. The short pinch expects one `click` after release. The long press holds longer than 420 ms and expects one `dragStart` followed by one `dragEnd`, with no click window. The open palm expects one `pause`. Fist, depth-separated image overlap, and moving tracking traces use empty expectation arrays so every action becomes an automatic false-positive failure.

- [ ] **Step 4: Run and adjust only justified time-window boundaries**

Run: `npx vitest run src/gesture/gestureRegressionSuite.test.ts src/gesture/gestureRegression.test.ts`

Expected: all scenarios PASS. If an event is outside the initial window, inspect the report timestamp and widen the window only enough to include the documented confirmation or 420 ms hold threshold; do not suppress unexpected events.

- [ ] **Step 5: Commit the regression matrix**

```bash
git add src/gesture/fixtures/gestureRegressionCases.ts src/gesture/gestureRegressionSuite.test.ts
git commit -m "test: add critical gesture trace regression matrix"
```

### Task 3: Command integration and complete verification

**Files:**
- Modify: `package.json`
- Modify: `README.md`

**Interfaces:**
- Consumes: the two regression test files from Tasks 1 and 2.
- Produces: `npm run test:gesture-regression` and a short contributor instruction.

- [ ] **Step 1: Add the focused package command**

Add the exact script:

```json
"test:gesture-regression": "vitest run src/gesture/gestureRegression.test.ts src/gesture/gestureRegressionSuite.test.ts"
```

- [ ] **Step 2: Document automatic regression usage**

Add a Chinese README section explaining that this command replays privacy-safe landmark traces through the real engine, runs automatically inside `npm test`, and that a failure means an action was missing, duplicated, late, or unexpected.

- [ ] **Step 3: Run focused and full verification**

Run all commands with fresh output:

```bash
npm run test:gesture-regression
npm test
npm run electron:typecheck
npm run build
git diff --check
```

Expected: every command exits zero; the complete test count increases; production build succeeds without new dependencies.

- [ ] **Step 4: Commit command and documentation**

```bash
git add package.json README.md
git commit -m "docs: add gesture regression command"
```

- [ ] **Step 5: Merge and publish**

Fast-forward the verified feature branch into `main`, rerun `npm test` on `main`, push `main` to `origin`, and delete the local feature branch only after the push succeeds.

## Plan self-review

- Spec coverage: Task 1 covers strict replay, semantic events, validation and reporting; Task 2 covers all six required behaviors; Task 3 covers local command, existing CI discovery, full verification and publication.
- Placeholder scan: no placeholder markers, unspecified implementation, or deferred error handling remains.
- Type consistency: Task 2 consumes the exact `GestureRegressionCase` and `runGestureRegression` names defined by Task 1; Task 3 points to the exact two test paths created earlier.
