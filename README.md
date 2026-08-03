# Hand Gesture Control

A browser-only hand gesture control demo. Recognition runs locally in the browser; no video frames are uploaded.

## Commands

- `npm run dev` starts the Vite development server.
- `npm run build` type-checks and creates a production build.
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

Use this checklist on a Mac with a camera before accepting the Electron package.
Do not enable system control until you are ready to test the physical pointer.

1. Install dependencies:

   ```bash
   npm install
   ```

2. Start the desktop app:

   ```bash
   npm run electron:dev
   ```

3. In macOS, open **System Settings → Privacy & Security → Accessibility** and
   enable the running Hand Gesture Control app. Return to the app and confirm its
   system-control status changes from **Permission required** to **Paused**.
4. Click **Enable system control**, then verify a tracked index finger moves the
   system pointer, a short pinch clicks, and a held pinch starts and releases a
   drag.
5. Verify every safety pause: click **Pause system control**; open the palm;
   remove the hand or stop the camera stream; move focus away from the app; and
   deactivate the app. Each action must pause control and release any held mouse
   button.
6. Start a drag, quit the app while the mouse button is held, and confirm the
   system pointer is released.

## Manual verification checklist

After starting the demo locally, perform these acceptance checks:

- [ ] Grant camera access.
- [ ] Confirm the camera preview and keypoints are mirrored.
- [ ] Move the index finger and observe the cursor move.
- [ ] Perform a short pinch on the target and observe exactly one click.
- [ ] Hold a pinch for at least 350 ms, move, then release; confirm the card moves.
- [ ] Confirm both objects can be operated anywhere in the current viewport and remain visible after resizing.
- [ ] Open the palm and confirm the cursor no longer moves.
- [ ] Remove the hand and confirm the status changes to `lost`.
- [ ] Reload the page, deny camera access, and confirm guidance appears.

### Device-specific verification notes

Camera permission, a connected camera, and a browser that supports `getUserMedia`
are required for the interactive checks. If a physical camera or permission prompt
is unavailable in the test environment, perform these steps on a local desktop
browser before accepting the demo.

## Microsoft Edge calibration record

Run this checklist in a current desktop version of Microsoft Edge with the
calibration panel expanded. Adjust one setting at a time and record the final
values and observations from the same camera session.

- [ ] Movement: move the index finger throughout the viewport; note cursor responsiveness, stability and any jitter.
- [ ] Click: perform at least five short pinches on the target; note missed clicks or duplicate clicks.
- [ ] Drag: hold a pinch past the configured delay, move the card, then release; note drag-start timing and release reliability.
- [ ] Pause: open the palm while moving; note whether cursor movement pauses promptly and resumes cleanly.

Record the Edge test result before accepting tuned defaults:

- Date / Edge version / operating system: `________________`
- Camera and lighting: `________________`
- Final pinch threshold: `________` (default `0.055`)
- Final cursor smoothing factor: `________` (default `0.20`)
- Final drag hold: `________ ms` (default `350 ms`)
- Movement observations: `________________`
- Click observations: `________________`
- Drag observations: `________________`
- Pause observations: `________________`
