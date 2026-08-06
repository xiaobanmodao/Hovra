# 原生长按与关节点精确对齐 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 本项目按用户要求在当前任务内顺序执行，不启用子智能体。

**Goal:** 为现有稳定捏合加入原生鼠标长按生命周期，并确保摄像头覆盖层的全部关节点严格贴合模型原始二维坐标。

**Architecture:** `PinchClickStateMachine` 负责区分短捏合和达到 420ms 的持续捏合，并产出一次性按下/抬起边沿；`GestureEngine` 把边沿映射到既有拖动事件契约；`App` 严格按“移动到锁定点 → 按下 → 移动 → 抬起”的顺序调用 Electron 桥接。`handOverlayModel` 只复制原始图像坐标，深度数据仅控制绘制层级。

**Tech Stack:** TypeScript、Vitest、React、Testing Library、MediaPipe Tasks Vision、Electron/Vite。

## Global Constraints

- 长按阈值固定为 420ms。
- 短捏合稳定释放仍产生一次左键单击。
- 长按释放不得再产生单击。
- 手部丢失、张掌停止、握拳抑制、控制关闭和组件卸载必须安全释放鼠标。
- 覆盖层二维点不得修改 MediaPipe 图像坐标。
- 不新增依赖，不恢复右键、滚动或双击手势。

---

### Task 1: 状态机长按边沿

**Files:**
- Modify: `src/gesture/pinchClickStateMachine.test.ts`
- Modify: `src/gesture/pinchClickStateMachine.ts`

**Interfaces:**
- Consumes: `PinchClickEvidence` 的接触、释放、抑制和光标证据。
- Produces: `PinchClickOutput.holdStarted: boolean`、`holdEnded: boolean`、`holdCursor: Landmark | null`、`holding: boolean`，以及 `PinchClickConfig.longPressMs: number`。

- [ ] **Step 1: 写长按边界失败测试**

```ts
it("稳定捏合达到阈值只开始一次长按，释放时结束且不点击", () => {
  const machine = new PinchClickStateMachine({ longPressMs: 420 });
  machine.update(separated(0.42, 0.36), 0);
  machine.update(contact(0.44, 0.37), 16);
  machine.update(contact(0.44, 0.37), 32);
  expect(machine.update(contact(0.44, 0.37), 435)).toMatchObject({
    holdStarted: false, holding: false,
  });
  expect(machine.update(contact(0.44, 0.37), 436)).toMatchObject({
    holdStarted: true, holding: true, holdCursor: { x: 0.42, y: 0.36 },
  });
  expect(machine.update(contact(0.6, 0.37), 452)).toMatchObject({
    holdStarted: false, holding: true,
  });
  machine.update(separated(0.6, 0.37), 468);
  expect(machine.update(separated(0.6, 0.37), 484)).toMatchObject({
    holdEnded: true, holding: false, clicked: false,
  });
});
```

- [ ] **Step 2: 写安全中断失败测试**

```ts
it.each([
  ["丢手", null],
  ["抑制", { ...contact(), suppressed: true }],
] as const)("长按时%s会立即产生抬起边沿", (_label, evidence) => {
  const machine = startedHoldMachine();
  expect(machine.update(evidence, 500)).toMatchObject({
    holdEnded: true, holding: false, clicked: false,
  });
});
```

- [ ] **Step 3: 运行状态机测试并确认因缺少长按输出而失败**

Run: `npx vitest run src/gesture/pinchClickStateMachine.test.ts`

Expected: 新断言因 `holdStarted`、`holdEnded`、`holding` 或 `longPressMs` 尚未实现而失败。

- [ ] **Step 4: 实现最小长按状态**

```ts
export type PinchClickConfig = {
  longPressMs: number;
  // 保留其余安全参数
};

export type PinchClickOutput = {
  holdStarted: boolean;
  holdEnded: boolean;
  holdCursor: Landmark | null;
  holding: boolean;
  // 保留现有点击与诊断字段
};
```

将旧 `maxGestureMs` 超时分支替换为 `nowMs - gestureStartedAtMs >= longPressMs` 的一次性长按开始边沿；长按开始后跳过速度/移动半径取消；稳定释放返回 `holdEnded: true` 和 `clicked: false`；丢手、抑制和异常时间在重置前保留一次 `holdEnded`。

- [ ] **Step 5: 运行状态机测试并确认通过**

Run: `npx vitest run src/gesture/pinchClickStateMachine.test.ts`

Expected: 文件内全部测试通过，原有短捏合、抖动、高速和冷却行为保持绿色。

### Task 2: 引擎和桌面原生按下生命周期

**Files:**
- Modify: `src/gesture/gestureEngine.test.ts`
- Modify: `src/gesture/gestureEngine.ts`
- Modify: `src/App.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/i18n/zh-CN.test.ts`
- Modify: `src/i18n/zh-CN.ts`

**Interfaces:**
- Consumes: Task 1 的 `holdStarted`、`holdEnded`、`holdCursor`、`holding`。
- Produces: `GestureOutput.dragStart`、`dragEnd`、`state: "dragging"`、`phase: "dragging"`；Electron 调用顺序 `move → mouseDown` 和释放时 `mouseUp`。

- [ ] **Step 1: 写引擎失败测试**

```ts
it("持续捏合进入长按，松开只结束长按", () => {
  const engine = new GestureEngine();
  engine.update(makeGestureHand("tracking"), 0);
  engine.update(makeGestureHand("left"), 16);
  engine.update(makeGestureHand("left"), 32);
  expect(engine.update(makeGestureHand("left"), 436)).toMatchObject({
    state: "dragging", phase: "dragging", dragStart: true, dragEnd: false, click: false,
  });
  expect(engine.update(makeGestureHand("left"), 452)).toMatchObject({
    state: "dragging", dragStart: false, dragEnd: false,
  });
  engine.update(makeGestureHand("tracking"), 468);
  expect(engine.update(makeGestureHand("tracking"), 484)).toMatchObject({
    dragEnd: true, click: false,
  });
});
```

