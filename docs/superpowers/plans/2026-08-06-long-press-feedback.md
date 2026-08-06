# 长按进度环与按下反馈 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 用户已授权常规确认采用推荐项；本计划由当前会话顺序执行，不启用子智能体。

**Goal:** 让网页虚拟光标和 Electron 桌面圆形光标同步显示与真实 420ms 长按判定完全对齐的进度环和已按下状态。

**Architecture:** `PinchClickStateMachine` 生成单一真值源 `holdProgress`，`GestureEngine` 将其透传为 `GestureOutput.longPressProgress`。React 通过 CSS 变量绘制页面光标，并在已有 `gesture:move` IPC 载荷中传输同一个 0–1 数值；Electron 主进程重新校验后用锥形渐变绘制 40×40 覆盖层进度环。

**Tech Stack:** TypeScript、Vitest、React、Testing Library、Electron IPC、CSS conic-gradient。

## Global Constraints

- 进度必须由已有 `gestureStartedAtMs` 和 `longPressMs = 420` 计算，不新增渲染器计时器。
- 进度只能是 0–1 的有限数，preload 和主进程 IPC 边界都必须校验。
- `dragStart` 帧和系统按钮保持按下期间的进度必须为 1。
- 丢手、异常关节、阻断、张掌、握拳和非长按释放必须把进度归零。
- 不改变光标热点、`CURSOR_OVERLAY_SIZE = 40`、点透传和原生光标隐藏逻辑。
- 不新增 IPC 通道、不新增依赖、不恢复右键、双击或滚动。

---

### Task 1: 状态机进度和 GestureEngine 契约

**Files:**
- Modify: `src/gesture/pinchClickStateMachine.ts`
- Modify: `src/gesture/pinchClickStateMachine.test.ts`
- Modify: `src/gesture/types.ts`
- Modify: `src/gesture/gestureEngine.ts`
- Modify: `src/gesture/gestureEngine.test.ts`
- Modify fixtures containing handwritten `GestureOutput`: `src/App.tsx`, `src/components/GestureDiagnostics.test.tsx`, `src/components/Playground.test.tsx`, `src/gesture/stabilityTest.test.ts`

**Interfaces:**
- Produces: `PinchClickOutput.holdProgress: number`.
- Produces: `GestureOutput.longPressProgress: number`.
- Values: contact uses elapsed/threshold; holding and long-hold releasing use 1; every unsafe or non-hold path uses 0.

- [ ] **Step 1: Write the failing state-machine progress test**

Add to `src/gesture/pinchClickStateMachine.test.ts`:

```ts
it("长按进度使用真实时间并在按下帧精确到 1", () => {
  const machine = new PinchClickStateMachine({ longPressMs: 420 });
  machine.update(separated(), 0);
  expect(machine.update(contact(), 16).holdProgress).toBe(0);
  machine.update(contact(), 32);
  machine.update(contact(), 132);
  expect(machine.update(contact(), 226).holdProgress).toBeCloseTo(0.5, 6);
  machine.update(contact(), 332);
  expect(machine.update(contact(), 435).holdProgress).toBeCloseTo(419 / 420, 6);
  expect(machine.update(contact(), 436)).toMatchObject({
    holdStarted: true,
    holding: true,
    holdProgress: 1,
  });
  expect(machine.update(separated(), 452).holdProgress).toBe(1);
  expect(machine.update(separated(), 468)).toMatchObject({ holdEnded: true, holdProgress: 0 });
});
```

Add a short-click reset assertion:

```ts
it("非长按释放和阻断立即清空进度", () => {
  const release = new PinchClickStateMachine();
  release.update(separated(), 0);
  release.update(contact(), 16);
  release.update(contact(), 32);
  expect(release.update(separated(), 48).holdProgress).toBe(0);

  const blocked = new PinchClickStateMachine();
  blocked.update(separated(), 0);
  blocked.update(contact(), 16);
  expect(blocked.update({ ...contact(), suppressed: true }, 32).holdProgress).toBe(0);

  const interrupted = new PinchClickStateMachine({ longPressMs: 150, maxFrameGapMs: 250 });
  interrupted.update(separated(), 0);
  interrupted.update(contact(), 16);
  interrupted.update(contact(), 32);
  interrupted.update(contact(), 116);
  expect(interrupted.update(contact(), 166).holdProgress).toBe(1);
  expect(interrupted.update(null, 182)).toMatchObject({ holdEnded: true, holdProgress: 0 });
});
```

