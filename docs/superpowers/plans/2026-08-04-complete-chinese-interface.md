# Complete Chinese Interface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将手势控制桌面应用的所有用户可见界面、状态与保存对话框完整改为简体中文，同时保持手势识别协议、追踪 JSON 和底层行为不变。

**Architecture:** 在 `src/i18n/zh-CN.ts` 建立唯一的动态枚举显示映射，并由校准与诊断区域复用；各组件内的静态展示文案直接替换为中文。Electron 主进程仅本地化诊断导出对话框的可见标题与文件类型名称，文件格式与 IPC 合同维持不变。

**Tech Stack:** React 18、TypeScript、Vitest、Electron、Vite、Electron Forge。

## Global Constraints

- 面向用户的界面、按钮、状态、辅助功能标签、错误提示和系统保存对话框均使用简体中文。
- `GestureState`、`GesturePhase`、`GestureKind` 的内部英文枚举、IPC 名称、trace JSON 字段和 CSS 类名不得改变。
- 未识别值在界面上统一显示为 `—`，不可向用户泄露英文内部枚举。
- `gesture-trace.json` 保持为默认文件名，JSON 内容和 UTF-8 导出格式不得改变。
- 不新增运行时依赖，不变更手势识别、系统鼠标控制、权限或校准数值逻辑。

---

## File Structure

- Create: `src/i18n/zh-CN.ts` — 动态手势状态、阶段和动作种类的中文标签函数。
- Create: `src/i18n/zh-CN.test.ts` — 标签函数的完整枚举覆盖测试。
- Modify: `src/App.tsx` — 摄像头和追踪器的运行时状态改为中文。
- Modify: `src/components/StatusPanel.tsx` — 状态卡标题和辅助功能标签改为中文。
- Modify: `src/components/SystemControlPanel.tsx` — 桌面控制、权限说明和操作按钮改为中文。
- Modify: `src/components/CameraStage.tsx` — 摄像头区标题、隐私标签、错误提示与重试按钮改为中文。
- Modify: `src/components/CalibrationPanel.tsx` — 校准面板静态文案改为中文并显示 `gestureStateLabel`。
- Modify: `src/components/Playground.tsx` — 测试游乐场文案和计数器改为中文。
- Modify: `src/components/GestureDiagnostics.tsx` — 诊断字段、保存反馈以及动态 phase/candidate/locked action 改为中文。
- Modify: `src/gesture/config.ts` — 校准控件的标签和无障碍标签改为中文。
- Modify: `electron/gestureTraceExporter.ts` — macOS 保存对话框标题与 JSON 文件类型改为中文。
- Modify: affected `*.test.tsx` / `*.test.ts` — 断言中文文案，且保留既有交互与导出合同断言。

### Task 1: 建立中文动态状态映射

**Files:**
- Create: `src/i18n/zh-CN.ts`
- Create: `src/i18n/zh-CN.test.ts`

**Interfaces:**
- Consumes: `GestureState`、`GesturePhase`、`GestureKind` from `src/gesture/types.ts`。
- Produces: `gestureStateLabel(state: GestureState): string`、`gesturePhaseLabel(phase: GesturePhase): string`、`gestureKindLabel(kind: GestureKind | null): string`。

- [ ] **Step 1: 写出会失败的映射单元测试**

```ts
import { gestureKindLabel, gesturePhaseLabel, gestureStateLabel } from "./zh-CN";

it("maps every user-visible gesture enum to Chinese", () => {
  expect(gestureStateLabel("left-pinching")).toBe("左键捏合");
  expect(gestureStateLabel("lost")).toBe("未检测到手部");
  expect(gesturePhaseLabel("candidate")).toBe("候选确认");
  expect(gesturePhaseLabel("releasing")).toBe("释放确认");
  expect(gestureKindLabel("open-palm")).toBe("张开手掌");
  expect(gestureKindLabel(null)).toBe("—");
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `npm test -- src/i18n/zh-CN.test.ts`

Expected: FAIL，因为 `src/i18n/zh-CN.ts` 尚不存在。

- [ ] **Step 3: 实现穷尽的中文标签函数**

```ts
import type { GestureKind, GesturePhase, GestureState } from "../gesture/types";

