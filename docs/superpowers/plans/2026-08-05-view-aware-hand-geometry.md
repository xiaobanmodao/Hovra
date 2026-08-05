# View-Aware Hand Geometry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复侧向捏合中二维骨骼与距离数值不一致的问题，并生成可回放的视角诊断数据。

**Architecture:** 将原有通用几何拆成严格二维的图像几何和严格三维的世界几何。摄像头宽高比进入引擎和诊断记录；识别、校准、回放与中文界面统一消费同一组新特征。

**Tech Stack:** React 19、TypeScript、MediaPipe Tasks Vision、Vitest、Testing Library、Electron Forge。

## Global Constraints

- 图像指尖距离和图像手掌尺度不得使用图像关键点 `z`。
- 世界距离继续使用完整 `x/y/z`。
- 图像坐标必须使用实际 `videoWidth / videoHeight` 修正。
- 光标坐标必须保持原始 `[0, 1]` 归一化坐标。
- 旧个人校准只忽略不删除；新配置使用版本 2。
- 新诊断记录使用版本 4，解析器继续支持版本 1–3。
- 不修改最终概率权重，不替换 MediaPipe 模型。

---

### Task 1: 二维图像几何

**Files:**
- Modify: `src/gesture/handGeometry.ts`
- Modify: `src/gesture/handGeometry.test.ts`
- Modify: `src/gesture/landmarkMetrics.ts`
- Modify: `src/gesture/landmarkMetrics.test.ts`

**Interfaces:**
- Produces: `buildImageHandGeometry(landmarks: Landmark[] | null, aspectRatio: number): HandGeometry | null`
- Produces: `imageLandmarkDistance(first: Landmark, second: Landmark, aspectRatio: number): number`
- Keeps: `buildHandGeometry(landmarks)` as three-dimensional world geometry.

- [ ] **Step 1: Write failing screen-space geometry tests**

Add literal fixtures proving that identical `x/y` tips with different `z` have zero image distance, that 16:9 aspect correction matches hand-calculated pixel-relative distance, and that collapsing palm width does not collapse image scale while palm length remains unchanged.

- [ ] **Step 2: Run tests and confirm the old mixed geometry fails**

Run: `npm test -- src/gesture/handGeometry.test.ts src/gesture/landmarkMetrics.test.ts`

Expected: FAIL because `buildImageHandGeometry` and `imageLandmarkDistance` do not exist.

- [ ] **Step 3: Implement separate constructors**

Implement `imageLandmarkDistance` with `Math.hypot((x1 - x2) * aspectRatio, y1 - y2)`. Implement `buildImageHandGeometry` by transforming `x`, `y`, setting metric `z` to zero, preserving source points and using `max(palmWidth, palmLength)` as scale. Leave `buildHandGeometry` three-dimensional.

- [ ] **Step 4: Run tests and refactor shared geometry assembly**

Run: `npm test -- src/gesture/handGeometry.test.ts src/gesture/landmarkMetrics.test.ts`

Expected: PASS with no warnings.

### Task 2: 引擎与特征接线

**Files:**
- Modify: `src/gesture/pinchFeatures.ts`
- Modify: `src/gesture/pinchFeatures.test.ts`
- Modify: `src/gesture/gestureFeatures.ts`
- Modify: `src/gesture/gestureFeatures.test.ts`
- Modify: `src/gesture/gestureEngine.ts`
- Modify: `src/gesture/gestureEngine.test.ts`
- Modify: `src/gesture/types.ts`
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`

**Interfaces:**
- Changes: `GestureEngine.update(landmarks, nowMs, worldLandmarks, inferenceMs, imageAspectRatio?)`
- Adds diagnostics: `screenPinchGap`, `imageAspectRatio`, `worldPalmScale`, `palmFacingScore`.

- [ ] **Step 1: Write a failing side-view engine test**

Construct image landmarks whose thumb/index `x/y` coincide while their image `z` differs by `0.7`; assert `leftPinchRatio` is near zero, `pinchImageDepthGap` remains large, and cursor coordinates remain the original normalized values.

- [ ] **Step 2: Run the engine and feature tests to confirm failure**

Run: `npm test -- src/gesture/pinchFeatures.test.ts src/gesture/gestureFeatures.test.ts src/gesture/gestureEngine.test.ts`

Expected: FAIL because the old image geometry mixes `z` into `leftPinchRatio`.

- [ ] **Step 3: Wire image and world geometry separately**

Use `buildImageHandGeometry` for image action/cursor geometry and `buildHandGeometry` for world geometry. Preserve original cursor points through `sourceLandmarks`. Pass the live video aspect ratio from `App` as the fifth engine argument.

- [ ] **Step 4: Add independent depth and view diagnostics**

Calculate image depth from preserved source `z`, world scale from world geometry, and `palmFacingScore` from `abs(worldGeometry.zAxis.z)`. Keep missing world values nullable.

- [ ] **Step 5: Run focused tests**

Run: `npm test -- src/gesture/pinchFeatures.test.ts src/gesture/gestureFeatures.test.ts src/gesture/gestureEngine.test.ts src/App.test.tsx`

Expected: PASS.

### Task 3: 校准版本迁移

**Files:**
- Modify: `src/gesture/pinchCalibration.ts`
- Modify: `src/gesture/pinchCalibration.test.ts`
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`

