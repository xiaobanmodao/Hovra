# Adaptive Pinch Recognition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task in the current session. Do not delegate unless the user explicitly requests it. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用质量感知的多特征概率融合与短窗口投票替换当前双固定阈值硬合取，使真实捏合容易触发，同时继续阻止二维重合误触。

**Architecture:** `GestureEngine` 从同帧画面与世界坐标提取 `PinchFrameFeatures`，质量估计器评价世界坐标稳定性，概率估计器按质量动态融合距离、局部深度、接近速度和接触姿态，独立时间状态机以 2/3 或 3/4 投票锁定并在释放时点击。轨迹 v3 和离线基准先提供可量化证据；个人校准最后拟合每位用户的距离边界。

**Tech Stack:** TypeScript、React、MediaPipe Tasks Vision、Vitest、Electron、浏览器 `localStorage`

## Global Constraints

- 仅保留光标移动、左键点击和张手停止；不得恢复其他手势。
- 不增加运行时依赖，不更换 Hand Landmarker 模型，不上传任何摄像头或手部数据。
- 画面和世界坐标必须来自同一次 `detectForVideo` 调用。
- 世界坐标低质量时只降权，不单独否决；低质量点击必须通过多证据安全门。
- 张手停止继续走现有分类逻辑，不进入捏合概率状态机。
- 每一项生产代码前先添加失败测试；每项完成后运行对应目标测试。
- 不删除或放宽已有二维重合防误触、单次点击、光标移动和张手停止回归测试。

---

### Task 1: 建立捏合帧特征与失败样本基线

**Files:**
- Create: `src/gesture/pinchFeatures.ts`
- Create: `src/gesture/pinchFeatures.test.ts`
- Modify: `src/gesture/gestureFeatures.ts`
- Modify: `src/gesture/gestureFeatures.test.ts`
- Modify: `src/gesture/fixtures/stable-gesture-sequences.ts`

**Interfaces:**

```ts
export type PinchFrameFeatures = {
  timestampMs: number;
  imageRatio: number;
  worldRatio: number | null;
  imageDepthGap: number;
  worldDepthGap: number | null;
  approachVelocity: number;
  thumbCurl: number;
  indexCurl: number;
  contactPoseScore: number;
  frameIntervalMs: number | null;
};

export class PinchFeatureExtractor {
  update(image: HandGeometry, world: HandGeometry | null, nowMs: number): PinchFrameFeatures;
  reset(): void;
}
```

- [ ] **Step 1: 添加失败测试。** 用手掌局部坐标夹具覆盖：真实正面捏合、侧向捏合、画面重合但世界分离、静态重合、快速靠近、时间戳倒退。断言局部深度对旋转不敏感，接近速度只接受 8–80ms 间隔，倒退时间戳会重置历史。
- [ ] **Step 2: 运行 `npm test -- src/gesture/pinchFeatures.test.ts src/gesture/gestureFeatures.test.ts`。** 预期因模块不存在和 `GestureFeatures` 尚无 `pinch` 字段失败。
- [ ] **Step 3: 实现最小提取器。** 使用 `HandGeometry.localLandmarks` 计算局部 z 差；弯曲程度沿用 `gestureFeatures.ts` 的路径长度思想；速度为 `(previous.imageRatio - current.imageRatio) / deltaSeconds` 并限制到 `[-8, 8]`；所有输出必须为有限值。
- [ ] **Step 4: 在 `GestureFeatures` 增加 `pinch: PinchFrameFeatures`。** `extractGestureFeatures` 增加 `nowMs` 与提取器参数，现有 `leftPinchRatio` 等兼容字段暂时保留，避免一次大改破坏张手逻辑。
- [ ] **Step 5: 重跑目标测试。** 预期全部通过。
- [ ] **Step 6: 提交。** `git add src/gesture/pinchFeatures.ts src/gesture/pinchFeatures.test.ts src/gesture/gestureFeatures.ts src/gesture/gestureFeatures.test.ts src/gesture/fixtures/stable-gesture-sequences.ts && git commit -m "feat: extract temporal pinch features"`