const GESTURE_STATES: Record<GestureState, string> = {
  tracking: "跟踪中", "left-pinching": "左键捏合", "right-pinching": "右键捏合",
  "double-pinching": "双击捏合", dragging: "拖动中", scrolling: "滚动中",
  paused: "已暂停", lost: "未检测到手部",
};
const GESTURE_PHASES: Record<GesturePhase, string> = {
  neutral: "空闲", candidate: "候选确认", active: "已确认", dragging: "拖动中",
  releasing: "释放确认", cooldown: "冷却中", lost: "未检测到手部",
};
const GESTURE_KINDS: Record<GestureKind, string> = {
  left: "左键", right: "右键", double: "双击", scroll: "滚动", "open-palm": "张开手掌",
};

export const gestureStateLabel = (state: GestureState) => GESTURE_STATES[state];
export const gesturePhaseLabel = (phase: GesturePhase) => GESTURE_PHASES[phase];
export const gestureKindLabel = (kind: GestureKind | null) => kind ? GESTURE_KINDS[kind] : "—";
```

- [ ] **Step 4: 运行映射测试并确认通过**

Run: `npm test -- src/i18n/zh-CN.test.ts`

Expected: PASS，覆盖所有三类动态枚举和空动作值。

- [ ] **Step 5: 提交映射基础设施**

```bash
git add src/i18n/zh-CN.ts src/i18n/zh-CN.test.ts
git commit -m "feat: add Chinese gesture labels"
```

### Task 2: 将 React 用户界面改为中文并接入动态映射

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/StatusPanel.tsx`
- Modify: `src/components/SystemControlPanel.tsx`
- Modify: `src/components/CameraStage.tsx`
- Modify: `src/components/CalibrationPanel.tsx`
- Modify: `src/components/Playground.tsx`
- Modify: `src/components/GestureDiagnostics.tsx`
- Modify: `src/gesture/config.ts`
- Modify: `src/App.test.tsx`
- Modify: `src/components/CalibrationPanel.test.tsx`
- Modify: `src/components/CameraStage.test.tsx`
- Modify: `src/components/GestureDiagnostics.test.tsx`
- Modify: `src/components/Playground.test.tsx`
- Modify: `src/components/SystemControlPanel.test.tsx`

**Interfaces:**
- Consumes: `gestureStateLabel`、`gesturePhaseLabel`、`gestureKindLabel` from `src/i18n/zh-CN.ts`。
- Produces: 仅中文的渲染文本和 `aria-label`；所有组件 props、手势输出和交互回调签名保持不变。

- [ ] **Step 1: 先将核心组件测试期望改为中文**

```ts
expect(screen.getByRole("button", { name: "启用系统控制" })).toBeDisabled();
expect(screen.getByText("浏览器演示模式")).toBeInTheDocument();
expect(screen.getByRole("button", { name: "重试摄像头" })).toBeInTheDocument();
expect(screen.getByText("右键次数：1")).toBeInTheDocument();
expect(screen.getByText("候选确认")).toBeInTheDocument();
```

同步把 App、校准面板、诊断面板、测试游乐场和系统控制面板中全部与用户文案关联的英文断言替换为预期中文；不要改动测试传入的英文枚举值。

- [ ] **Step 2: 运行这些测试并确认失败**

Run: `npm test -- src/App.test.tsx src/components/CalibrationPanel.test.tsx src/components/CameraStage.test.tsx src/components/GestureDiagnostics.test.tsx src/components/Playground.test.tsx src/components/SystemControlPanel.test.tsx`

Expected: FAIL，现有组件仍渲染英文文本和原始枚举。

