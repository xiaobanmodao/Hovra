# 意图感知手势控制与 2.5D 手部反馈 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. 本项目按用户要求由当前会话顺序执行，不启用子智能体。

**Goal:** 用真实使用标注和可重放轨迹替换图片动作测试，并完成低延迟、低误触的释放点击状态机和受约束 2.5D 手部反馈。

**Architecture:** `GestureEngine` 继续负责几何和手势概率，新增纯点击意图状态机消费每帧概率、光标、速度与抑制信号；`IntentFeedbackStore` 只记录有界数值轨迹和显式标签；离线分析器重放标签事件并只给出不增加误触的建议；`handOverlayModel` 把 21 点数据转换为与 Canvas 无关的 2.5D 绘制模型，`CameraStage` 负责最终呈现。

**Tech Stack:** React、TypeScript、Vitest、Testing Library、MediaPipe Tasks Vision、Canvas、Electron/Vite。

---

### Task 1: 固化状态机契约和 One Euro 滤波

**Files:**
- Create: `src/gesture/pinchClickStateMachine.ts`
- Create: `src/gesture/pinchClickStateMachine.test.ts`
- Create: `src/gesture/oneEuroFilter.ts`
- Create: `src/gesture/oneEuroFilter.test.ts`
- Modify: `src/gesture/types.ts`

- [ ] 先写失败测试，覆盖两帧进入/释放、释放时单击、捏合前位置锁定、单帧抖动不点击、高速取消、长按取消、张掌/握拳冷却和断帧重置。
- [ ] 运行 `npx vitest run src/gesture/pinchClickStateMachine.test.ts src/gesture/oneEuroFilter.test.ts`，确认因实现缺失而失败。
- [ ] 实现无副作用纯状态机和真实时间间隔 One Euro 过滤器；事件返回锁定的点击坐标和阻止原因。
- [ ] 再次运行聚焦测试并确认通过。

### Task 2: 集成手势引擎和桌面点击派发

**Files:**
- Modify: `src/gesture/gestureEngine.ts`
- Modify: `src/gesture/gestureEngine.test.ts`
- Modify: `src/gesture/types.ts`
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`

- [ ] 先写失败测试，证明点击仅在稳定释放时产生，系统点击使用锁定坐标，抑制/高速/跟踪恢复不会点击。
- [ ] 运行聚焦测试，确认当前进入即点击或缺少锁定坐标导致失败。
- [ ] 把状态机接入引擎输出，并让 App 在点击事件发生时先移动到锁定坐标再派发一次左键；不得更改系统控制开关。
- [ ] 运行引擎与 App 聚焦测试并确认通过。

### Task 3: 真实意图事件、持久化和离线建议

**Files:**
- Create: `src/gesture/intentFeedback.ts`
- Create: `src/gesture/intentFeedback.test.ts`
- Create: `src/gesture/intentTuning.ts`
- Create: `src/gesture/intentTuning.test.ts`
- Reuse: `src/gesture/gestureReplay.ts`
- Reuse: `src/gesture/gestureTrace.ts`

- [ ] 先写失败测试，覆盖点击前后有界轨迹、未标注不能算正确、标注更新、容量淘汰、损坏 JSON 恢复、样本不足拒绝和误触优先的参数选择。
- [ ] 运行聚焦测试并确认缺少模块导致失败。
- [ ] 实现纯事件记录器、序列化/反序列化和候选参数回放评分；建议必须降低误触且保持正确点击安全下限。
- [ ] 运行聚焦测试并确认通过。

### Task 4: 中文真实反馈面板替换图片测试入口

**Files:**
- Create: `src/components/IntentFeedbackPanel.tsx`
- Create: `src/components/IntentFeedbackPanel.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Modify: `src/styles.css`
- Stop rendering: `src/components/StabilityTestPanel.tsx`

- [ ] 先写失败测试，覆盖最近一次点击的“这是误触/这是正确点击”、统计、样本不足、应用、撤销和清空；断言旧图片测试不再出现在主流程。
- [ ] 运行组件与 App 聚焦测试并确认失败。
- [ ] 实现不阻塞操作的中文反馈面板、本地持久化和设置快照；应用/撤销不得启用系统控制。
- [ ] 运行聚焦测试并确认通过。

### Task 5: 受约束 2.5D 手部绘制模型

**Files:**
- Create: `src/gesture/handOverlayModel.ts`
- Create: `src/gesture/handOverlayModel.test.ts`
- Modify: `src/components/CameraStage.tsx`
- Modify: `src/components/CameraStage.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/styles.css`

- [ ] 先写失败测试，覆盖掌心五边形、21 个关节、20 个骨段、由远到近排序、逐级骨宽、捏合连接带和不完整数据安全降级。
- [ ] 运行聚焦测试并确认缺少模型或旧细线骨骼导致失败。
- [ ] 实现与 Canvas 解耦的 2.5D 模型；在 CameraStage 绘制掌心、圆角骨段、关节、深度层次、拇指/食指高亮和中文状态。
- [ ] 运行模型与组件测试并确认通过。

### Task 6: 回归、构建和页面实测

**Files:**
- Modify as required by failures only.

- [ ] 运行 `npm test` 并修复所有回归。
- [ ] 运行 `npm run electron:typecheck`。
- [ ] 运行 `npm run build`。
- [ ] 启动本地开发服务，在浏览器验证摄像头区、中文真实反馈面板、旧图片流程消失、响应式布局和无控制台错误。
- [ ] 检查 `git diff --check` 和工作区变更，记录最终验证结果。