- [ ] **Step 2: Run the state-machine test and verify RED**

Run: `npx vitest run src/gesture/pinchClickStateMachine.test.ts`

Expected: FAIL because `PinchClickOutput` has no `holdProgress`.

- [ ] **Step 3: Implement `PinchClickOutput.holdProgress`**

In `src/gesture/pinchClickStateMachine.ts`, extend the output type and `output()` parameter:

```ts
export type PinchClickOutput = {
  phase: GesturePhase;
  clicked: boolean;
  clickCursor: Landmark | null;
  active: boolean;
  contactFrames: number;
  requiredContactFrames: number;
  releaseFrames: number;
  cursorSpeed: number;
  blockingReason: ClickBlockingReason | null;
  holdStarted: boolean;
  holdEnded: boolean;
  holdCursor: Landmark | null;
  holding: boolean;
  holdProgress: number;
};

private output(
  clicked: boolean,
  clickCursor: Landmark | null,
  cursorSpeed: number,
  blockingReason: ClickBlockingReason | null,
  holdStarted = false,
  holdEnded = false,
  holdCursor: Landmark | null = null,
  holdProgress = 0,
): PinchClickOutput {
  return {
    phase: this.phase,
    clicked,
    clickCursor,
    active: this.phase === "active" || this.phase === "dragging" || this.phase === "releasing",
    contactFrames: this.contactFrames,
    requiredContactFrames: this.config.requiredContactFrames,
    releaseFrames: this.releaseFrames,
    cursorSpeed,
    blockingReason,
    holdStarted,
    holdEnded,
    holdCursor,
    holding: this.holding,
    holdProgress: clamp01(holdProgress),
  };
}
```

Use the following helper and pass its result only from the contact path:

```ts
private measureHoldProgress(nowMs: number): number {
  if (this.holding) return 1;
  if (this.gestureStartedAtMs === null) return 0;
  return clamp01((nowMs - this.gestureStartedAtMs) / this.config.longPressMs);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}
```

Required call-site rules:

```ts
// holding + contact or holding + first release frame
return this.output(false, null, cursorSpeed, blockingReason, false, false, null, 1);

// threshold crossing
return this.output(false, null, cursorSpeed, null, true, false, holdCursor, 1);

// candidate/active contact before threshold
return this.output(
  false, null, cursorSpeed,
  evidence.blockingReason === "none" ? null : evidence.blockingReason,
  false, false, null, this.measureHoldProgress(nowMs),
);
```

Every other existing `output()` call relies on the default 0. When a held release completes or tracking is interrupted, `holdEnded` remains unchanged and progress is 0.

- [ ] **Step 4: Verify state-machine GREEN**

Run: `npx vitest run src/gesture/pinchClickStateMachine.test.ts`

Expected: all state-machine tests pass, including exact 0.5, 419/420, 1 and reset cases.

- [ ] **Step 5: Write the failing GestureEngine propagation test**

In `src/gesture/gestureEngine.test.ts`, extend the existing long-press test:

```ts
expect(engine.update(left, 232).longPressProgress).toBeCloseTo(216 / 420, 6);
expect(engine.update(left, 435).longPressProgress).toBeCloseTo(419 / 420, 6);
expect(engine.update(left, 436)).toMatchObject({
  state: "dragging",
  dragStart: true,
  longPressProgress: 1,
});
expect(engine.update(null, 452)).toMatchObject({
  dragEnd: true,
  longPressProgress: 0,
});
```

- [ ] **Step 6: Run the engine test and verify RED**

Run: `npx vitest run src/gesture/gestureEngine.test.ts`

Expected: FAIL because `GestureOutput.longPressProgress` is missing.

- [ ] **Step 7: Propagate progress through `GestureEngine` and all fixtures**

Add the required field to `GestureOutput` in `src/gesture/types.ts`:

```ts
longPressProgress: number;
```

Add `longPressProgress` to the private `output()` input in `GestureEngine`, and supply it in all three paths:

```ts
// updateValidHand
longPressProgress: pinch.holdProgress,

// updateUnsafeHand and updateMissingHand
longPressProgress: 0,
```