- [ ] **Step 3: 替换 App 与状态面板的运行时文案**

```ts
const [cameraStatus, setCameraStatus] = useState("正在请求摄像头权限");
const [trackerStatus, setTrackerStatus] = useState("等待摄像头");
// handleCameraReady: "摄像头已启用"
// handleCameraError: tracker status "不可用"
// model lifecycle: "正在加载模型"、"准备就绪，请展示一只手"、"模型加载失败，请重新加载后重试"

<section aria-label="摄像头、追踪器和手势状态">
  <span>摄像头</span><span>追踪器</span><span>手势</span>
</section>
```

将 App 标题、介绍和状态字符串全部替换为中文；`StatusPanel` 仅显示传入的中文状态，不在此处重新解释内部枚举。

- [ ] **Step 4: 替换控制、摄像头、校准和游乐场文案**

```ts
const status = permission === "browser" ? "浏览器演示模式"
  : permission === "denied" ? "需要辅助功能权限"
  : enabled ? "已启用" : "已暂停";

{enabled ? "暂停系统控制" : "启用系统控制"}
<button type="button">重试摄像头</button>
<p className="eyebrow">实时诊断</p>
<h2>校准</h2>
```

把 `SystemControlPanel` 的权限说明、按钮及设置入口，`CameraStage` 的所有摄像头错误消息、标题、隐私标签与预览辅助文本，`CalibrationPanel` 的标题/折叠标签/诊断字段/重置按钮，以及 `Playground` 的手势说明、目标和计数器都替换为自然简体中文。`config.ts` 将控件 label 和 accessibleLabel 替换为“手势灵敏度”“光标平滑”“水平光标偏移”“垂直光标偏移”“拖动保持时间”。

- [ ] **Step 5: 在校准与诊断区使用中文动态映射**

```tsx
import { gestureKindLabel, gesturePhaseLabel, gestureStateLabel } from "../i18n/zh-CN";

<dd>{gestureStateLabel(gestureState)}</dd>
<div><dt>阶段</dt><dd>{gesturePhaseLabel(output.phase)}</dd></div>
<div><dt>候选动作</dt><dd>{gestureKindLabel(output.candidate)}</dd></div>
<div><dt>锁定动作</dt><dd>{gestureKindLabel(output.lockedGesture)}</dd></div>
```

将诊断标签改为“确认进度”“手掌尺度”“捏合比例（左 / 右 / 双）”“滚动评分”“质量”，保存按钮和三种保存反馈改为中文。仅显示标签函数结果；`GestureOutput` 和诊断数值本身保持原样。

- [ ] **Step 6: 运行 React 定向测试并确认通过**

Run: `npm test -- src/App.test.tsx src/components/CalibrationPanel.test.tsx src/components/CameraStage.test.tsx src/components/GestureDiagnostics.test.tsx src/components/Playground.test.tsx src/components/SystemControlPanel.test.tsx`

Expected: PASS，中文文案、动态枚举翻译与既有点击/重试/权限交互均通过。

- [ ] **Step 7: 提交 React 本地化**

```bash
git add src/App.tsx src/components src/gesture/config.ts
git commit -m "feat: localize interface to Chinese"
```

### Task 3: 本地化 Electron 诊断导出保存对话框

**Files:**
- Modify: `electron/gestureTraceExporter.ts`
- Modify: `electron/gestureTraceExporter.test.ts`

**Interfaces:**
- Consumes: `saveGestureTrace(json, dependencies)` 的既有依赖注入接口。
- Produces: 相同的 `Promise<"saved" | "cancelled">`、相同 JSON 验证与写入调用，且显示中文对话框标题和类型名。

- [ ] **Step 1: 将保存对话框测试期望先改为中文**

```ts
expect(deps.showSaveDialog).toHaveBeenCalledWith(expect.objectContaining({
  title: "保存手势诊断记录",
  defaultPath: "gesture-trace.json",
  filters: [{ name: "手势诊断记录", extensions: ["json"] }],
}));
```

