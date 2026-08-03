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

## Manual verification checklist

After starting the demo locally, perform these acceptance checks:

- [ ] Grant camera access.
- [ ] Confirm the camera preview and keypoints are mirrored.
- [ ] Move the index finger and observe the cursor move.
- [ ] Perform a short pinch on the target and observe exactly one click.
- [ ] Hold a pinch for at least 350 ms, move, then release; confirm the card moves.
- [ ] Open the palm and confirm the cursor no longer moves.
- [ ] Remove the hand and confirm the status changes to `lost`.
- [ ] Reload the page, deny camera access, and confirm guidance appears.

### Device-specific verification notes

Camera permission, a connected camera, and a browser that supports `getUserMedia`
are required for the interactive checks. If a physical camera or permission prompt
is unavailable in the test environment, perform these steps on a local desktop
browser before accepting the demo.
