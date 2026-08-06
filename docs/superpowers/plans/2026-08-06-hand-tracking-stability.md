# 关节追踪稳定层 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 用户已授权常规确认采用推荐项；本计划由当前会话顺序执行，不启用子智能体。

**Goal:** 在保持摄像头原始关节点精确显示的同时，为手势控制增加能够拒绝单点异常、低延迟跟随整手移动并安全处理 80ms 短时丢点的稳定层。

**Architecture:** 新增纯 TypeScript `HandTrackingStabilizer`，用掌部中位位移、骨段一致性和逐点残差生成控制用坐标，再用两组自适应滤波参数合并 21 点输出。`GestureEngine` 内部消费稳定帧；安全观测可进入手势状态机，异常或预测帧只更新光标并向点击状态机发送跟踪中断。React 仍把 MediaPipe 原始点交给 `CameraStage`，诊断面板只新增追踪来源、质量和拒绝点数。

**Tech Stack:** TypeScript、Vitest、React、Testing Library、MediaPipe Tasks Vision、Electron/Vite。

## Global Constraints

- 摄像头覆盖层必须继续使用 MediaPipe 原始 `landmarks`，不能读取稳定器输出。
- 预测或异常替代帧不得产生点击、长按开始、释放确认点击、张掌或握拳事件。
- 长按期间遇到异常或丢点必须产生一次安全抬起。
- 短时预测上限固定为 80ms；250ms 以上帧间隔清空稳定历史。
- 拇指和食指链使用 `minCutoff = 1.35`、`beta = 20`；其余点使用 `minCutoff = 1.0`、`beta = 16`。
- 不新增依赖，不重新引入 Apple Vision，不恢复右键或滚动。

---

### Task 1: 纯关节追踪稳定器

**Files:**
- Create: `src/gesture/handTrackingStabilizer.ts`
- Create: `src/gesture/handTrackingStabilizer.test.ts`
- Reuse: `src/gesture/adaptiveLandmarkFilter.ts`
- Reuse: `src/gesture/types.ts`

**Interfaces:**
- Consumes: `Landmark[] | null` 和严格递增的毫秒时间戳。
- Produces: `StabilizedHandFrame`，包含 `controlLandmarks`、`source`、`gestureSafe`、`quality` 和 `rejectedIndices`。

- [ ] **Step 1: 写稳定噪声与快速整手移动失败测试**

```ts
const handAt = (centerX: number): Landmark[] => {
  const base = makeGestureHand("tracking");
  const offset = centerX - base[9]!.x;
  return base.map((point) => ({ ...point, x: point.x + offset }));
};
const range = (values: number[]) => Math.max(...values) - Math.min(...values);

it("减少静止关节噪声但在 100ms 内跟随至少 80% 的整手平移", () => {
  const stabilizer = new HandTrackingStabilizer();
  const raw: number[] = [];
  const stable: number[] = [];
  for (let frame = 0; frame < 40; frame += 1) {
    const x = 0.5 + (frame % 2 === 0 ? -0.015 : 0.015);
    raw.push(x);
    stable.push(stabilizer.update(handAt(x), frame * 16).controlLandmarks![8]!.x);
  }
  expect(range(stable.slice(10))).toBeLessThan(range(raw.slice(10)) * 0.6);

  const motion = new HandTrackingStabilizer();
  const start = motion.update(handAt(0.2), 0).controlLandmarks![8]!.x;
  motion.update(handAt(0.2), 16);
  const moved = motion.update(handAt(0.8), 116);
  expect(moved.rejectedIndices).toEqual([]);
  expect(moved.controlLandmarks![8]!.x - start).toBeGreaterThanOrEqual(0.48);
});
```

- [ ] **Step 2: 写异常点、骨段和边界失败测试**

```ts
it("拒绝瞬移的食指尖并用掌部运动预测替代", () => {
  const stabilizer = new HandTrackingStabilizer();
  const base = makeGestureHand("tracking");
  stabilizer.update(base, 0);
  const broken = base.map((point) => ({ ...point }));
  broken[8] = { ...broken[4]!, x: broken[4]!.x + 0.001 };

  const frame = stabilizer.update(broken, 16);

  expect(frame).toMatchObject({ source: "observed", gestureSafe: false });
  expect(frame.rejectedIndices).toContain(8);
  expect(frame.controlLandmarks![8]!.x).not.toBeCloseTo(broken[8]!.x, 3);
});
```