### Task 2: 世界坐标质量估计

**Files:**
- Create: `src/gesture/pinchQuality.ts`
- Create: `src/gesture/pinchQuality.test.ts`

**Interfaces:**

```ts
export type PinchQualityReason =
  | "world-missing"
  | "stale-frame"
  | "scale-jump"
  | "bone-jitter"
  | "ratio-jitter";

export type PinchQuality = {
  score: number;
  usableForVoting: boolean;
  reasons: PinchQualityReason[];
};

export class PinchQualityEstimator {
  update(features: PinchFrameFeatures, world: HandGeometry | null): PinchQuality;
  reset(): void;
}
```

- [ ] **Step 1: 添加失败测试。** 稳定世界序列得分至少 0.8；缺失世界为 0 但帧在 80ms 内仍可由低质量路径投票；尺度突变 18%、骨长变异系数 12%、世界比例中位绝对偏差 0.08 分别给出对应原因；超过 80ms 的帧 `usableForVoting=false`；5 帧后旧异常离开窗口。
- [ ] **Step 2: 运行 `npm test -- src/gesture/pinchQuality.test.ts`。** 预期因模块不存在失败。
- [ ] **Step 3: 实现固定容量为 5 的环形历史。** 分数从 1 开始，缺失世界直接为 0；尺度跳变扣 0.35、骨长抖动扣 0.30、比例抖动扣 0.35，最终限制到 0–1。骨长集合固定使用腕—中指 MCP、食指 MCP—小指 MCP、拇指 CMC—拇指 MCP、食指 MCP—PIP，避免选择性调参。
- [ ] **Step 4: 重跑目标测试。** 预期全部通过。
- [ ] **Step 5: 提交。** `git add src/gesture/pinchQuality.ts src/gesture/pinchQuality.test.ts && git commit -m "feat: score world landmark stability"`

### Task 3: 质量感知的捏合概率

**Files:**
- Create: `src/gesture/pinchProbability.ts`
- Create: `src/gesture/pinchProbability.test.ts`
- Modify: `src/gesture/config.ts`
- Modify: `src/gesture/config.test.ts`
- Modify: `src/gesture/types.ts`

**Interfaces:**

```ts
export type PinchBoundaries = {
  imageContact: number;
  imageSeparate: number;
  worldContact: number;
  worldSeparate: number;
  depthContact: number;
  depthSeparate: number;
};

export type PinchProbabilityResult = {
  probability: number;
  worldQuality: number;
  safetyGatePassed: boolean;
  approachObserved: boolean;
  blockingReason: "none" | "image" | "depth" | "pose" | "approach";
};

export class PinchProbabilityEstimator {
  constructor(boundaries: PinchBoundaries, sensitivity: number);
  update(features: PinchFrameFeatures, quality: PinchQuality): PinchProbabilityResult;
  reset(): void;
}
```

- [ ] **Step 1: 添加失败测试。** 覆盖高质量真实捏合概率不低于 0.72、一个世界距离抖动帧仍可保持候选、世界坐标缺失但四项低质量证据齐全可进入、静态二维重合因无接近历史被阻断、世界深度分离不能进入、灵敏度只能把进入阈值从 0.72 调整到 `[0.66, 0.78]`。
- [ ] **Step 2: 运行 `npm test -- src/gesture/pinchProbability.test.ts src/gesture/config.test.ts`。** 预期因模块和配置缺失失败。
- [ ] **Step 3: 在 `config.ts` 增加安全默认参数。** 导出 `DEFAULT_PINCH_BOUNDARIES`、`pinchEntryProbabilityForSensitivity()` 和常量 `PINCH_RELEASE_PROBABILITY = 0.38`；严格限制灵敏度输入。
- [ ] **Step 4: 实现边界映射。** `closeness(value, contact, separate) = clamp01((separate - value) / (separate - contact))`，边界非有限、顺序错误或间隔小于 0.01 时构造器抛出 `TypeError`。
- [ ] **Step 5: 实现设计规格中的两组权重与低质量安全门。** 接近历史只保存最近 250ms 内且 `approachScore >= 0.55` 的证据；时间戳倒退或间隔超过 80ms 时清除该历史。
- [ ] **Step 6: 重跑目标测试。** 预期全部通过。
- [ ] **Step 7: 提交。** `git add src/gesture/pinchProbability.ts src/gesture/pinchProbability.test.ts src/gesture/config.ts src/gesture/config.test.ts src/gesture/types.ts && git commit -m "feat: fuse pinch evidence by quality"`