Use `longPressProgress: 0` in `INITIAL_OUTPUT` and handwritten test fixtures. Do not replace the existing `confirmationProgress` field.

- [ ] **Step 8: Verify engine GREEN and commit Task 1**

Run: `npx vitest run src/gesture/pinchClickStateMachine.test.ts src/gesture/gestureEngine.test.ts src/gesture/gestureEngine.replay.test.ts`

Expected: all selected tests pass.

Commit:

```bash
git add src/gesture/pinchClickStateMachine.ts src/gesture/pinchClickStateMachine.test.ts \
  src/gesture/types.ts src/gesture/gestureEngine.ts src/gesture/gestureEngine.test.ts \
  src/App.tsx src/components/GestureDiagnostics.test.tsx src/components/Playground.test.tsx \
  src/gesture/stabilityTest.test.ts
git commit -m "feat: expose native long press progress"
```

### Task 2: React 光标和安全 preload 传输

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Modify: `src/styles.css`
- Modify: `src/electron.d.ts`
- Modify: `electron/preload.ts`
- Modify: `electron/preload.test.ts`

**Interfaces:**
- Consumes: `GestureOutput.longPressProgress` from Task 1.
- Produces: `GestureDesktopApi.move(x, y, state?, longPressProgress?)`.
- Produces IPC payload: `{ x, y, state, longPressProgress }` for `gesture:move`.

- [ ] **Step 1: Write failing React and desktop-bridge tests**

In `src/App.test.tsx`, update the basic move expectation and add a progress test:

```ts
await waitFor(() => expect(bridge.move).toHaveBeenCalledWith(
  expect.any(Number), expect.any(Number), "tracking", 0,
));

it("网页与桌面光标使用同一长按进度", async () => {
  const { bridge, runFrame, container } = await renderDesktopApp();
  runFrame(16, handAt("left"));
  runFrame(32, handAt("left"));
  runFrame(132, handAt("left"));
  runFrame(232, handAt("left"));

  const progress = 216 / 420;
  const cursor = container.querySelector<HTMLElement>(".virtual-cursor")!;
  expect(Number(cursor.style.getPropertyValue("--long-press-progress")))
    .toBeCloseTo(progress, 6);
  await waitFor(() => expect(bridge.move).toHaveBeenCalled());
  const [, , state, desktopProgress] = vi.mocked(bridge.move).mock.calls.at(-1)!;
  expect(state).toBe("left-pinching");
  expect(desktopProgress).toBeCloseTo(progress, 6);
});
```

In `electron/preload.test.ts`, change `ExposedApi.move` to accept progress, call `api.move(0.25, 0.75, "candidate-left", 0.5)`, and expect:

```ts
["gesture:move", {
  x: 0.25,
  y: 0.75,
  state: "candidate-left",
  longPressProgress: 0.5,
}]
```

Add invalid progress coverage:

```ts
it.each([Number.NaN, Number.POSITIVE_INFINITY, -0.01, 1.01])(
  "rejects invalid long press progress %s before IPC",
  async (progress) => {
    const api = getExposedApi();
    await expect(api.move(0.5, 0.5, "left-pinching", progress))
      .rejects.toThrow("long press progress");
    expect(electronMocks.invoke).not.toHaveBeenCalled();
  },
);
```

- [ ] **Step 2: Run tests and verify RED**

Run: `npx vitest run src/App.test.tsx electron/preload.test.ts`

Expected: FAIL because the CSS variable and fourth move argument do not exist.

- [ ] **Step 3: Render the web progress ring**

Import `type CSSProperties` in `src/App.tsx`, then set the custom property without moving the hotspot:

```tsx
style={{
  left: cursor.x,
  top: cursor.y,
  pointerEvents: "none",
  "--long-press-progress": output.longPressProgress,
} as CSSProperties}
```

Add to `src/styles.css`:

```css
.virtual-cursor::before {
  content: "";
  position: absolute;
  inset: -0.48rem;
  border-radius: 50%;
  background: conic-gradient(
    #ffcc66 calc(var(--long-press-progress, 0) * 1turn),
    transparent 0
  );
  -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 3px), #000 0);
  mask: radial-gradient(farthest-side, transparent calc(100% - 3px), #000 0);
  opacity: var(--long-press-progress, 0);
}

.virtual-cursor.is-dragging::before { opacity: 1; }

.virtual-cursor.is-dragging {
  background: #ffcc66;
  box-shadow: 0 0 0 4px rgba(255, 204, 102, 0.3), 0 0 1.4rem #ff9900;
}
```