```ts
it("拒绝骨段比例、坐标边界和掌宽突变", () => {
  const base = makeGestureHand("tracking");

  const bone = new HandTrackingStabilizer();
  bone.update(base, 0);
  const stretched = structuredClone(base);
  stretched[12] = { ...stretched[12]!, y: stretched[12]!.y - 0.5 };
  expect(bone.update(stretched, 16)).toMatchObject({ gestureSafe: false });

  const bounds = new HandTrackingStabilizer();
  bounds.update(base, 0);
  const outside = structuredClone(base);
  outside[8] = { ...outside[8]!, x: 1.3 };
  expect(bounds.update(outside, 16).rejectedIndices).toContain(8);

  const scale = new HandTrackingStabilizer();
  scale.update(base, 0);
  const widened = structuredClone(base);
  widened[17] = { ...widened[17]!, x: widened[17]!.x + 0.4 };
  expect(scale.update(widened, 16)).toMatchObject({ gestureSafe: false });
  expect(base).toEqual(makeGestureHand("tracking"));
});
```

- [ ] **Step 3: 写短时预测和失效失败测试**

```ts
it("只在 80ms 内预测控制点且预测永远不安全", () => {
  const stabilizer = new HandTrackingStabilizer();
  stabilizer.update(handAt(0.3), 0);
  stabilizer.update(handAt(0.34), 16);

  expect(stabilizer.update(null, 64)).toMatchObject({
    source: "predicted", gestureSafe: false, quality: 0.15,
  });
  expect(stabilizer.update(null, 97)).toMatchObject({
    source: "lost", gestureSafe: false, quality: 0, controlLandmarks: null,
  });
});
```

- [ ] **Step 4: 运行测试并确认模块缺失导致红灯**

Run: `npx vitest run src/gesture/handTrackingStabilizer.test.ts`

Expected: FAIL，原因是 `./handTrackingStabilizer` 尚不存在。

- [ ] **Step 5: 实现稳定帧契约和常量**

```ts
export type TrackingSource = "observed" | "predicted" | "lost";

export type StabilizedHandFrame = {
  controlLandmarks: Landmark[] | null;
  source: TrackingSource;
  gestureSafe: boolean;
  quality: number;
  rejectedIndices: number[];
};

const PALM_ANCHORS = [0, 5, 9, 13, 17] as const;
const FAST_INDICES = new Set([1, 2, 3, 4, 5, 6, 7, 8]);
const MAX_PREDICTION_MS = 80;
const RESET_GAP_MS = 250;
const SOFT_RESIDUAL_RATIO = 0.42;
const HARD_RESIDUAL_RATIO = 0.8;
```

- [ ] **Step 6: 实现掌部补偿、异常替代、双滤波合并和预测**

在 `HandTrackingStabilizer.update()` 中：验证 21 点和时间戳；用掌部锚点位移逐轴中位数建立期望点；按 `HAND_OVERLAY_CONNECTIONS` 构建相邻骨段索引；拒绝满足规格残差/骨长/范围规则的点；用期望点替代后同时送入 `fastFilter` 与 `stableFilter`，再按 `FAST_INDICES` 合并。保存上一观察输出速度，缺失不超过 80ms 时按速度外推并把位移向量限制为 `palmScale * 0.35`。

```ts
const sanitized = landmarks.map((point, index) => (
  rejected.has(index) ? expected[index]! : copyPoint(point)
));
const fast = this.fastFilter.update(sanitized, nowMs)!;
const stable = this.stableFilter.update(sanitized, nowMs)!;
const controlLandmarks = stable.map((point, index) => (
  FAST_INDICES.has(index) ? fast[index]! : point
));
```

- [ ] **Step 7: 运行稳定器测试并确认绿色**

Run: `npx vitest run src/gesture/handTrackingStabilizer.test.ts src/gesture/adaptiveLandmarkFilter.test.ts`

Expected: 两个测试文件全部通过。

### Task 2: GestureEngine 安全集成

