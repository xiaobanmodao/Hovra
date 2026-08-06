# 引导式稳定性测试与自动调优 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在应用内提供约 4 分钟、带真实标签的稳定性测试，自动计算可靠指标并安全推荐、应用和撤销个人捏合阈值。

**Architecture:** 使用纯 TypeScript 会话状态机把时间提示、标签窗口、质量门控与 React 分离；使用独立分析器从会话帧计算指标和保守阈值；React 面板只展示状态并向 App 发出开始、取消、应用和恢复事件。`GestureEngine` 通过可选设置读取个人接触/释放阈值，未设置时保持现有默认行为。

**Tech Stack:** React、TypeScript、Vitest、Testing Library、Electron/Vite、MediaPipe Tasks Vision。

## Global Constraints

- 完整流程目标时长约 4 分钟，包含 20 次正样本和 4 类负样本。
- 测试期间及测试结束后系统鼠标控制保持暂停，绝不自动重新启用。
- 只在本机内存或用户主动保存的 JSON 中记录骨骼点、派生数值和标签，不保存图像或视频。
- 只调节左键捏合接触/释放边界；不新增手势、不更换模型。
- 数据不足、正负分布重叠或离线重放增加误触时禁止应用建议。
- 所有界面文字为中文。

---

### Task 1: 测试协议与纯状态机

**Files:**
- Create: `src/gesture/stabilityTest.ts`
- Create: `src/gesture/stabilityTest.test.ts`

**Interfaces:**
- Consumes: `GestureOutput` and its `diagnostics` from `src/gesture/types.ts`.
- Produces: `createStabilitySession(nowMs)`, `advanceStabilitySession(session, observation)`, `StabilitySession`, `StabilityStep`, `StabilitySample`, `StabilityLabel`.

- [x] **Step 1: Write failing tests for the complete protocol**

```ts
it("按准备、20 次捏合和四类负样本推进", () => {
  let session = createStabilitySession(0);
  session = advanceStabilitySession(session, validObservation(0));
  expect(session.phase).toBe("readiness");
  // 用虚拟时间完成准备并遍历 protocol，验证 5 个角度各 4 次及 4 类负样本。
  expect(STABILITY_PROTOCOL.filter((step) => step.label === "contact")).toHaveLength(20);
});

it("坏帧暂停计时且不进入样本", () => {
  const next = advanceStabilitySession(session, invalidObservation(2_000));
  expect(next.elapsedValidMs).toBe(session.elapsedValidMs);
  expect(next.samples).toHaveLength(session.samples.length);
});
```

- [x] **Step 2: Run tests and verify RED**

Run: `npx vitest run src/gesture/stabilityTest.test.ts`
Expected: FAIL because `stabilityTest.ts` does not exist.

- [x] **Step 3: Implement the deterministic protocol and bounded sample storage**

```ts
export type StabilityPhase = "idle" | "readiness" | "positive" | "negative" | "analyzing" | "complete" | "cancelled";
export type StabilityLabel = "contact" | "separate" | "ignore";
export type StabilityObservation = { nowMs: number; output: GestureOutput; handPresent: boolean; pageFocused: boolean };

export function advanceStabilitySession(
  session: StabilitySession,
  observation: StabilityObservation,
): StabilitySession {
  const quality = evaluateSampleQuality(observation);
  if (!quality.valid) return { ...session, quality };
  return advanceValidTimeAndRecordBoundedSample(session, observation, quality, 9_000);
}
```

Each positive repetition uses separate → ignore → contact → ignore → separate windows. Readiness and active windows advance only on valid frames. Export Chinese action titles and quality messages as data on each step.

- [x] **Step 4: Run focused tests and verify GREEN**

Run: `npx vitest run src/gesture/stabilityTest.test.ts`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add src/gesture/stabilityTest.ts src/gesture/stabilityTest.test.ts
git commit -m "feat: add guided stability test protocol"
```

### Task 2: 指标分析与保守阈值建议

**Files:**
- Create: `src/gesture/stabilityTuning.ts`
- Create: `src/gesture/stabilityTuning.test.ts`
- Modify: `src/gesture/pinchBenchmark.ts`
- Modify: `src/gesture/pinchBenchmark.test.ts`

**Interfaces:**
- Consumes: `StabilitySample[]` and current `StablePinchThresholds`.
- Produces: `analyzeStabilitySession(samples, currentThresholds): StabilityReport`, including `metrics`, per-scenario results and `recommendation`.

- [x] **Step 1: Write failing metric and threshold tests**

```ts
it("从完全分离的正负分布生成有迟滞的安全建议", () => {
  const report = analyzeStabilitySession(samples({ contact: [0.24, 0.26], separate: [0.58, 0.62] }), current);
  expect(report.recommendation.safe).toBe(true);
  expect(report.recommendation.enterRatio).toBeGreaterThan(0.26);
  expect(report.recommendation.exitRatio).toBeGreaterThan(report.recommendation.enterRatio!);
});