The second rule replaces the existing translucent dragging center with the specified solid amber pressed state; it does not change size or transform.

- [ ] **Step 4: Add and validate the preload progress argument**

In `src/electron.d.ts`, retain the existing inline state union and append the fourth argument:

```ts
move(
  x: number,
  y: number,
  state?: "tracking" | "left-pinching" | "right-pinching" | "double-pinching"
    | "dragging" | "scrolling" | "candidate-left" | "candidate-right"
    | "candidate-double" | "candidate-scroll" | "releasing-left"
    | "releasing-right" | "releasing-double" | "releasing-scroll",
  longPressProgress?: number,
): Promise<void>;
```

The `electron/preload.ts` signature uses its existing local `CursorOverlayState` alias.

Update the renderer call in every `desktopBridge.move(...)` branch to pass `output.longPressProgress`.

In `electron/preload.ts`:

```ts
move: (
  x: number,
  y: number,
  state: CursorOverlayState = "tracking",
  longPressProgress = 0,
): Promise<void> => invokeNormalizedMovement(
  channels.move, x, y, state, longPressProgress,
),
```

Validate and build the movement payload:

```ts
if (
  channel === channels.move
  && (!Number.isFinite(longPressProgress)
    || longPressProgress < 0
    || longPressProgress > 1)
) {
  return Promise.reject(new TypeError("Mouse movement requires long press progress from 0 to 1"));
}

return ipcRenderer.invoke(channel, channel === channels.move
  ? { x, y, state, longPressProgress }
  : { x, y });
```

- [ ] **Step 5: Verify Task 2 GREEN and commit**

Run: `npx vitest run src/App.test.tsx electron/preload.test.ts`

Expected: React and preload tests pass.

Commit:

```bash
git add src/App.tsx src/App.test.tsx src/styles.css src/electron.d.ts \
  electron/preload.ts electron/preload.test.ts
git commit -m "feat: render long press progress in cursor"
```

### Task 3: Electron 主进程校验与桌面进度环

**Files:**
- Modify: `electron/mouseController.ts`
- Modify: `electron/mouseController.test.ts`
- Modify: `electron/main.ts`
- Modify: `electron/main.test.ts`

**Interfaces:**
- Consumes IPC payload `{ x, y, state?: CursorOverlayState, longPressProgress?: number }`.
- Produces `MouseController.move(x, y, state?, longPressProgress?)`.
- Produces `overlay.show(x, y, state, longPressProgress)` and overlay postMessage `{ type, state, longPressProgress }`.

- [ ] **Step 1: Write failing controller and main-overlay tests**

In `electron/mouseController.test.ts`, extend the live visual test:

```ts
await controller.move(320, 240, "left-pinching", 0.5);
expect(deps.overlay.show).toHaveBeenCalledWith(320, 240, "left-pinching", 0.5);
```

Add IPC rejection using the registered `gesture:move` handler:

```ts
await moveHandler(trustedEvent, {
  x: 0.5,
  y: 0.5,
  state: "left-pinching",
  longPressProgress: 1.01,
});
expect(controller.move).not.toHaveBeenCalled();
```

In `electron/main.test.ts`, require the overlay document and message to carry progress:

```ts
expect(overlayDocument).toContain("conic-gradient");
expect(overlayDocument).toContain("--long-press-progress");

mainMocks.controllerDependencies?.overlay?.show(600, 400, "left-pinching", 0.5);
expect(overlay.webContents.executeJavaScript).toHaveBeenCalledWith(
  expect.stringContaining("\"longPressProgress\":0.5"),
);
```

- [ ] **Step 2: Run tests and verify RED**

Run: `npx vitest run electron/mouseController.test.ts electron/main.test.ts`

Expected: FAIL because controller/main signatures and overlay CSS have no progress.

- [ ] **Step 3: Validate progress at the main-process IPC boundary**

Extend `MouseControllerDependencies.overlay.show` and `MouseController.move` with `longPressProgress: number`.