### Task 4: 短窗口捏合状态机

**Files:**
- Create: `src/gesture/pinchTemporalRecognizer.ts`
- Create: `src/gesture/pinchTemporalRecognizer.test.ts`

**Interfaces:**

```ts
export type PinchTemporalOutput = {
  phase: "neutral" | "candidate" | "active" | "releasing" | "cooldown" | "lost";
  confirmationProgress: number;
  activated: boolean;
  clicked: boolean;
  enterVotes: number;
  requiredVotes: number;
};

export class PinchTemporalRecognizer {
  update(result: PinchProbabilityResult | null, nowMs: number, usableForVoting: boolean): PinchTemporalOutput;
  reset(): void;
}
```

- [ ] **Step 1: 添加失败测试。** 高质量 2/3 进入，低质量 3/4 进入；单个抖动帧不复位；陈旧帧不投票；2/3 释放后只点击一次；未进入 `active` 的释放不点击；70ms 冷却且概率保持低位后才能回到 neutral；时间戳倒退安全复位。
- [ ] **Step 2: 运行 `npm test -- src/gesture/pinchTemporalRecognizer.test.ts`。** 预期因模块不存在失败。
- [ ] **Step 3: 实现固定数组窗口。** 高质量定义为 `worldQuality >= 0.60`；进入阈值来自概率结果对应配置，释放阈值固定 0.38；高低质量帧混合时采用更严格的 3/4 规则。
- [ ] **Step 4: 实现一次性点击语义。** 只有 `active -> releasing -> cooldown` 转换的第一帧返回 `clicked=true`；丢失超过 120ms 取消锁定并且不点击。
- [ ] **Step 5: 重跑目标测试。** 预期全部通过。
- [ ] **Step 6: 提交。** `git add src/gesture/pinchTemporalRecognizer.ts src/gesture/pinchTemporalRecognizer.test.ts && git commit -m "feat: recognize pinch with temporal voting"`

### Task 5: 接入引擎并移除左键硬合取

**Files:**
- Modify: `src/gesture/gestureClassifier.ts`
- Modify: `src/gesture/gestureClassifier.test.ts`
- Modify: `src/gesture/gestureEngine.ts`
- Modify: `src/gesture/gestureEngine.test.ts`
- Modify: `src/gesture/gestureEngine.replay.test.ts`
- Modify: `src/gesture/gestureStabilizer.ts`
- Modify: `src/gesture/gestureStabilizer.test.ts`

**Interfaces:**
- `GestureClassifier` 只分类 `open-palm`；不再产生 `left` 候选。
- `GestureEngine` 合并 `PinchTemporalRecognizer` 的左键阶段与现有张手阶段，左键优先于张手候选，但已经锁定的张手停止优先于所有点击输出。

