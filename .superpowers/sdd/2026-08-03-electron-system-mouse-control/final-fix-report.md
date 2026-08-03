# Final review fix report

## Scope and status

All final review findings were addressed in the Electron main/preload/renderer
boundary, mouse-controller state machine, display mapping, packaging checks, and
macOS acceptance documentation. No Accessibility permission was requested or
accepted, the packaged app was not launched, and no real mouse adapter method was
called during this pass.

## P1: main-owned activation, IPC trust, and navigation lock

### Root cause

The renderer previously owned the only explicit enable flag. A focused renderer
could call a fixed action IPC channel even when its visible UI was paused because
the main-process gate tracked only window focus and Accessibility permission.
The IPC handlers also accepted every `ipcMain.handle` sender, and the window had
no explicit navigation/new-window lock.

### Fix

- `MouseController` now owns an in-memory activation session that starts false on
  every launch. `activate()` grants a session only after permission and focus are
  both valid before and after the awaited permission check.
- All move/click/press actions require that main-owned session. Blur, quit, and
  renderer pause invalidate it before release.
- Activation generation invalidates an activation still awaiting permission when
  any safety pause occurs.
- Every gesture IPC handler validates both the exact `mainWindow.webContents`
  sender and its top-frame URL. Development accepts only the configured dev-server
  origin; production accepts only the exact packaged renderer file URL.
- The preload bridge exposes fixed `activate` and `releaseAndPause` capabilities;
  it still exposes no raw IPC, Node, file, process, or arbitrary URL capability.
- Renderer enable state is reconciled with the boolean returned by main-process
  activation. A rejected or stale activation remains visibly paused and invokes
  the main safety pause.
- Renderer activation-in-flight is tracked explicitly, so lost/open-palm/stale
  safety that occurs while main is awaiting permission cancels the late result and
  releases the main session.
- `setWindowOpenHandler` denies all new windows and `will-navigate` prevents
  renderer-initiated top-level navigation.
- `BrowserWindow` explicitly sets `contextIsolation: true`,
  `nodeIntegration: false`, `sandbox: true`, and `webSecurity: true`.

### Regression evidence

- Controller tests first failed because move/click/press worked before explicit
  activation and `activate` did not exist.
- IPC trust tests first failed because untrusted events reached controller methods.
- Main tests first failed because `webSecurity`, the navigation lock, and the
  sender/origin security object were absent.
- Final tests prove action IPC is inert before activation and after
  `releaseAndPause`, while the trusted activated session can press and is released.
- Renderer tests prove a main-process activation rejection never displays
  `Enabled` and never dispatches move/click/press.

## P1: primary-display coordinate mapping

### Root cause

The renderer sent its Electron viewport pixel coordinates to RobotJS. A window
that did not cover the primary display therefore mapped hand movement only into
the window-sized coordinate range.

### Fix

- Cursor smoothing now happens in mirrored normalized coordinates.
- The renderer continues to derive its local virtual cursor from those normalized
  coordinates and the current viewport, but sends only normalized `[0, 1]`
  movement to the preload bridge.
- Preload and main independently reject non-finite and out-of-range coordinates.
- Main maps accepted normalized positions to
  `screen.getPrimaryDisplay().bounds`, including its origin, and uses inclusive
  right/bottom edges so a normalized value of `1` remains on-screen.

### Regression evidence

- The renderer test first received viewport coordinates `604.16, 314.88` instead
  of normalized `0.59, 0.41`.
- Main mapping tests cover a non-zero/negative display origin, interior mapping,
  and exact normalized `0`/`1` edges. The edge test first exposed out-of-bounds
  coordinates before the inclusive-edge correction.

## P2: unconditional safety release

### Root cause

The renderer used ordinary `mouseUp` for safety pause. Ordinary mouse-up was
permission/activity-gated, so losing permission or app activity after a tracked
press could leave the OS button held.

### Fix

- `releaseAndPause()` invalidates the main-owned session immediately, then queues
  an idempotent release of any tracked press without consulting current focus or
  Accessibility status.
- Ordinary `mouseUp` also releases a tracked press without those gates; no release
  occurs if the controller never tracked a successful press.
- Every renderer safety path now uses the dedicated preload
  `releaseAndPause()` capability. This includes explicit pause, open palm, lost
  hand, stale frame, permission revocation, blur notification, action failure,
  and unmount.

### Regression evidence

- Tests press first, revoke permission and activity, then verify one unconditional
  release and no subsequent action.
- Lost/open-palm/stale-frame/window-blur renderer tests hold the safety-release
  promise pending and prove the UI does not display `Paused` until it settles.

## P2: durable Electron checks

- Added `tsconfig.electron.json` covering `electron/**/*.ts`, Forge config, and
  Vite config.
- Added durable package script `npm run electron:typecheck`.
- Expanded `electron/main.test.ts` to cover BrowserWindow security preferences,
  exact development `loadURL`, exact production `loadFile`, navigation denial,
  new-window denial, trusted dev origin, exact packaged file URL, and primary
  display bounds.

## P2: permission UI and packaged-app acceptance

- Added a denied-state **Open Accessibility Settings** control.
- The bridge exposes only a zero-argument method; main opens the fixed macOS
  `x-apple.systempreferences` Accessibility pane only for the trusted renderer.
  No arbitrary URL is accepted from renderer input.
- README acceptance now targets the exact Apple-silicon artifact:
  `out/hand-gesture-control-darwin-arm64/hand-gesture-control.app`.
- README states that the local artifact has no Developer ID distribution
  signature and is non-notarized (an ad-hoc linker signature may still be shown),
  is for local verification only, and must not be accepted via the dev server.

## Verification evidence

Focused red/green runs were performed for controller/IPC, main-process security,
preload, system-control UI, and App safety/activation behavior.

Fresh final-tree verification:

- `npm test` — 13 files, 82/82 tests passed.
- `npm run build` — renderer TypeScript and Vite production build passed.
- `npm run electron:typecheck` — Electron main/preload/tests/config passed.
- `npm run electron:make` — Forge built main, preload, renderer, rebuilt the one
  native dependency, packaged darwin/arm64, and produced the zip artifact.
- Packaged app exists at
  `out/hand-gesture-control-darwin-arm64/hand-gesture-control.app`.
- Zip exists at
  `out/make/zip/darwin/arm64/hand-gesture-control-darwin-arm64-0.0.0.zip`.
- Packaged native adapter exists at
  `Contents/Resources/app.asar.unpacked/node_modules/@jitsi/robotjs/prebuilds/darwin-x64+arm64/@jitsi+robotjs.node`.
- `codesign -dv` reports `Signature=adhoc`, no TeamIdentifier, and no sealed
  resources; no Developer ID signing or notarization was performed.
- `git diff --check` passed.

## Safety statement

All Electron, Accessibility, shell, screen, and RobotJS interactions in automated
tests were mocked. Packaging and artifact inspection were read-only with respect
to runtime behavior. The app was not launched, System Settings was not opened,
no permission choice was made, and no physical pointer event was emitted.