- [ ] **Step 2: 运行导出器测试并确认失败**

Run: `npm test -- electron/gestureTraceExporter.test.ts`

Expected: FAIL，当前对话框标题为英文。

- [ ] **Step 3: 仅替换导出器的可见文字**

```ts
const result = await dependencies.showSaveDialog({
  title: "保存手势诊断记录",
  defaultPath: "gesture-trace.json",
  filters: [{ name: "手势诊断记录", extensions: ["json"] }],
});
```

不要修改 `parseGestureTrace`、文件名、JSON 美化格式、编码或错误传播。

- [ ] **Step 4: 运行导出器测试并确认通过**

Run: `npm test -- electron/gestureTraceExporter.test.ts`

Expected: PASS，保存、取消、非法 trace 和写入失败的既有行为都保持通过。

- [ ] **Step 5: 提交主进程本地化**

```bash
git add electron/gestureTraceExporter.ts electron/gestureTraceExporter.test.ts
git commit -m "feat: localize trace save dialog"
```

### Task 4: 完整回归、打包与运行时中文验收

**Files:**
- Modify: 无；仅在发现遗留用户可见英文时返回对应任务修正。

**Interfaces:**
- Consumes: 前三项的本地化实现和现有构建脚本。
- Produces: 可启动的 macOS arm64 中文桌面应用及可复现的测试、类型检查和打包证据。

- [ ] **Step 1: 扫描生产 UI 中剩余英文文案**

```bash
rg -n '>[A-Za-z][^<{]*<|"[A-Z][A-Za-z ]{3,}"' src/App.tsx src/components src/gesture/config.ts electron/gestureTraceExporter.ts
```

逐项检查命中；允许内部枚举、测试描述、文件名和代码标识符，修正任何实际渲染的英文文本或 aria 文本。

- [ ] **Step 2: 运行完整测试套件**

Run: `npm test`

Expected: PASS，所有单元、组件、识别回放和 Electron 测试均通过。

- [ ] **Step 3: 运行构建与类型检查**

Run: `npm run build && npm run electron:typecheck`

Expected: 两条命令均以退出码 0 完成。

- [ ] **Step 4: 打包 macOS arm64 应用**

Run: `npm run electron:make`

Expected: 生成 `out/hand-gesture-control-darwin-arm64/hand-gesture-control.app` 和对应 ZIP，且退出码为 0。

- [ ] **Step 5: 启动打包应用并视觉验收**

关闭仅与本项目关联的旧打包进程，执行：

```bash
open -a "/Users/hht/Desktop/手势控制/out/hand-gesture-control-darwin-arm64/hand-gesture-control.app"
```

在桌面窗口确认标题、摄像头状态、桌面控制、校准、游乐场和诊断区域均显示中文；不因验收启用系统控制或执行手势操作。

- [ ] **Step 6: 进行最终提交**

```bash
git add docs/superpowers/plans/2026-08-04-complete-chinese-interface.md
git commit -m "docs: plan complete Chinese interface"
```

## Plan Self-Review

1. Spec coverage: Task 1 覆盖全部动态状态映射；Task 2 覆盖所有 React 可见区域、错误、辅助标签和设置；Task 3 覆盖 macOS 保存对话框；Task 4 覆盖英文残留检查、完整回归、打包和视觉启动验收。内部英文协议、trace JSON 和文件名由全局约束及 Task 3 保持不变。
2. Placeholder scan: 本计划不含未定义的后续实现、模糊测试指令或待补内容；每项代码改动都给出文件、接口、测试命令和目标行为。
3. Type consistency: 所有动态 UI 都使用 Task 1 定义的 `gestureStateLabel`、`gesturePhaseLabel`、`gestureKindLabel`；参数类型与 `src/gesture/types.ts` 的联合类型一致。

