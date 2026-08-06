# 长按进度环与按下反馈设计

## 目标

在不改变现有点击与长按判定的前提下，让网页虚拟光标和 Electron 系统覆盖光标同步显示真实的长按进度和已按下状态。用户应在 420ms 阈值到达前看到连续进度，并在系统实际发出 `mouseDown` 的同一帧看到 100% 反馈。

## 方案选择

### 采用：状态机驱动的连续进度

`PinchClickStateMachine` 使用已有的 `gestureStartedAtMs` 和 `longPressMs` 输出 0–1 的 `holdProgress`。`GestureEngine` 将其暴露为 `GestureOutput.longPressProgress`。React 页面直接用该值绘制虚拟光标，同时通过已有 `gesture:move` IPC 载荷传给桌面覆盖层。

该方案与真实长按判定共用单一时间源，不会因 CSS 计时、帧率或 IPC 延迟与 `mouseDown` 错位。

### 不采用：覆盖层本地 CSS 计时

本地动画代码较少，但跟踪缺失、阻断和阈值配置会使视觉计时与识别状态分叉。

### 不采用：离散进度状态

将进度编码成 25%/50%/75% 等状态可避免数值载荷，但动画会跳变，也会扩大前端、preload 和主进程的状态联合类型。

## 状态机契约

`PinchClickOutput` 新增必填 `holdProgress: number`：

- 无候选、非长按释放、冷却、阻断或跟踪中断为 `0`。
- 指尖连续接触时为 `clamp((nowMs - gestureStartedAtMs) / longPressMs, 0, 1)`。
- 候选首帧为 `0`；候选和活动阶段随真实时间连续增长。
- 进入 `dragging` 的同一帧必须为 `1`；按钮保持按下时继续为 `1`。
- 长按后的释放确认帧在系统完成 `mouseUp` 前保持 `1`，用于稳定显示已按下状态。
- 短点按的释放确认帧立即归零，不伪装为已按下。

`GestureOutput.longPressProgress` 仅传递该值，不另行计时。张掌候选的 `confirmationProgress` 保持原义，与长按进度分离。

## 视觉表现

### 网页虚拟光标

`App` 继续使用现有 `.virtual-cursor`，通过 CSS 自定义属性 `--long-press-progress` 控制伪元素的锥形渐变环。进度为 0 时环透明；0–1 顺时针填充；`dragging` 时环完整显示，光标中心为实心琥珀色。光标中心和已校准热点不改变。

### Electron 桌面覆盖光标

40×40 透明窗口保持现有坐标与点透传设置。`.cursor::before` 在 28px 圆外绘制同样的进度环，且不超出窗口。`dragging` 使用完整琥珀环和实心填充。点击脉冲子元素保留，不与进度环共用动画。

## IPC 与安全

`GestureDesktopApi.move()` 新增第四个可选 `longPressProgress` 参数，默认为 0。preload 只接受 0–1 的有限数，并将其放入现有 `gesture:move` 载荷。主进程在 IPC 边界重复校验，非数值、非有限值或越界值整帧丢弃。不新增 IPC 通道，不允许渲染器传入 CSS 字符串或任意脚本。

`MouseController.move()` 把经校验的进度传给 `overlay.show()`。`drag()` 始终传递进度 1，因为它只能在系统按钮已按下时执行。

## 错误与中断处理

- 丢手、异常关节、高速移动、超限位移、张掌或握拳继续走现有安全中断路径，进度同帧归零。
- 长按已开始时，中断帧先产生 `dragEnd`；视觉反馈可在该帧归零，系统命令队列仍保证 `mouseUp`。
- 桌面覆盖层未加载完成时，保持现有忽略单次脚本更新并由下一手势帧重试的策略。

## 测试

1. 状态机测试手工校验 0ms、210ms、419ms、420ms 和释放/中断边界。
2. `GestureEngine` 测试确认进度透传且 `dragStart` 帧等于 1。
3. `App` 测试确认网页光标的 CSS 变量和桌面 `move` 的数值一致。
4. preload 和主进程 IPC 测试拒绝 `NaN`、无穷值、小于 0 和大于 1 的进度。
5. Electron 覆盖层测试确认进度环 CSS、数值消息和拖动时的 100% 进度。
6. 运行全量 Vitest、Electron TypeScript 检查和生产构建，并重启 Electron 开发实例。

## 范围边界

本阶段不改变 420ms 长按阈值，不更换光标热点和 40×40 覆盖窗口，不恢复右键、双击或滚动，不引入新依赖。