- [ ] **Step 2: 写 App 调用顺序失败测试**

```ts
it("长按先移动到锁定点再按下，保持时移动，释放时抬起", async () => {
  const { bridge, runFrame } = await renderDesktopApp();
  runFrame(16, handAt("left"));
  runFrame(32, handAt("left"));
  runFrame(436, handAt("left"));
  await waitFor(() => expect(bridge.mouseDown).toHaveBeenCalledOnce());
  expect(vi.mocked(bridge.move).mock.invocationCallOrder.at(-1))
    .toBeLessThan(vi.mocked(bridge.mouseDown).mock.invocationCallOrder[0]!);
  runFrame(452, handAt("left", 0.62, 0.4));
  runFrame(468, handAt("tracking"));
  runFrame(484, handAt("tracking"));
  await waitFor(() => expect(bridge.mouseUp).toHaveBeenCalledOnce());
  expect(bridge.click).not.toHaveBeenCalled();
});
```

- [ ] **Step 3: 运行聚焦测试并确认事件未接线而失败**

Run: `npx vitest run src/gesture/gestureEngine.test.ts src/App.test.tsx src/i18n/zh-CN.test.ts`

Expected: 引擎仍固定返回 `dragStart: false`，App 未调用 `mouseDown()`，中文仍显示“拖动中”。

- [ ] **Step 4: 实现引擎映射和严格派发顺序**

```ts
return {
  ...input,
  dragStart: pinch.holdStarted,
  dragEnd: pinch.holdEnded,
};
```

在 App 中优先处理 `dragEnd`；处理 `dragStart` 时先等待 `move(holdCursor)` 完成再调用 `mouseDown()`；保持长按的普通帧继续调用 `move()`。丢手仍调用 `mouseUp()`，暂停和关闭使用既有 `releaseAndPause()` 安全释放。中文 `dragging` 状态和阶段统一显示“长按中”。

- [ ] **Step 5: 运行引擎与 App 聚焦测试并确认通过**

Run: `npx vitest run src/gesture/gestureEngine.test.ts src/App.test.tsx src/i18n/zh-CN.test.ts`

Expected: 长按生命周期、短点击回归和中文状态全部通过。

### Task 3: 覆盖层使用原始关节坐标

**Files:**
- Modify: `src/gesture/handOverlayModel.test.ts`
- Modify: `src/gesture/handOverlayModel.ts`
- Modify: `src/components/CameraStage.test.tsx`

**Interfaces:**
- Consumes: 21 个图像 `Landmark` 和可选世界 `Landmark`。
- Produces: `HandOverlayModel.points[index].x/y` 与输入图像点逐点相等；`z` 可来自世界坐标，仅供深度样式。

- [ ] **Step 1: 把错误的骨长修正测试改为对齐失败测试**

```ts
it("21 个覆盖点始终保留模型原始二维坐标", () => {
  const image = makeGestureHand("open-palm");
  image[8] = { ...image[8]!, x: image[7]!.x + 4, y: image[7]!.y + 4 };
  const model = buildHandOverlayModel(image);
  expect(model!.points.map(({ x, y }) => ({ x, y }))).toEqual(
    image.map(({ x, y }) => ({ x, y })),
  );
});
```

- [ ] **Step 2: 运行覆盖层测试并确认被骨长约束改动而失败**

Run: `npx vitest run src/gesture/handOverlayModel.test.ts src/components/CameraStage.test.tsx`

Expected: 第 8 点当前被 `constrainFingerLengths` 移动，逐点相等断言失败。

- [ ] **Step 3: 删除二维骨长重算并复制原始点**

```ts
const points: HandOverlayPoint[] = landmarks.map((point, index) => ({
  x: point.x,
  y: point.y,
  z: depthValues[index] ?? 0,
  index,
}));
```

保留掌面、骨段宽度、关节半径和深度排序；把 `dragging` 阶段加入捏合连接带的可见/激活条件，并显示“长按中：松开以释放”。

- [ ] **Step 4: 运行覆盖层聚焦测试并确认通过**

Run: `npx vitest run src/gesture/handOverlayModel.test.ts src/components/CameraStage.test.tsx`

Expected: 21 点原始坐标、20 骨段、掌面和绘制行为全部通过。

### Task 4: 完整回归、构建和运行新版

**Files:**
- Modify only files required by observed failures.

**Interfaces:**
- Consumes: Tasks 1–3 的完整实现。
- Produces: 可运行的 Hovra Electron 新版和新鲜验证记录。

- [ ] **Step 1: 运行完整测试**

Run: `npm test`

Expected: 所有 Vitest 文件通过，0 个失败。

- [ ] **Step 2: 运行 Electron 类型检查**

Run: `npm run electron:typecheck`

Expected: TypeScript 退出码 0。

- [ ] **Step 3: 运行生产构建**

Run: `npm run build`

Expected: TypeScript 与 Vite 构建退出码 0。

- [ ] **Step 4: 检查补丁完整性**

Run: `git diff --check && git status --short`

Expected: 无空白错误；状态只包含本次修复文件。

- [ ] **Step 5: 重启 Electron 开发版**

Run: `npm run electron:dev`

Expected: Electron 主进程、渲染进程和摄像头捕获进程正常启动，新版界面加载且无启动错误。
