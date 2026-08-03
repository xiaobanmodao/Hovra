# 全局手势控制与圆形光标 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让启用后的手势控制跨应用持续工作，并用鼠标穿透的圆形覆盖层指示系统光标位置。

**Architecture:** Electron 主进程维护一个无焦点、透明置顶的覆盖窗口，并让鼠标控制 IPC 在移动与拖动时同步更新该窗口。控制会话不再由主窗口失焦或页面 `blur` 关闭；只有用户明确暂停及已定义的不可恢复安全事件会停止会话并隐藏覆盖层。

**Tech Stack:** Electron Forge、Electron BrowserWindow/preload IPC、React/TypeScript、Vitest、@jitsi/robotjs。

## Global Constraints

- 覆盖窗口必须 `transparent`、`alwaysOnTop`、`focusable: false`，并通过 `setIgnoreMouseEvents(true)` 鼠标穿透。
- 覆盖窗口只加载本地、受限的 renderer；不得开放 Node 集成或任意 IPC。
- 仅明确点击“Pause system control”、手势暂停/丢失、摄像头失效、渲染器生命周期失败或退出应用可以停止控制。
- 移动和拖动都必须在主显示器实际坐标更新圆形覆盖层；无效坐标隐藏覆盖圆。

---

### Task 1: 覆盖层窗口与固定 IPC 协议

**Files:**
- Modify: `forge.config.ts`
- Modify: `electron/main.ts`
- Modify: `electron/main.test.ts`
- Create: `electron/overlayPreload.ts`
- Create: `src/overlay.ts`
- Create: `src/overlay.css`

**Interfaces:**
- Produces: `createCursorOverlay(): BrowserWindow` 和 `setCursorOverlayState(state: CursorOverlayState): void`。
- Produces: 固定主进程到覆盖层通道 `gesture:overlay-state`，payload 为 `{ x: number; y: number; visible: boolean; state: "tracking" | "pinching" | "dragging" }`。

- [ ] **Step 1: Write the failing test**

在 `electron/main.test.ts` 增加断言：主窗口启动时会创建第二个窗口；第二个窗口具有 `transparent: true`、`frame: false`、`alwaysOnTop: true`、`focusable: false`、安全 webPreferences，并调用 `setIgnoreMouseEvents(true)`。

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run electron/main.test.ts`
Expected: FAIL，因为当前仅创建一个 BrowserWindow。

- [ ] **Step 3: Write minimal implementation**

为 Forge Vite 增加 `cursor_overlay` renderer。新增最小 preload 和 renderer：监听唯一固定 IPC 消息，并把圆形元素以 `translate3d(x, y, 0)` 置于屏幕像素位置；隐藏时不显示。主进程创建并保存覆盖窗口，载入开发 URL 或打包的本地 `cursor_overlay/index.html`，设置鼠标穿透和不可聚焦。

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run electron/main.test.ts`
Expected: PASS，覆盖层窗口配置被验证。

- [ ] **Step 5: Commit**

```bash
git add forge.config.ts electron/main.ts electron/main.test.ts electron/overlayPreload.ts src/overlay.ts src/overlay.css
git commit -m "feat: add non-interactive cursor overlay"
```

### Task 2: 将系统坐标同步至圆形覆盖层

**Files:**
- Modify: `electron/mouseController.ts`
- Modify: `electron/mouseController.test.ts`
- Modify: `electron/main.ts`
- Modify: `electron/main.test.ts`

**Interfaces:**
- Consumes: `setCursorOverlayState`。
- Produces: `MouseControllerDependencies.overlay?: { show(x: number, y: number, state: "tracking" | "dragging"): void; hide(): void }`。

- [ ] **Step 1: Write the failing test**

在 `electron/mouseController.test.ts` 中注入 `overlay` mock，断言成功 `move(320, 80)` 调用 `overlay.show(320, 80, "tracking")`，成功 `drag(320, 80)` 调用 `overlay.show(320, 80, "dragging")`，`releaseAndPause()` 调用 `overlay.hide()`；无效或非活动动作不调用 overlay。

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run electron/mouseController.test.ts`
Expected: FAIL，因为依赖接口尚不存在。

- [ ] **Step 3: Write minimal implementation**

扩展控制器依赖，且只在真实鼠标操作获准时更新覆盖层。主进程向控制器提供对应的 show/hide 回调，坐标继续由既有 normalized payload 映射到主显示器后传入；生命周期暂停统一调用 hide。

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run electron/mouseController.test.ts electron/main.test.ts`
Expected: PASS，移动、拖动及暂停行为均同步。

- [ ] **Step 5: Commit**

```bash
git add electron/mouseController.ts electron/mouseController.test.ts electron/main.ts electron/main.test.ts
git commit -m "feat: sync system pointer with cursor overlay"
```

### Task 3: 跨应用持久会话和显式暂停

**Files:**
- Modify: `electron/main.ts`
- Modify: `electron/main.test.ts`
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`

**Interfaces:**
- Consumes: 已有 `gesture:release-and-pause` 和 `gesture:safety-pause`。
- Produces: 焦点变更不会调用 `pauseForLifecycle`；渲染器失效、退出、显式暂停继续安全释放。

- [ ] **Step 1: Write the failing test**

在主进程测试中先激活会话并按下鼠标，触发主窗口 `blur`，断言未调用 `release` 且控制器仍活动；在 App 测试中触发浏览器 `blur`，断言不会调用 `releaseAndPause`，随后模拟 click 并断言会话仍启用。保留已有 lost/open-palm/stale-frame 安全暂停断言。

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run electron/main.test.ts src/App.test.tsx`
Expected: FAIL，因为当前两个 blur 监听器会暂停会话。

- [ ] **Step 3: Write minimal implementation**

删除主窗口 `blur` 的暂停回调和 App 的 `window.blur` 监听；保持主窗口销毁、渲染器导航/崩溃、应用退出及 `gesture:safety-pause` 的释放路径。更新界面文案，明确暂停仅由用户按钮或安全事件触发。

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run electron/main.test.ts src/App.test.tsx`
Expected: PASS，跨应用点击不会关闭会话，安全事件仍会关闭。

- [ ] **Step 5: Commit**

```bash
git add electron/main.ts electron/main.test.ts src/App.tsx src/App.test.tsx src/components/SystemControlPanel.tsx
git commit -m "feat: keep gesture control active across apps"
```

### Task 4: 完整验证与打包

**Files:**
- Modify: `README.md`

**Interfaces:**
- Documents: 跨应用控制、圆形指示器和显式暂停流程。

- [ ] **Step 1: Write the failing documentation checklist**

在 README 验收清单增加：切换到另一应用后圆形仍跟随、短捏合后状态仍为 Enabled、显式暂停后圆形消失。

- [ ] **Step 2: Run verification before packaging**

Run: `npm test && npm run electron:typecheck && git diff --check`
Expected: PASS，所有测试、类型检查和 diff 格式检查通过。

- [ ] **Step 3: Build distributable**

Run: `npm run electron:make`
Expected: PASS，并生成 darwin/arm64 zip。

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: explain global gesture control"
```

