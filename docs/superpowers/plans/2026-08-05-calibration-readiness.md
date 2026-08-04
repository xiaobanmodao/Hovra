# Calibration Readiness Feedback Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Follow superpowers:test-driven-development for every production behavior change.

**Goal:** 在个人点击校准中增加与最终拟合规则一致的实时可记录判定、稳定窗口和精确失败诊断。

**Architecture:** 新增一个无 React 依赖的纯判定模块，根据校准阶段、最近四帧和已记录接触样本生成中文状态与逐项检查。拟合模块暴露结构化区分度分析；向导负责维护窗口、门控按钮、记录中位样本并展示状态。

**Tech Stack:** React 19、TypeScript、Vitest、Testing Library、Electron Forge。

---

### Task 1: 结构化区分度分析

**Files:**
- Modify: `src/gesture/pinchCalibration.ts`
- Modify: `src/gesture/pinchCalibration.test.ts`

1. 先写失败测试：构造只在三维距离和前后深度失败的样本，断言专用错误包含两个失败维度、每项间隔和 `0.06` 要求。
2. 运行 `npm test -- src/gesture/pinchCalibration.test.ts`，确认因结构化 API 不存在而失败。
3. 新增边界分析类型、`PinchCalibrationSeparationError` 和纯分析函数，让 `fitPinchCalibration` 使用该结果。
4. 再次运行定向测试并重构重复的边界检查代码。

### Task 2: 四帧实时可记录判定器

**Files:**
- Create: `src/gesture/pinchCalibrationReadiness.ts`
- Create: `src/gesture/pinchCalibrationReadiness.test.ts`

1. 先写失败测试，覆盖无手、接触距离不合格、正确但稳定帧不足、四帧稳定合格。
2. 运行定向测试，确认模块缺失导致失败。
3. 实现接触阶段阈值、四帧窗口、波动限制和中文反馈，运行测试转绿。
4. 再写失败测试覆盖假重合的画面重合、三维分开、深度分开及抖动拒绝。
5. 实现动态安全边界和逐项检查，运行定向测试转绿。
6. 增加窗口中位样本函数及测试，保证记录值不受最后一帧偶然偏差影响。

### Task 3: 接入校准向导

**Files:**
- Modify: `src/components/PinchCalibrationWizard.tsx`
- Modify: `src/components/PinchCalibrationWizard.test.tsx`
- Modify: `src/styles.css`

1. 先改向导测试：逐帧重渲染形成稳定窗口；断言按钮在不足四帧时禁用、合格后启用、点击后重新禁用。
2. 运行 `npm test -- src/components/PinchCalibrationWizard.test.tsx`，确认现有实现不满足门控。
3. 在向导维护按阶段重置的最近样本，调用判定器并只记录窗口中位样本。
4. 添加实时状态卡片、四项检查和三态样式，运行向导测试转绿。
5. 先写最终失败中文诊断测试，再接入 `PinchCalibrationSeparationError` 的失败维度与建议，运行定向测试转绿。

### Task 4: 回归、集成与桌面交付

**Files:**
- Verify all changed files

1. 运行 `npm test`、`npm run build`、`npm run electron:typecheck`。
2. 检查工作区差异和状态，提交功能分支。
3. 按 `superpowers:verification-before-completion` 和 `superpowers:finishing-a-development-branch` 完成验证，并按用户已授权的本地交付方式快进合并回 `main`。
4. 在 `main` 再次运行全量测试与构建。
5. 运行 `npm run electron:make`，启动 `out/手势控制-darwin-arm64/手势控制.app`。
6. 现场检查打包应用中的中文实时判定卡、按钮门控和无手反馈，记录最终结果。