it("分布重叠时拒绝建议", () => {
  const report = analyzeStabilitySession(samples({ contact: [0.35], separate: [0.34] }), current);
  expect(report.recommendation).toMatchObject({ safe: false, reason: "正负样本边界重叠" });
});
```

- [x] **Step 2: Run tests and verify RED**

Run: `npx vitest run src/gesture/stabilityTuning.test.ts src/gesture/pinchBenchmark.test.ts`
Expected: FAIL for missing analyzer and inference P95/scenario metrics.

- [x] **Step 3: Implement robust analysis**

```ts
export type StabilityRecommendation = {
  safe: boolean;
  enterRatio: number | null;
  exitRatio: number | null;
  reason: string;
};

const enter = clamp((percentile(contactRatios, 0.9) + percentile(negativeRatios, 0.1)) / 2, 0.24, 0.46);
const exit = clamp(Math.max(enter + 0.12, percentile(contactRatios, 0.95) + 0.16), enter + 0.12, 0.62);
```

Reject non-finite values, fewer than 20 completed positive trials, missing scenario coverage, any negative click, overlapping distributions, or replay regressions. Add inference P95 and completed/missed trial counts without changing current benchmark behavior.

- [x] **Step 4: Run focused tests and verify GREEN**

Run: `npx vitest run src/gesture/stabilityTuning.test.ts src/gesture/pinchBenchmark.test.ts`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add src/gesture/stabilityTuning.ts src/gesture/stabilityTuning.test.ts src/gesture/pinchBenchmark.ts src/gesture/pinchBenchmark.test.ts
git commit -m "feat: analyze gesture stability and recommend thresholds"
```

### Task 3: 可配置阈值与兼容回退

**Files:**
- Modify: `src/gesture/types.ts`
- Modify: `src/gesture/config.ts`
- Modify: `src/gesture/stableHandMetrics.ts`
- Modify: `src/gesture/stableHandMetrics.test.ts`
- Modify: `src/gesture/gestureEngine.ts`
- Modify: `src/gesture/gestureEngine.test.ts`

**Interfaces:**
- Consumes: optional `pinchEnterRatio` and `pinchExitRatio` from `GestureSettings`.
- Produces: `resolveStablePinchThresholds(settings)` and engine diagnostics reflecting the effective values.

- [x] **Step 1: Write failing compatibility and override tests**

```ts
it("没有个人阈值时保持当前默认边界", () => {
  expect(resolveStablePinchThresholds(DEFAULT_GESTURE_SETTINGS)).toEqual(stablePinchThresholds(0.5));
});

it("只接受安全且有迟滞的个人边界", () => {
  expect(resolveStablePinchThresholds({ ...DEFAULT_GESTURE_SETTINGS, pinchEnterRatio: 0.3, pinchExitRatio: 0.5 }))
    .toEqual({ enterRatio: 0.3, exitRatio: 0.5 });
});
```

- [x] **Step 2: Run tests and verify RED**

Run: `npx vitest run src/gesture/stableHandMetrics.test.ts src/gesture/gestureEngine.test.ts`
Expected: FAIL for missing optional settings and resolver.

- [x] **Step 3: Implement validated overrides**

```ts
export type GestureSettings = {
  // existing fields...
  pinchEnterRatio?: number;
  pinchExitRatio?: number;
};

export function resolveStablePinchThresholds(settings: GestureSettings): StablePinchThresholds {
  const fallback = stablePinchThresholds(settings.gestureSensitivity);
  return isSafePair(settings.pinchEnterRatio, settings.pinchExitRatio)
    ? { enterRatio: settings.pinchEnterRatio, exitRatio: settings.pinchExitRatio }
    : fallback;
}
```

Pass the resolved thresholds into `measureStableHand`; preserve the existing sensitivity signature for direct callers.

- [x] **Step 4: Run focused tests and verify GREEN**

Run: `npx vitest run src/gesture/stableHandMetrics.test.ts src/gesture/gestureEngine.test.ts`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add src/gesture/types.ts src/gesture/config.ts src/gesture/stableHandMetrics.ts src/gesture/stableHandMetrics.test.ts src/gesture/gestureEngine.ts src/gesture/gestureEngine.test.ts
git commit -m "feat: support safe personalized pinch thresholds"
```

### Task 4: 中文引导与结果界面

**Files:**
- Create: `src/components/StabilityTestPanel.tsx`
- Create: `src/components/StabilityTestPanel.test.tsx`
- Modify: `src/styles.css`
- Reuse: `src/assets/pinch-calibration/front-thumb-index-contact.png`
- Reuse: `src/assets/pinch-calibration/side-thumb-index-contact.png`
- Reuse: `src/assets/pinch-calibration/false-overlap-separated.png`
- Reuse: `src/assets/pinch-calibration/baseline-open-palm.png`

**Interfaces:**
- Consumes: current session, report and callbacks `onStart`, `onCancel`, `onApply`, `onRestore`, `onSave`.
- Produces: accessible Chinese UI for idle, running, paused-quality and complete states.

- [x] **Step 1: Write failing component tests**

```tsx
it("显示动作、进度和实时质量原因", () => {
  render(<StabilityTestPanel session={runningSession} report={null} {...callbacks} />);
  expect(screen.getByRole("heading", { name: "稳定性测试" })).toBeInTheDocument();
  expect(screen.getByText("正面捏合")).toBeInTheDocument();
  expect(screen.getByText("手掌未完整进入画面")).toBeInTheDocument();
});