**Interfaces:**
- Changes: `PINCH_CALIBRATION_STORAGE_KEY` to `gesture-control.pinch-calibration.v2`.
- Changes: `PinchCalibrationProfile.version` to literal `2`.

- [ ] **Step 1: Write failing migration tests**

Assert that a fitted profile has version 2, the storage key ends in `.v2`, a valid version-2 profile parses, and a former version-1 profile returns `null`.

- [ ] **Step 2: Run calibration tests and confirm failure**

Run: `npm test -- src/gesture/pinchCalibration.test.ts src/App.test.tsx`

Expected: FAIL with version 1 and the `.v1` key.

- [ ] **Step 3: Implement the version migration**

Update the type, fitter, parser and App storage lookup. Do not remove the `.v1` localStorage entry.

- [ ] **Step 4: Run calibration tests**

Run: `npm test -- src/gesture/pinchCalibration.test.ts src/App.test.tsx`

Expected: PASS.

### Task 4: 诊断记录版本 4

**Files:**
- Modify: `src/gesture/gestureTrace.ts`
- Modify: `src/gesture/gestureTrace.test.ts`
- Modify: `src/gesture/gestureReplay.ts`
- Modify: `src/gesture/gestureReplay.test.ts`
- Modify: `src/gesture/gestureEngine.ts`

**Interfaces:**
- Produces: `GestureTraceV4` with `version: 4`.
- Adds feature fields: `screenPinchGap`, `imageAspectRatio`, `worldPalmScale`, `palmFacingScore`.
- Keeps: `parseGestureTrace` accepting versions 1–4 and returning normalized V4.

- [ ] **Step 1: Write failing v4 serialization and replay tests**

Assert that a new trace serializes version 4 with the four new fields, that replay passes the stored aspect ratio, and that a literal version-3 fixture upgrades with safe defaults.

- [ ] **Step 2: Run trace and replay tests to confirm failure**

Run: `npm test -- src/gesture/gestureTrace.test.ts src/gesture/gestureReplay.test.ts src/gesture/gestureEngine.replay.test.ts`

Expected: FAIL because the writer still emits version 3.

- [ ] **Step 3: Implement v4 validation and legacy normalization**

Define exact v4 keys, validate every new number as finite, preserve v1–v3 parsers, normalize missing diagnostics to `screenPinchGap: null`, `imageAspectRatio: 1`, `worldPalmScale: null`, `palmFacingScore: null`, and pass aspect ratio during replay.

- [ ] **Step 4: Run trace and deterministic replay tests**

Run: `npm test -- src/gesture/gestureTrace.test.ts src/gesture/gestureReplay.test.ts src/gesture/gestureEngine.replay.test.ts`

Expected: PASS.

### Task 5: 中文诊断界面

**Files:**
- Modify: `src/components/CalibrationPanel.tsx`
- Modify: `src/components/CalibrationPanel.test.tsx`
- Modify: `src/components/GestureDiagnostics.tsx`
- Modify: `src/components/GestureDiagnostics.test.tsx`
- Modify: `src/i18n/zh-CN.ts`

**Interfaces:**
- Calibration panel consumes `output.diagnostics.leftPinchRatio` as “画面捏合比例”.
- Gesture diagnostics renders screen gap, aspect ratio, image/world scale and facing label.

- [ ] **Step 1: Write failing Chinese UI tests**

Assert that the calibration panel says“画面捏合比例” instead of“捏合距离”，and that diagnostics renders “二维指尖间隙”“画面宽高比”“世界手掌尺度”“手掌朝向” with a side-view fixture.

- [ ] **Step 2: Run component tests to confirm failure**

Run: `npm test -- src/components/CalibrationPanel.test.tsx src/components/GestureDiagnostics.test.tsx`

Expected: FAIL because the new labels and values are absent.

- [ ] **Step 3: Implement the diagnostics UI**

Rename the calibration prop to `pinchRatio`, add the new diagnostics rows, and map facing scores `>= 0.72` to“正面”、`>= 0.38` to“斜向”、otherwise to“侧向”.

- [ ] **Step 4: Run component tests**

Run: `npm test -- src/components/CalibrationPanel.test.tsx src/components/GestureDiagnostics.test.tsx`

Expected: PASS.

### Task 6: 回归、桌面打包与现场验证

**Files:**
- Verify all modified files.

**Interfaces:**
- Consumes all prior tasks; produces a merged and packaged desktop application.

- [ ] **Step 1: Run full automated verification**

Run: `npm test && npm run build && npm run electron:typecheck && git diff --check`

Expected: all commands exit 0.

- [ ] **Step 2: Commit and merge locally**

Commit the feature branch, fast-forward merge it to `main`, run the full verification again, then clean only this task's worktree and branch.

- [ ] **Step 3: Package and launch**

Run: `npm run electron:make`, replace the old running instance with `out/手势控制-darwin-arm64/手势控制.app`, and verify a single new process is running.

- [ ] **Step 4: Desktop QA**

Use the packaged app to verify the new Chinese diagnostics are visible. Perform front and side pinches if a hand is available; confirm that visual `x/y` contact drives the two-dimensional gap down while image depth remains separate. Save one local trace and confirm it is version 4 without transmitting it.
