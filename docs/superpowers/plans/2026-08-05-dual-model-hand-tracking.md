# Dual-Model Hand Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 macOS 桌面版中融合 MediaPipe GPU 与 Apple Vision 手部关键点，提高侧向捏合的识别可靠性并保留网页降级路径。

**Architecture:** 渲染器节流编码摄像头 JPEG，Electron 主进程通过常驻 Swift 助手运行 Apple Vision。识别引擎将新鲜、高置信度的 Vision 观测与 MediaPipe 特征融合，侧向使用 Vision 主证据，正面使用 Vision 阻断明显分歧。

**Tech Stack:** React 19、TypeScript、Electron 43、MediaPipe Tasks Vision、Swift、Apple Vision、Vitest。

## Global Constraints

- 只保留移动、左键点击和张手停止。
- 所有图像仅在本机处理，绝不自动保存或上传。
- Vision JPEG 最大 400 KiB、最长边 512 像素、最短请求间隔 80 毫秒、超时 250 毫秒。
- Vision 关键点最低置信度为 `0.45`，最大结果年龄为 180 毫秒。
- 侧向阈值为 `palmFacingScore < 0.45`，双模型点击固定使用 5 帧 3 票。
- 网页和 Vision 不可用时必须自动回退 MediaPipe。
- 新诊断记录使用 v5，兼容读取 v1–v4；个人校准保持 v2。

---

### Task 1: Apple Vision 原生助手

**Files:**
- Create: `native/HandPoseHelper.swift`
- Create: `scripts/build-apple-vision-helper.sh`
- Create: `electron/appleVisionProtocol.ts`
- Create: `electron/appleVisionProtocol.test.ts`
- Modify: `package.json`
- Modify: `forge.config.ts`

**Interfaces:**
- Produces: line-delimited request `{id,imageBase64}` and response `{id,landmarks,inferenceMs,error}`.
- Produces: `parseAppleVisionResponse(line: string): AppleVisionHelperResponse`.

- [ ] Write failing parser tests for 21 valid points, malformed JSON, invalid confidence, wrong point count and mismatched identifiers.
- [ ] Run `npm test -- electron/appleVisionProtocol.test.ts` and confirm failure because the module is absent.
- [ ] Implement strict TypeScript protocol parsing and the Swift loop using `VNDetectHumanHandPoseRequest`.
- [ ] Add the Swift build script, invoke it from `electron:dev` and `electron:make`, and package `native/hand-pose-helper` as an extra resource.
- [ ] Run the parser tests, compile the Swift helper, send invalid base64 and a blank PNG through stdin, and confirm valid error/no-hand responses without crashing.

### Task 2: 主进程客户端与安全 IPC

**Files:**
- Create: `electron/appleVisionClient.ts`
- Create: `electron/appleVisionClient.test.ts`
- Modify: `electron/main.ts`
- Modify: `electron/main.test.ts`
- Modify: `electron/preload.ts`
- Modify: `electron/preload.test.ts`
- Modify: `src/electron.d.ts`

**Interfaces:**
- Produces: `AppleVisionClient.detect(jpeg: Uint8Array, capturedAtMs: number): Promise<AppleVisionObservation | null>`.
- Produces: `GestureDesktopApi.detectAppleHand(jpeg, capturedAtMs)` and `saveHandSample(sample)`.

- [ ] Write failing client tests for request correlation, 250 ms timeout, latest-request isolation, corrupted output, process exit and delayed restart.
- [ ] Run the client tests and confirm the module is absent.
- [ ] Implement a dependency-injected process client with one in-flight request and strict response parsing.
- [ ] Write failing preload/main tests for the two fixed channels, 400 KiB limit, trusted-frame enforcement and lifecycle disposal.
- [ ] Implement the bridge and handlers; repair trace prevalidation so versions 1–5 reach the strict main-process parser.
- [ ] Run `npm test -- electron/appleVisionClient.test.ts electron/preload.test.ts electron/main.test.ts`.

### Task 3: 摄像头帧编码与调度