it("不安全建议不能应用", () => {
  render(<StabilityTestPanel session={completeSession} report={unsafeReport} {...callbacks} />);
  expect(screen.getByRole("button", { name: "应用推荐设置" })).toBeDisabled();
});
```

- [x] **Step 2: Run tests and verify RED**

Run: `npx vitest run src/components/StabilityTestPanel.test.tsx`
Expected: FAIL because component does not exist.

- [x] **Step 3: Implement the panel and responsive styles**

Render one primary instruction, one clear hand illustration, countdown/progress, a live status region and result cards. Keep controls keyboard accessible and avoid color-only status. Do not add manual sliders for the generated thresholds.

- [x] **Step 4: Run focused tests and verify GREEN**

Run: `npx vitest run src/components/StabilityTestPanel.test.tsx`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add src/components/StabilityTestPanel.tsx src/components/StabilityTestPanel.test.tsx src/styles.css
git commit -m "feat: add Chinese guided stability test UI"
```

### Task 5: App 安全集成、应用与撤销

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Modify: `src/components/CalibrationPanel.tsx`
- Modify: `src/components/CalibrationPanel.test.tsx`
- Modify: `src/components/SystemControlPanel.tsx`
- Modify: `src/components/SystemControlPanel.test.tsx`

**Interfaces:**
- Consumes: live `GestureOutput`, focus state, session reducer and `StabilityReport`.
- Produces: end-to-end safe test flow and settings restore snapshot.

- [x] **Step 1: Write failing integration tests**

```tsx
it("开始测试立即暂停系统控制且测试期间不派发桌面事件", async () => {
  const { bridge, runFrame } = await renderDesktopApp();
  fireEvent.click(screen.getByRole("button", { name: "开始稳定性测试" }));
  await waitFor(() => expect(bridge.releaseAndPause).toHaveBeenCalled());
  vi.mocked(bridge.move).mockClear();
  runFrame(100, handAt("left"));
  expect(bridge.move).not.toHaveBeenCalled();
  expect(bridge.click).not.toHaveBeenCalled();
});

it("应用建议后可恢复且不会自动启用系统控制", () => {
  // 完成固定协议，应用建议，验证 diagnostics 阈值变化，再恢复原值。
  expect(bridge.activate).toHaveBeenCalledTimes(1);
});
```

- [x] **Step 2: Run tests and verify RED**

Run: `npx vitest run src/App.test.tsx src/components/CalibrationPanel.test.tsx src/components/SystemControlPanel.test.tsx`
Expected: FAIL for missing stability test integration and disabled state.

- [x] **Step 3: Implement App ownership and safety wiring**

```tsx
const startStabilityTest = useCallback(async () => {
  await pauseSystemControl();
  settingsBeforeTuningRef.current = settings;
  setStabilitySession(createStabilitySession(performance.now()));
}, [pauseSystemControl, settings]);
```

Feed every fresh recognized frame into the session while active. Pause valid time when `document.hasFocus()` is false. Disable system and calibration controls through explicit `disabled` props. Applying/restoring settings rebuilds the engine through the existing settings path and never calls `activate`.

- [x] **Step 4: Run focused tests and verify GREEN**

Run: `npx vitest run src/App.test.tsx src/components/CalibrationPanel.test.tsx src/components/SystemControlPanel.test.tsx`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add src/App.tsx src/App.test.tsx src/components/CalibrationPanel.tsx src/components/CalibrationPanel.test.tsx src/components/SystemControlPanel.tsx src/components/SystemControlPanel.test.tsx
git commit -m "feat: integrate safe gesture stability testing"
```

### Task 6: 全量验证、文档与桌面冒烟

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/plans/2026-08-06-guided-stability-tuning.md`

**Interfaces:**
- Consumes: all prior tasks.
- Produces: verified build and user instructions.

- [x] **Step 1: Document the exact workflow and privacy boundary**

Add Chinese instructions for starting the 4-minute test, understanding insufficient-data messages, applying/restoring recommendations, and confirm no image/video is stored.

- [x] **Step 2: Run all verification commands**

Run:

```bash
npm test
npm run electron:typecheck
npm run build
npm run electron:make
```

Expected: all tests and type checks pass; production build and signed macOS ZIP complete.

- [x] **Step 3: Launch packaged app and perform a non-physical smoke check**

Run: `open out/手势控制-darwin-arm64/手势控制.app`
Expected: app launches, Chinese stability panel renders, start button is available once camera/tracker conditions allow. Do not claim physical-hand accuracy from this smoke check.

- [x] **Step 4: Mark every completed plan checkbox and commit documentation**

```bash
git add README.md docs/superpowers/plans/2026-08-06-guided-stability-tuning.md
git commit -m "docs: explain guided stability tuning"
```