**Files:**
- Modify: `src/gesture/gestureEngine.ts`
- Modify: `src/gesture/gestureEngine.test.ts`
- Modify: `src/gesture/types.ts`
- Modify: `src/gesture/gestureTrace.ts`
- Modify: `src/gesture/gestureTrace.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `HandTrackingStabilizer.update()`。
- Produces: 安全观测的完整手势输出；异常/预测帧的连续光标和 `trackingSource`、`trackingQuality`、`rejectedLandmarkCount` 诊断。

- [ ] **Step 1: 写异常点不能制造点击失败测试**

```ts
it("连续异常指尖重合只能移动光标，不能制造捏合或点击", () => {
  const engine = new GestureEngine();
  const tracking = makeGestureHand("tracking");
  engine.update(tracking, 0);
  for (const at of [16, 32, 48]) {
    const broken = tracking.map((point) => ({ ...point }));
    broken[8] = { ...broken[4]!, x: broken[4]!.x + 0.001 };
    const output = engine.update(broken, at);
    expect(output).toMatchObject({ click: false, dragStart: false });
    expect(output.diagnostics).toMatchObject({
      trackingSource: "observed", rejectedLandmarkCount: 1,
    });
  }
});
```

- [ ] **Step 2: 写预测帧只保持光标及长按安全释放失败测试**

```ts
const startHoldingEngine = (): GestureEngine => {
  const engine = new GestureEngine();
  const tracking = makeGestureHand("tracking");
  const left = makeGestureHand("left");
  engine.update(tracking, 0);
  for (const at of [16, 32, 132, 232, 332, 436]) engine.update(left, at);
  return engine;
};

it("短时丢点保留预测光标但立即结束长按且不产生其他事件", () => {
  const engine = startHoldingEngine();
  const firstGap = engine.update(null, 452);
  expect(firstGap).toMatchObject({
    state: "tracking", cursor: expect.any(Object), click: false,
    dragStart: false, dragEnd: true,
    diagnostics: { trackingSource: "predicted", trackingQuality: 0.15 },
  });
  expect(engine.update(null, 468)).toMatchObject({ dragEnd: false, click: false });
  expect(engine.update(null, 548)).toMatchObject({ state: "lost", cursor: null });
});
```

- [ ] **Step 3: 运行引擎测试并确认诊断字段和安全路径缺失导致红灯**

Run: `npx vitest run src/gesture/gestureEngine.test.ts src/gesture/gestureTrace.test.ts`

Expected: FAIL，当前引擎把原始异常点直接送入几何，并在首个空帧进入 `lost`。

- [ ] **Step 4: 扩展诊断类型并接入稳定器**

```ts
trackingSource: import("./handTrackingStabilizer").TrackingSource;
trackingQuality: number;
rejectedLandmarkCount: number;
```

`GestureEngine` 新增 `private readonly handTracking = new HandTrackingStabilizer()`。安全观察帧调用现有 `updateValidHand()`；异常观察或预测帧调用新的 `updateUnsafeHand()`：使用稳定点计算和过滤光标，调用 `pinch.update(null, nowMs)` 清除动作状态，重置张掌计数，并输出 `state: "tracking"`。超过预测窗才调用 `updateMissingHand()`。

- [ ] **Step 5: 让轨迹记录保留原始输入并记录真实安全质量**

`recordTrace()` 继续接收原始 `landmarks/worldLandmarks`，把帧 `quality` 改为 `output.diagnostics.trackingQuality`，并把 `features.safetyGatePassed` 改为“追踪安全且几何接触”。不得把 `controlLandmarks` 写入现有原始坐标字段。

```ts
quality: output.diagnostics.trackingQuality,
safetyGatePassed: trackingFrame.gestureSafe && metrics.pinchContact,
```

- [ ] **Step 6: 运行引擎和轨迹测试并确认绿色**

Run: `npx vitest run src/gesture/gestureEngine.test.ts src/gesture/gestureTrace.test.ts src/gesture/gestureEngine.replay.test.ts`

Expected: 异常、预测、丢失、恢复布防、长按释放和原始轨迹测试全部通过。

### Task 3: 中文追踪质量诊断与显示隔离

**Files:**
- Modify: `src/components/GestureDiagnostics.tsx`
- Modify: `src/components/GestureDiagnostics.test.tsx`
- Modify: `src/App.test.tsx`
- Verify: `src/components/CameraStage.tsx`
- Verify: `src/gesture/handOverlayModel.test.ts`

**Interfaces:**
- Consumes: Task 2 的三个诊断字段。
- Produces: 中文“实时观测/短时预测/已丢失”、百分比质量和异常关节点数量；摄像头仍绘制原始点。

- [ ] **Step 1: 写中文诊断失败测试**

```tsx
const predicted = {
  ...output.diagnostics,
  trackingSource: "predicted" as const,
  trackingQuality: 0.15,
  rejectedLandmarkCount: 2,
};
render(<GestureDiagnostics output={{ ...output, diagnostics: predicted }} />);
expect(screen.getByText("追踪来源").nextElementSibling).toHaveTextContent("短时预测");
expect(screen.getByText("追踪质量").nextElementSibling).toHaveTextContent("15%");
expect(screen.getByText("异常关节点").nextElementSibling).toHaveTextContent("2");
```

- [ ] **Step 2: 运行组件测试并确认字段未显示导致红灯**

Run: `npx vitest run src/components/GestureDiagnostics.test.tsx src/App.test.tsx`

Expected: FAIL，页面中尚无三个追踪诊断项。

- [ ] **Step 3: 实现中文诊断并更新所有测试夹具默认值**

在 `GestureDiagnostics.tsx` 中加入来源映射：`observed → 实时观测`、`predicted → 短时预测`、`lost → 已丢失`；质量显示为四舍五入百分比，拒绝点显示整数。所有手写 `GestureOutput`/`GestureDiagnosticsSnapshot` 夹具补齐默认 `trackingSource: "lost"`、`trackingQuality: 0`、`rejectedLandmarkCount: 0`。

```tsx
const trackingSourceLabel = {
  observed: "实时观测",
  predicted: "短时预测",
  lost: "已丢失",
} as const;