**Files:**
- Create: `src/vision/appleVisionFrame.ts`
- Create: `src/vision/appleVisionFrame.test.ts`
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`

**Interfaces:**
- Produces: `captureAppleVisionFrame(video, document): Promise<Uint8Array>`.
- Produces: `AppleVisionScheduler` with at most one request and an 80 ms minimum interval.

- [ ] Write failing tests for 512-pixel aspect-preserving canvas size, JPEG failure, single in-flight request, interval throttling and late-result rejection.
- [ ] Run the focused tests and confirm the new module is absent.
- [ ] Implement frame capture and scheduler independently of React.
- [ ] Wire the scheduler into fresh video frames only when the desktop bridge exists; store the latest observation and latest JPEG in refs without triggering extra renders.
- [ ] Run `npm test -- src/vision/appleVisionFrame.test.ts src/App.test.tsx`.

### Task 4: 双模型接触融合

**Files:**
- Create: `src/gesture/dualModelPinchFusion.ts`
- Create: `src/gesture/dualModelPinchFusion.test.ts`
- Modify: `src/gesture/types.ts`
- Modify: `src/gesture/pinchFeatures.ts`
- Modify: `src/gesture/pinchFeatures.test.ts`
- Modify: `src/gesture/pinchProbability.ts`
- Modify: `src/gesture/pinchProbability.test.ts`
- Modify: `src/gesture/pinchTemporalRecognizer.ts`
- Modify: `src/gesture/pinchTemporalRecognizer.test.ts`
- Modify: `src/gesture/gestureEngine.ts`
- Modify: `src/gesture/gestureEngine.test.ts`

**Interfaces:**
- Consumes: `SecondaryHandObservation` from Apple Vision.
- Produces: secondary ratio, confidence, age, mode and agreement diagnostics.
- Changes: `GestureEngine.update(..., imageAspectRatio?, secondaryHand?)`.

- [ ] Write failing unit tests proving stale/low-confidence Vision is ignored, side-view Vision contact can overcome erroneous MediaPipe distance, front-view Vision separation blocks contact and dual mode requires 3 of 5 votes.
- [ ] Run focused tests and confirm the current engine fails those cases.
- [ ] Implement observation validation, Vision geometry extraction and fusion without changing cursor coordinates or open-palm classification.
- [ ] Extend the temporal result with an explicit strict-voting flag instead of falsifying world quality.
- [ ] Run all gesture engine, probability, temporal and replay tests.

### Task 5: v5 诊断、中文界面与显式本地样本

**Files:**
- Modify: `src/gesture/gestureTrace.ts`
- Modify: `src/gesture/gestureTrace.test.ts`
- Modify: `src/gesture/gestureReplay.ts`
- Modify: `src/gesture/gestureReplay.test.ts`
- Modify: `src/components/GestureDiagnostics.tsx`
- Modify: `src/components/GestureDiagnostics.test.tsx`
- Create: `electron/handSampleExporter.ts`
- Create: `electron/handSampleExporter.test.ts`
- Modify: `src/App.tsx`

**Interfaces:**
- Produces: `GestureTraceV5`, with v1–v4 normalization.
- Produces: explicit “保存当前手部样本” action and local-only JSON export.

- [ ] Write failing v5 migration/replay tests and Chinese UI tests for mode, Vision ratio, confidence, age, inference and agreement.
- [ ] Run focused tests and confirm version/labels are missing.
- [ ] Implement exact v5 schema, legacy defaults and replay propagation of the secondary observation.
- [ ] Implement sample export validation, system save dialog and visible local-only wording; never call it automatically.
- [ ] Run trace, replay, exporter, component and App tests.

### Task 6: 回归、合并、打包和现场检查

**Files:**
- Verify all changed files.

**Interfaces:**
- Produces: merged `main`, packaged macOS application and running verified instance.

- [ ] Run `npm test && npm run build && npm run electron:typecheck && git diff --check`.
- [ ] Commit the feature branch, fast-forward merge to `main`, and repeat the full verification on `main`.
- [ ] Run `npm run electron:make`; confirm `hand-pose-helper` exists in packaged Resources and responds to a protocol smoke request.
- [ ] Replace only the prior packaged app process, launch the new application and inspect the UI for all Chinese dual-model diagnostics while leaving system control paused.
- [ ] Confirm the git tree is clean and preserve any saved local sample outside git.