Update the payload guard:

```ts
function isNormalizedMovePayload(
  payload: unknown,
): payload is {
  x: number;
  y: number;
  state?: CursorOverlayState;
  longPressProgress?: number;
} {
  if (typeof payload !== "object" || payload === null) return false;
  const candidate = payload as {
    x?: unknown;
    y?: unknown;
    state?: unknown;
    longPressProgress?: unknown;
  };
  return typeof candidate.x === "number"
    && Number.isFinite(candidate.x)
    && candidate.x >= 0
    && candidate.x <= 1
    && typeof candidate.y === "number"
    && Number.isFinite(candidate.y)
    && candidate.y >= 0
    && candidate.y <= 1
    && (candidate.state === undefined || isCursorOverlayState(candidate.state))
    && (candidate.longPressProgress === undefined || (
      typeof candidate.longPressProgress === "number"
      && Number.isFinite(candidate.longPressProgress)
      && candidate.longPressProgress >= 0
      && candidate.longPressProgress <= 1
    ));
}
```

Forward `payload.longPressProgress ?? 0` from `registerMouseControllerIpc()`. In `createMouseController()` reject invalid direct-call progress together with invalid x/y/state, and call:

```ts
deps.overlay?.show(x, y, state, longPressProgress);
```

The drag path must use:

```ts
deps.overlay?.show(x, y, "dragging", 1);
```

- [ ] **Step 4: Render progress in the transparent overlay**

Change `setCursorOverlayState` to accept a fourth parameter defaulting to 0, reject non-finite/out-of-range values, and include it in the existing JSON-serialized postMessage.

Add to the data-URL CSS:

```css
.cursor{--long-press-progress:0}
.cursor::before{
  content:"";position:absolute;inset:-5px;border-radius:50%;
  background:conic-gradient(#ffcc66 calc(var(--long-press-progress)*1turn),transparent 0);
  -webkit-mask:radial-gradient(farthest-side,transparent calc(100% - 3px),#000 0);
  mask:radial-gradient(farthest-side,transparent calc(100% - 3px),#000 0);
  opacity:var(--long-press-progress)
}
.cursor.dragging::before{opacity:1}
.cursor.dragging{background:#ffcc66;box-shadow:0 0 0 4px rgba(255,204,102,.3),0 0 14px #ff9900}
```

In the message listener:

```js
if (Number.isFinite(data.longPressProgress)) {
  cursor.style.setProperty('--long-press-progress', String(data.longPressProgress));
}
```

Do not change `.cursor` left/top/width/height or `cursorOverlayBounds()`.

- [ ] **Step 5: Verify Task 3 GREEN and commit**

Run: `npx vitest run electron/mouseController.test.ts electron/main.test.ts electron/overlayCoordinates.test.ts`

Expected: controller, IPC, overlay document, messages and coordinate alignment all pass.

Commit:

```bash
git add electron/mouseController.ts electron/mouseController.test.ts electron/main.ts electron/main.test.ts
git commit -m "feat: show long press progress in desktop overlay"
```

### Task 4: 完整验证、重启与集成

**Files:**
- Modify only files required by observed verification failures.

**Interfaces:**
- Consumes Tasks 1–3.
- Produces a verified long-press feedback feature on `main` and GitHub.

- [ ] **Step 1: Run full Vitest**

Run: `npm test`

Expected: every test file passes with 0 failures.

- [ ] **Step 2: Run Electron typecheck**

Run: `npm run electron:typecheck`

Expected: exit code 0.

- [ ] **Step 3: Run production build**

Run: `npm run build`

Expected: TypeScript and Vite exit code 0.

- [ ] **Step 4: Inspect patch and restart Electron**

Run: `git diff --check && git status --short`

Expected: no whitespace errors and only this feature's files. Restart the existing Electron session with `rs`; if absent, run `npm run electron:dev`. Confirm the renderer starts without an application error; MediaPipe informational warnings are not startup failures.

- [ ] **Step 5: Finish the feature branch using the pre-authorized recommended path**

Run the full test suite once more on the merged `main`, delete the merged feature branch with `git branch -d codex/long-press-feedback`, then push without force:

```bash
git push origin main
```

Expected: GitHub `main` advances to the verified feature commit.
