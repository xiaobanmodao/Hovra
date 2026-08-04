# Depth-Aware Pinch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 仅在画面坐标与世界坐标都证明拇指和食指真实接近、并持续足够时间时触发一次左键点击。

**Architecture:** 检测层返回同帧的归一化与世界坐标；手势特征层分别计算两套捏合比例，分类器使用合取条件；稳定器给左键独立的 48ms 进入时间。轨迹格式升级到版本 2，保证问题可回放。

**Tech Stack:** TypeScript、React、MediaPipe Tasks Vision、Vitest、Electron

## Global Constraints

- 光标继续使用归一化画面坐标。
- 张手停止继续使用 16ms 确认。
- 世界坐标缺失或无效时禁止产生点击。
- 不增加新的运行时依赖。
- 所有生产代码之前必须先看到对应测试按预期失败。

---

### Task 1: 同帧双坐标检测结果

**Files:**
- Modify: `src/vision/handLandmarker.ts`
- Test: `src/vision/handLandmarker.test.ts`
- Modify: `src/App.tsx`

**Interfaces:**
- Produces: `DetectedHand = { landmarks: Landmark[]; worldLandmarks: Landmark[] }`
- Produces: `detectFirstHand(...): DetectedHand | null`

- [ ] **Step 1: 编写失败测试**，断言检测函数同时返回清洗后的 `landmarks` 与 `worldLandmarks`，任一数组缺失时返回 `null`。
- [ ] **Step 2: 运行 `npm test -- src/vision/handLandmarker.test.ts`**，确认因当前函数只返回画面坐标而失败。
- [ ] **Step 3: 实现最小检测结果类型和成对校验**，并在 `App.tsx` 中分别保存画面坐标、把两套坐标传入引擎。
- [ ] **Step 4: 重跑检测层与 App 测试**，确认通过。

### Task 2: 双坐标点击证据

**Files:**
- Modify: `src/gesture/gestureFeatures.ts`
- Modify: `src/gesture/gestureClassifier.ts`
- Modify: `src/gesture/gestureEngine.ts`
- Modify: `src/gesture/types.ts`
- Test: `src/gesture/gestureFeatures.test.ts`
- Test: `src/gesture/gestureClassifier.test.ts`
- Test: `src/gesture/gestureEngine.test.ts`

**Interfaces:**
- Consumes: 同帧画面坐标与世界坐标。
- Produces: `imageLeftPinchRatio`、`worldLeftPinchRatio`、`pinchDepthReliable`。

- [ ] **Step 1: 编写失败测试**，覆盖画面重合但世界深度分离、世界坐标缺失、真实三维捏合。
- [ ] **Step 2: 运行目标测试**，确认现有单距离分类会误判。
- [ ] **Step 3: 实现双距离特征和失败关闭分类条件**；张手特征只使用画面坐标。
- [ ] **Step 4: 重跑目标测试**，确认三类场景通过。

### Task 3: 左键独立时间确认

**Files:**
- Modify: `src/gesture/gestureStabilizer.ts`
- Test: `src/gesture/gestureStabilizer.test.ts`
- Test: `src/gesture/gestureEngine.test.ts`

**Interfaces:**
- Produces: 左键候选确认 48ms；其他候选继续使用现有时长。

- [ ] **Step 1: 编写失败测试**，断言 32ms 短暂重合不锁定、48ms 才锁定、释放只点击一次，并断言张手 16ms 锁定。
- [ ] **Step 2: 运行目标测试**，确认左键当前在 16ms 提前锁定。
- [ ] **Step 3: 为稳定器增加 `pinchEntryMs`**，默认 48ms，并仅用于 `left` 候选。
- [ ] **Step 4: 重跑稳定器与引擎测试**，确认通过。

### Task 4: 可回放诊断格式

**Files:**
- Modify: `src/gesture/gestureTrace.ts`
- Modify: `src/gesture/gestureReplay.ts`
- Modify: `src/gesture/gestureEngine.ts`
- Test: `src/gesture/gestureTrace.test.ts`
- Test: `src/gesture/gestureReplay.test.ts`
- Test: `src/gesture/gestureEngine.replay.test.ts`

**Interfaces:**
- Produces: `GestureTrace` 版本 2，帧包含 `worldLandmarks`；解析版本 1 时补为 `null`。
- Produces: 回放处理器接收 `(landmarks, worldLandmarks, nowMs)`。

- [ ] **Step 1: 编写失败测试**，覆盖版本 2 保存/解析/回放以及版本 1 兼容。
- [ ] **Step 2: 运行目标测试**，确认现有版本 1 不保留世界坐标。
- [ ] **Step 3: 实现版本迁移、严格字段验证和深复制**。
- [ ] **Step 4: 重跑轨迹测试并确认隐私限制仍生效**。

### Task 5: 全量验证与桌面打包

**Files:**
- Verify only

- [ ] **Step 1: 运行 `npm test`、`npm run build`、`npm run electron:typecheck` 和 `git diff --check`。
- [ ] **Step 2: 运行 `npm run electron:make`**。
- [ ] **Step 3: 只保留一个最新版应用进程并启动打包应用**。
- [ ] **Step 4: 检查桌面应用界面、摄像头状态和中文操作说明**。
- [ ] **Step 5: 提交聚焦改动**，提交信息使用 `fix: validate pinch with world landmarks`。