- [ ] **Step 1: 先扩充引擎失败测试。** 覆盖正面/侧向真实捏合、一个世界抖动帧、世界坐标短暂缺失、二维重合分离、静态指尖重合、拳头、张手停止、一次捏合一次点击、丢手不点击。
- [ ] **Step 2: 运行 `npm test -- src/gesture/gestureClassifier.test.ts src/gesture/gestureStabilizer.test.ts src/gesture/gestureEngine.test.ts src/gesture/gestureEngine.replay.test.ts`。** 预期新召回测试被当前硬合取拒绝。
- [ ] **Step 3: 从分类器删除 `hasPinchEvidence` 和左键分支。** 保留并锁定张手进入/退出阈值行为；旧左键分类测试改成状态机/引擎测试，不删除其反例夹具。
- [ ] **Step 4: 在引擎构造并重置新链路。** 每个有效帧依次调用特征、质量、概率和时间状态机；无手、时间倒退和引擎重建时同步重置所有历史。
- [ ] **Step 5: 映射公共输出。** 捏合状态映射到现有 `GestureOutput.phase/candidate/lockedGesture/confirmationProgress`；只使用 `PinchTemporalOutput.clicked` 设置 `click=true`，删除“释放时还要求当前世界坐标可靠”的旧条件。
- [ ] **Step 6: 解决与张手的仲裁。** 张手进入锁定后状态为 `paused`，不发送移动或点击；捏合 active 时不得被同帧错误的张手候选夺走；丢手沿用 120ms 安全取消且不产生点击。
- [ ] **Step 7: 重跑目标测试。** 预期全部通过。
- [ ] **Step 8: 提交。** `git add src/gesture/gestureClassifier.ts src/gesture/gestureClassifier.test.ts src/gesture/gestureEngine.ts src/gesture/gestureEngine.test.ts src/gesture/gestureEngine.replay.test.ts src/gesture/gestureStabilizer.ts src/gesture/gestureStabilizer.test.ts && git commit -m "feat: use adaptive pinch recognition"`

### Task 6: 轨迹 v3、中文诊断和离线指标

**Files:**
- Modify: `src/gesture/gestureTrace.ts`
- Modify: `src/gesture/gestureTrace.test.ts`
- Modify: `src/gesture/gestureReplay.ts`
- Modify: `src/gesture/gestureReplay.test.ts`
- Create: `src/gesture/pinchBenchmark.ts`
- Create: `src/gesture/pinchBenchmark.test.ts`
- Modify: `src/gesture/types.ts`
- Modify: `src/gesture/gestureEngine.ts`
- Modify: `src/components/GestureDiagnostics.tsx`
- Modify: `src/components/GestureDiagnostics.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Modify: `src/i18n/zh-CN.ts`
- Modify: `src/i18n/zh-CN.test.ts`

**Interfaces:**

```ts
export type PinchBenchmarkLabel = "contact" | "separate" | "ignore";
export type PinchBenchmarkMetrics = {
  positives: number;
  truePositives: number;
  falsePositives: number;
  duplicateClicks: number;
  recall: number | null;
  p95ActivationLatencyMs: number | null;
  effectiveFps: number;
};

export function benchmarkPinchTrace(
  trace: GestureTraceV3,
  labels: ReadonlyMap<number, PinchBenchmarkLabel>,
): PinchBenchmarkMetrics;
```

- [ ] **Step 1: 添加轨迹迁移失败测试。** v3 严格保存新特征、质量原因、概率、投票和 `frameIntervalMs`；v1/v2 解析后补安全空值；未知字段、NaN、超过 2 MiB、超过 600 帧和非单调时间戳继续拒绝；快照必须深复制。
- [ ] **Step 2: 添加基准失败测试。** 使用人工标签夹具验证召回、误触、重复点击、P95 延迟和有效帧率；没有正样本时返回 `null` 而不是伪造 100% 召回。
- [ ] **Step 3: 添加中文诊断失败测试。** 断言界面显示“接触概率”“世界坐标质量”“投票”“阻断原因”“有效帧率”，并且不出现未翻译枚举。
- [ ] **Step 4: 运行 `npm test -- src/gesture/gestureTrace.test.ts src/gesture/gestureReplay.test.ts src/gesture/pinchBenchmark.test.ts src/components/GestureDiagnostics.test.tsx src/i18n/zh-CN.test.ts`。** 预期因 v3 类型和界面字段缺失失败。
- [ ] **Step 5: 实现 v3 严格解析与 v1/v2 迁移。** 保持旧 `landmarks/worldLandmarks` 回放行为；旧帧新增字段使用 `null`、0 或空数组，不推断不存在的可靠性。
- [ ] **Step 6: 实现基准纯函数。** 点击归属最近一次尚未消费的 `contact` 标记；同一接触段第二次点击计入重复；`separate` 段点击计入误触；P95 使用升序数组的 nearest-rank 索引。
- [ ] **Step 7: 更新引擎诊断与中文界面。** 质量原因和阻断原因通过 `zh-CN.ts` 的穷尽映射显示，不直接展示英文枚举。
- [ ] **Step 8: 记录推理耗时。** `App.tsx` 在 `detectFirstHand` 调用前后用 `performance.now()` 计时，只把数值传入诊断；不得改变检测调度或保存视频帧。
- [ ] **Step 9: 重跑目标测试。** 预期全部通过。
- [ ] **Step 10: 提交。** `git add src/gesture/gestureTrace.ts src/gesture/gestureTrace.test.ts src/gesture/gestureReplay.ts src/gesture/gestureReplay.test.ts src/gesture/pinchBenchmark.ts src/gesture/pinchBenchmark.test.ts src/gesture/types.ts src/gesture/gestureEngine.ts src/components/GestureDiagnostics.tsx src/components/GestureDiagnostics.test.tsx src/App.tsx src/App.test.tsx src/i18n/zh-CN.ts src/i18n/zh-CN.test.ts && git commit -m "feat: diagnose adaptive pinch decisions"`

### Task 7: 个人校准配置与中文向导

**Files:**
- Create: `src/gesture/pinchCalibration.ts`
- Create: `src/gesture/pinchCalibration.test.ts`
- Create: `src/components/PinchCalibrationWizard.tsx`
- Create: `src/components/PinchCalibrationWizard.test.tsx`
- Modify: `src/components/CalibrationPanel.tsx`
- Modify: `src/components/CalibrationPanel.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Modify: `src/styles.css`

