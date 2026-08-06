# Hovra

基于普通摄像头的本机手势控制应用。当前启用光标移动、拇指与食指短捏合左键、保持食指捏合长按、拇指与中指短捏合右键、食指与中指伸直后上下移动手掌滚动，以及张开手掌停止。识别全部在本机完成，不上传摄像头画面。

## Commands

- `npm run dev` starts the Vite development server.
- `npm run build` type-checks and creates a production build.
- `npm run electron:typecheck` type-checks the Electron main/preload/config sources.
- `npm run electron:make` creates the local macOS package.
- `npm test` runs the test suite.
- `npm run test:gesture-regression` 只运行手势轨迹自动回归。

## 手势轨迹自动回归

运行以下命令，可以把固定的隐私安全关节点轨迹重新送入当前真实识别引擎：

```bash
npm run test:gesture-regression
```

回归矩阵覆盖左右键短捏合、双指滚动、长按、张掌停止、握拳、纵深分离、多指含糊和普通移动。失败表示动作发生了漏识别、重复、延迟超出允许时间窗或意外误触。轨迹只包含合成的 21 点手部关节点，不包含摄像头图片、视频、音频或个人信息。这两组回归测试也会由 `npm test` 和 GitHub CI 自动执行。

## Run locally

Install dependencies, then start the development server:

```bash
npm install
npm run dev
```

Open the localhost URL printed by Vite in a current desktop browser. This demo is
browser-only: camera processing stays on the device and no video frames are
uploaded.

## macOS desktop verification

Use this checklist on an Apple silicon Mac with a camera before accepting the
Electron package. Acceptance must use the exact packaged application at
`out/Hovra-darwin-arm64/Hovra.app`, not the Vite
browser page or `electron:dev`. Do not enable system control until you are ready
to test the physical pointer.

This locally produced app is unsigned for distribution (there is no Developer ID
identity; macOS may still show an ad-hoc linker signature) and non-notarized. It
is intended only for local verification, not distribution. Do not disable
Gatekeeper system-wide; if macOS blocks the first launch, use Finder's normal
**Open** confirmation for this specific app.

1. Install dependencies:

   ```bash
   npm install
   ```

2. Build and package the exact acceptance artifact:

   ```bash
   npm run electron:typecheck
   npm run electron:make
   ```

3. In Finder, open
   `out/Hovra-darwin-arm64/Hovra.app`. Confirm the
   running process is this packaged copy before granting any permission.
4. When the app shows **Permission required**, click **Open Accessibility
   Settings**. In **System Settings → Privacy & Security → Accessibility**, add
   or enable that exact packaged `.app`. Return to the app and confirm its status
   changes from **Permission required** to **Paused**.
5. Click **Enable system control**, then verify a tracked index finger moves the
   system pointer, a thumb-index short pinch produces exactly one left click, a
   thumb-middle short pinch produces exactly one right click, holding index and
   middle fingers straight then moving the palm vertically scrolls without moving
   the pointer, and an open palm stops movement.
6. Confirm clicking, opening the palm and temporarily removing the hand do not
   turn off the system-control switch. Only the user pause button or an application
   lifecycle safety event may deactivate it. No disabled double-click action may
   be emitted.

## Manual verification checklist

After starting the demo locally, perform these acceptance checks:

- [ ] Grant camera access.
- [ ] Confirm the camera preview and keypoints are mirrored.
- [ ] Move the index finger and observe the cursor move.
- [ ] Perform a short pinch on the target and observe exactly one click.
- [ ] Perform a thumb-middle short pinch on the target and observe exactly one right click.
- [ ] Extend the index and middle fingers, curl the other two fingers, and confirm vertical palm movement scrolls while the pointer stays fixed.
- [ ] Confirm the click target can be operated throughout the current viewport and remains visible after resizing.
- [ ] Open the palm and confirm the cursor no longer moves.
- [ ] Remove the hand and confirm the status changes to `lost`.
- [ ] Reload the page, deny camera access, and confirm guidance appears.

### Device-specific verification notes

Camera permission, a connected camera, and a browser that supports `getUserMedia`
are required for the interactive checks. If a physical camera or permission prompt
is unavailable in the test environment, perform these steps on a local desktop
browser before accepting the demo.

## 稳定内核正式验收

实时控制只使用同一 MediaPipe 帧中的归一化关键点。Apple Vision、世界坐标、概率投票和个人点击校准均不参与实时判定。诊断轨迹包含手部关键点和派生数值，但不包含图片或视频。

固定验收指标：

- [ ] 至少 200 次真实捏合，覆盖正面、侧面、斜面，近/中/远距离和两种光照；召回率不低于 98%。
- [ ] 连续 30 分钟负样本，覆盖二维重合但空间分离、握拳、张手、快速经过和手部进出画面；误触不超过 1 次，目标为 0。
- [ ] 每次完整捏合只产生一次点击，重复点击为 0。
- [ ] 接触到点击的 P95 延迟不超过 90 毫秒。
- [ ] 诊断面板有效帧率不低于 30 帧/秒，`detectForVideo` 推理耗时 P95 不超过 12 毫秒。
- [ ] 世界坐标短暂抖动或缺失不影响点击；同一 MediaPipe 帧中画面重合但归一化纵深分离时不得点击。

如果有效帧率低于 30 或推理 P95 超过 12 毫秒，先停止调整识别阈值，建立独立 Worker 性能计划；不得通过放宽防误触条件掩盖性能问题。

## 个人稳定性测试

应用内的“稳定性测试”用于在正式长时间验收前快速发现个人手型、摄像头角度和光照造成的问题，完整流程约 4 分钟。

1. 确认摄像头已启用且追踪器检测到一只手，点击“开始稳定性测试”。程序会立即暂停系统鼠标；测试完成后也不会自动重新开启。
2. 准备检查期间将完整手掌放入画面。若显示手掌不完整、纵深数据不稳定、距离不合适或帧率不足，计时会自动暂停，调整后继续。
3. 按图完成正面、左右侧向、近距离和远距离各 4 次捏合。每次严格跟随“分开—捏合—轻触保持—松开”的节拍。
4. 继续完成投影重合但不接触、握拳、张掌和快速移动四组抗误触动作。
5. 结果页会显示召回率、误触、重复点击、P95 响应、帧率和推理耗时。只有样本覆盖完整、正负边界清晰且没有误触时，“应用推荐设置”才可用。
6. 应用后可点击“恢复测试前设置”；是否重新开启系统控制始终由用户决定。桌面版还可保存本地 JSON 测试报告。

测试只记录骨骼派生数值、识别事件和步骤标签，不保存摄像头图片或视频。短测默认目标为召回率至少 90%、误触和重复点击均为 0、P95 响应不超过 150 毫秒、有效帧率至少 24 帧/秒；它不能替代上方的正式长期验收。

## Microsoft Edge calibration record

Run this checklist in a current desktop version of Microsoft Edge with the
control-parameter panel expanded. Adjust one setting at a time and record the final
values and observations from the same camera session.

- [ ] Movement: move the index finger throughout the viewport; note cursor responsiveness, stability and any jitter.
- [ ] Click: perform at least five short pinches on the target; note missed clicks or duplicate clicks.
- [ ] Pause: open the palm while moving; note whether cursor movement pauses promptly and resumes cleanly.

Record the Edge test result before accepting tuned defaults:

- Date / Edge version / operating system: `________________`
- Camera and lighting: `________________`
- Stable click kernel: `enabled`
- Final cursor smoothing factor: `________` (default `0.40`)
- Movement observations: `________________`
- Click observations: `________________`
- Pause observations: `________________`
