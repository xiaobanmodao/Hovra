# 稳定手势内核重建实施计划

**目标：** 恢复并强化最初的低延迟单模型识别逻辑，实时功能仅保留移动、左键点击和张掌暂停。

**架构：** 新建独立的稳定几何提取器与有限状态机。`GestureEngine` 只编排同步 MediaPipe 关键点、输出兼容的 UI/桌面事件与诊断。Apple Vision、世界坐标、概率投票和个人校准退出实时路径。

**技术栈：** React、TypeScript、MediaPipe Hand Landmarker、Vitest、Electron Forge。

---

### 任务 1：用失败场景定义稳定内核契约

**文件：**
- 新建：`src/gesture/stableHandMetrics.test.ts`
- 新建：`src/gesture/stablePinchRecognizer.test.ts`
- 修改：`src/gesture/gestureEngine.test.ts`

1. 添加真实接触、纵深重叠、远近尺度变化、缺失/非法关键点的度量测试。
2. 添加两帧触发、持续按住不重复、两帧释放后重新武装、抖动和丢帧不误触测试。
3. 添加握拳、半握拳、单指伸出和真张掌的状态测试。
4. 运行这些测试并确认因尚未实现而失败。

### 任务 2：实现同步低延迟几何与状态机

**文件：**
- 新建：`src/gesture/stableHandMetrics.ts`
- 新建：`src/gesture/stablePinchRecognizer.ts`
- 修改：`src/gesture/config.ts`
- 修改：`src/gesture/types.ts`

1. 实现宽高比修正的画面距离、相对 `z`、空间距离和稳健掌部尺度。
2. 实现灵敏度到接触/释放阈值的有界映射。
3. 实现纵深重叠阻断、连续帧确认、滞回和一次性点击。
4. 实现严格张掌候选判定。
5. 运行新增测试直至通过。

### 任务 3：用稳定内核替换实时决策

**文件：**
- 修改：`src/gesture/gestureEngine.ts`
- 修改：`src/App.tsx`
- 修改：`src/vision/handLandmarker.ts`
- 修改：`src/App.test.tsx`
- 修改：`src/gesture/gestureEngine.replay.test.ts`

1. 保留 `GestureOutput` 对桌面控制层的兼容字段，但只产生移动、左击和暂停。
2. 从 `App` 删除 Apple Vision 调度、双骨骼状态和个人校准对引擎构造的影响。
3. 保证系统控制只由用户开关和生命周期安全事件改变，点击不关闭开关。
4. 验证每个新视频帧只进行一次同步识别，世界关键点不进入判定。

### 任务 4：精简界面并让诊断与实际内核一致

**文件：**
- 修改：`src/components/CalibrationPanel.tsx`
- 修改：`src/components/CalibrationPanel.test.tsx`
- 修改：`src/components/CameraStage.tsx`
- 修改：`src/components/CameraStage.test.tsx`
- 修改：`src/components/GestureDiagnostics.tsx`
- 修改：`src/components/GestureDiagnostics.test.tsx`
- 修改：`src/i18n/zh-CN.ts`

1. 移除个人点击校准向导入口与 Apple Vision 图例。
2. 显示稳定内核的画面/纵深/空间距离、阈值、确认进度和阻止原因。
3. 所有状态和阻止原因使用中文。
4. 保持光标偏移与平滑设置可用。

### 任务 5：移除默认运行时的 Apple Vision 成本

**文件：**
- 修改：`electron/main.ts`
- 修改：`electron/preload.ts`
- 修改：`src/electron.d.ts`
- 修改：`package.json`
- 修改相关测试。

1. 默认应用不创建原生手部客户端、不注册检测 IPC，也不在开发/打包前构建原生手部助手。
2. 保留不影响运行的历史诊断源码，便于未来离线研究，不参与当前包。
3. 验证渲染器 API 不再暴露 Apple Vision 调用。

### 任务 6：统一回归、打包和启动验证

**文件：**
- 按测试结果修正相关文件。

1. 运行定向测试、完整 `npm test`、Electron 类型检查和 Web 构建。
2. 运行 Electron make 与 macOS 签名/包结构验证。
3. 关闭旧版本的明确进程，启动新包，检查 MediaPipe 初始化、摄像头权限与无 Apple Vision 子进程。
4. 检查界面中文、单骨骼、简化校准区、诊断字段和系统控制默认关闭。
5. 记录自动验证覆盖范围；真实手势效果仍需摄像头实测，不用合成测试冒充实测结论。
