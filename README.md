# 手势控制

基于普通摄像头的本机手势控制应用。当前只启用光标移动、拇指与食指捏合左键点击、张开手掌停止。识别和个人校准全部在本机完成，不上传摄像头画面。

## Commands

- `npm run dev` starts the Vite development server.
- `npm run build` type-checks and creates a production build.
- `npm run electron:typecheck` type-checks the Electron main/preload/config sources.
- `npm run electron:make` creates the local macOS package.
- `npm test` runs the test suite.

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
`out/手势控制-darwin-arm64/手势控制.app`, not the Vite
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
   `out/hand-gesture-control-darwin-arm64/hand-gesture-control.app`. Confirm the
   running process is this packaged copy before granting any permission.
4. When the app shows **Permission required**, click **Open Accessibility
   Settings**. In **System Settings → Privacy & Security → Accessibility**, add
   or enable that exact packaged `.app`. Return to the app and confirm its status
   changes from **Permission required** to **Paused**.
5. Click **Enable system control**, then verify a tracked index finger moves the
   system pointer, a complete pinch-and-release produces exactly one left click,
   and an open palm stops movement.
6. Verify every safety pause: click **Pause system control**; open the palm; and
   remove the hand or stop the camera stream. No disabled right-click, double-click,
   drag, or scroll action may be emitted.

## Manual verification checklist

After starting the demo locally, perform these acceptance checks:

- [ ] Grant camera access.
- [ ] Confirm the camera preview and keypoints are mirrored.
- [ ] Move the index finger and observe the cursor move.
- [ ] Perform a short pinch on the target and observe exactly one click.
- [ ] Confirm the click target can be operated throughout the current viewport and remains visible after resizing.
- [ ] Open the palm and confirm the cursor no longer moves.
- [ ] Remove the hand and confirm the status changes to `lost`.
- [ ] Reload the page, deny camera access, and confirm guidance appears.

### Device-specific verification notes

Camera permission, a connected camera, and a browser that supports `getUserMedia`
are required for the interactive checks. If a physical camera or permission prompt
is unavailable in the test environment, perform these steps on a local desktop
browser before accepting the demo.

## 自适应捏合正式验收

先在校准面板运行一次“个人点击校准”：自然移动 3 秒，记录 5 次正面真实接触、5 次侧向或斜向真实接触、3 次画面重合但空间不接触。校准仅保存距离、质量和边界数值；诊断轨迹包含手部关键点和派生数值，但不包含图片或视频。

固定验收指标：

- [ ] 至少 200 次真实捏合，覆盖正面、侧面、斜面，近/中/远距离和两种光照；召回率不低于 98%。
- [ ] 连续 30 分钟负样本，覆盖二维重合但空间分离、握拳、张手、快速经过和手部进出画面；误触不超过 1 次，目标为 0。
- [ ] 每次完整捏合只产生一次点击，重复点击为 0。
- [ ] 接触到锁定的 P95 延迟不超过 100 毫秒。
- [ ] 诊断面板有效帧率不低于 30 帧/秒，`detectForVideo` 推理耗时 P95 不超过 12 毫秒。
- [ ] 世界坐标短暂抖动或缺失时，真实捏合仍可通过短窗口多证据投票；可靠世界深度分离时不得点击。

如果有效帧率低于 30 或推理 P95 超过 12 毫秒，先停止调整识别阈值，建立独立 Worker 性能计划；不得通过放宽防误触条件掩盖性能问题。

## Microsoft Edge calibration record

Run this checklist in a current desktop version of Microsoft Edge with the
calibration panel expanded. Adjust one setting at a time and record the final
values and observations from the same camera session.

- [ ] Movement: move the index finger throughout the viewport; note cursor responsiveness, stability and any jitter.
- [ ] Click: perform at least five short pinches on the target; note missed clicks or duplicate clicks.
- [ ] Pause: open the palm while moving; note whether cursor movement pauses promptly and resumes cleanly.

Record the Edge test result before accepting tuned defaults:

- Date / Edge version / operating system: `________________`
- Camera and lighting: `________________`
- Personal pinch calibration: `enabled / default`
- Final cursor smoothing factor: `________` (default `0.20`)
- Movement observations: `________________`
- Click observations: `________________`
- Pause observations: `________________`