**Interfaces:**

```ts
export type PinchCalibrationProfile = {
  version: 1;
  createdAt: string;
  boundaries: PinchBoundaries;
  baselineNoise: number;
};

export function fitPinchCalibration(samples: CalibrationSamples): PinchCalibrationProfile;
export function parsePinchCalibration(value: string | null): PinchCalibrationProfile | null;
export const PINCH_CALIBRATION_STORAGE_KEY = "gesture-control.pinch-calibration.v1";
```

- [ ] **Step 1: 添加拟合失败测试。** 10 次正样本、3 次负样本可生成边界；正样本采用第 90 百分位加 8% 余量；负样本采用第 10 百分位；边界间隔至少 0.06；样本不足、非有限值、正负重叠和非法 JSON 全部拒绝或返回 `null`，不得部分写入。
- [ ] **Step 2: 添加向导失败测试。** 中文四阶段流程、样本计数、取消不保存、失败提示、成功保存、重做和清除；组件不接触摄像头 API，只消费 App 提供的实时 `PinchFrameFeatures`。
- [ ] **Step 3: 运行 `npm test -- src/gesture/pinchCalibration.test.ts src/components/PinchCalibrationWizard.test.tsx src/components/CalibrationPanel.test.tsx src/App.test.tsx`。** 预期因模块和入口不存在失败。
- [ ] **Step 4: 实现纯拟合与严格解析。** 用复制后排序的数组计算分位数；ISO 时间必须可解析；所有边界必须为有限正数且满足 contact < separate；解析失败返回 `null` 并让调用方使用默认值。
- [ ] **Step 5: 实现向导。** 阶段固定为 3 秒自然移动、5 次正面、5 次侧面、3 次不接触负样本；每次样本必须跨越一次 separate→contact→separate，避免把多个相邻帧错误计成多次动作。
- [ ] **Step 6: 接入 App 和校准面板。** 初始化时读取一次本地配置并传给 `GestureEngine`；成功校准后原子地写入一个 JSON 字符串并重建引擎；清除后恢复默认边界。现有“恢复默认设置”同时清除个人捏合配置，并在按钮说明中明确提示。
- [ ] **Step 7: 更新样式与无障碍。** 向导可键盘操作，步骤变化使用 `aria-live="polite"`，不依赖颜色传达成功或失败。
- [ ] **Step 8: 重跑目标测试。** 预期全部通过。
- [ ] **Step 9: 提交。** `git add src/gesture/pinchCalibration.ts src/gesture/pinchCalibration.test.ts src/components/PinchCalibrationWizard.tsx src/components/PinchCalibrationWizard.test.tsx src/components/CalibrationPanel.tsx src/components/CalibrationPanel.test.tsx src/App.tsx src/App.test.tsx src/styles.css && git commit -m "feat: calibrate pinch recognition locally"`