<div><dt>追踪来源</dt><dd>{trackingSourceLabel[diagnostics.trackingSource]}</dd></div>
<div><dt>追踪质量</dt><dd>{Math.round(diagnostics.trackingQuality * 100)}%</dd></div>
<div><dt>异常关节点</dt><dd>{diagnostics.rejectedLandmarkCount}</dd></div>
```

- [ ] **Step 4: 验证摄像头继续绘制原始点**

Run: `npx vitest run src/gesture/handOverlayModel.test.ts src/components/CameraStage.test.tsx src/App.test.tsx`

Expected: 原始 21 点逐点坐标测试、Canvas 绘制和 App 集成全部通过。

### Task 4: 完整验证和提交

**Files:**
- Modify only files required by observed failures.

**Interfaces:**
- Consumes: Tasks 1–3 的完整实现。
- Produces: 可合并的第 2 步稳定层提交和继续运行的 Electron 新版。

- [ ] **Step 1: 运行完整 Vitest**

Run: `npm test`

Expected: 全部测试通过，0 个失败。

- [ ] **Step 2: 运行 Electron TypeScript 检查**

Run: `npm run electron:typecheck`

Expected: 退出码 0。

- [ ] **Step 3: 运行生产构建**

Run: `npm run build`

Expected: TypeScript 和 Vite 均退出码 0。

- [ ] **Step 4: 检查补丁并重启桌面版**

Run: `git diff --check && git status --short`

Expected: 无空白错误，工作区只包含本阶段文件。随后在现有 Electron 会话输入 `rs`；若会话不存在则运行 `npm run electron:dev`，确认开发端口监听且没有启动错误。

- [ ] **Step 5: 提交实现**

```bash
git add docs/superpowers/specs/2026-08-06-hand-tracking-stability-design.md \
  docs/superpowers/plans/2026-08-06-hand-tracking-stability.md \
  src/gesture/handTrackingStabilizer.ts src/gesture/handTrackingStabilizer.test.ts \
  src/gesture/gestureEngine.ts src/gesture/gestureEngine.test.ts src/gesture/types.ts \
  src/gesture/gestureTrace.ts src/gesture/gestureTrace.test.ts \
  src/components/GestureDiagnostics.tsx src/components/GestureDiagnostics.test.tsx \
  src/App.test.tsx
git commit -m "feat: stabilize hand tracking for gesture control"
```