### Task 8: 固定回放验收与性能门槛

**Files:**
- Modify: `src/gesture/fixtures/stable-gesture-sequences.ts`
- Modify: `src/gesture/gestureEngine.replay.test.ts`
- Modify: `src/gesture/pinchBenchmark.test.ts`
- Modify: `README.md`

- [ ] **Step 1: 添加完整正负回放矩阵。** 至少包含正面、侧面、斜面真实捏合；远近尺度变化；单帧世界抖动；世界短暂缺失；二维重合分离；拳头；张手；快速经过；丢手。每个序列显式标注期望点击数和最大激活延迟。
- [ ] **Step 2: 运行 `npm test -- src/gesture/gestureEngine.replay.test.ts src/gesture/pinchBenchmark.test.ts`。** 若任一矩阵不符合设计指标，测试应给出具体序列名和指标差值。
- [ ] **Step 3: 只根据固定矩阵调整种子参数。** 允许修改概率权重和默认边界，但不得删除样本、移动人工标签或放宽二维重合负样本；每次参数修改都重跑整个矩阵。
- [ ] **Step 4: 在 README 记录真人验收协议。** 200 次正样本、30 分钟负样本、召回率 ≥98%、误触 ≤1、重复点击 0、P95 ≤100ms、有效帧率 ≥30fps，并说明诊断记录不含图像。
- [ ] **Step 5: 执行性能分支判定。** 在打包应用连续运行 10 秒：若推理 P95 ≤12ms 且有效帧率 ≥30fps，记录门槛通过；否则停止参数调整，另写 Worker 实施计划，不在本任务中临时改线程架构。
- [ ] **Step 6: 提交。** `git add src/gesture/fixtures/stable-gesture-sequences.ts src/gesture/gestureEngine.replay.test.ts src/gesture/pinchBenchmark.test.ts README.md && git commit -m "test: benchmark adaptive pinch recognition"`

### Task 9: 全量验证、打包与现场基准

**Files:**
- Verify only

- [ ] **Step 1: 运行静态与自动测试。** `npm test && npm run build && npm run electron:typecheck && git diff --check`；任何失败都先修复并重跑对应命令。
- [ ] **Step 2: 打包。** 运行 `npm run electron:make`，确认生成 arm64 应用包且构建过程无错误。
- [ ] **Step 3: 启动最新版应用。** 关闭旧的本项目应用进程，启动 `/Users/hht/Desktop/手势控制/out/手势控制-darwin-arm64/手势控制.app`；不影响其他应用进程。
- [ ] **Step 4: 执行 20 秒校准。** 完成 5 次正面、5 次侧面和 3 次故意不接触样本，确认成功后诊断显示个人边界已启用。
- [ ] **Step 5: 执行现场快速基准。** 至少 30 次真实点击、5 分钟负样本和三种手部朝向；保存诊断记录并用基准函数计算指标。快速基准要求点击召回率 ≥97%、误触 0、重复 0、P95 ≤100ms、有效帧率 ≥30fps；完整 200 次/30 分钟指标由后续正式验收完成。
- [ ] **Step 6: 最终检查。** `git status --short` 只能显示有意改动；`git log --oneline -10` 应包含本计划的聚焦提交；若现场参数发生变化，重跑 Task 8 全部回放和 Step 1 全量验证。

## 完成定义

- 自动测试、构建、Electron 类型检查、打包和 `git diff --check` 全部通过。
- 固定回放矩阵阻止二维重合误触，并容忍单帧世界坐标抖动。
- 中文校准与诊断可用，所有个人数据只保存在本机且不含图像。
- 现场快速基准达到 Task 9 指标；完整验收协议已经记录，可重复执行。
- 性能不达标时明确转入独立 Worker 计划，不用降低识别安全条件掩盖问题。
