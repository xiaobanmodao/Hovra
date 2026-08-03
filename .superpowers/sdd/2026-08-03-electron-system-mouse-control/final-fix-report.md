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

- `npm test` — 13 files, 86/86 tests passed.
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

## Final fix round: renderer reload and replacement

### Root cause

The main-owned activation session was invalidated on window blur and explicit
renderer safety requests, but it survived a focused renderer reload. Electron's
programmatic `webContents.reload()` does not pass through `will-navigate`, so a
replacement renderer sharing the trusted `webContents` and URL could resume
action IPC using the prior session without a fresh explicit activation.

### Fix

- Main now listens for `did-start-navigation` and calls the controller's
  idempotent `releaseAndPause()` for every main-frame navigation, including reload.
- Subframe navigation does not affect the system-control session.
- `render-process-gone` and `webContents` `destroyed` also release and invalidate
  the session, covering renderer crash, termination, and window teardown.
- Reload invalidation deliberately does not clear focused-window activity. The
  replacement renderer can therefore request a fresh explicit activation while
  the window remains focused, but action IPC remains inert until it does so.
- WebContents destruction clears the current trusted-window reference and active
  state after initiating release.

### Regression evidence

The new integration regression uses the real `MouseController` and registered IPC
handlers with only Electron and RobotJS boundaries mocked. It activates, tracks a
press, simulates a main-frame reload, observes one release, proves a subsequent
click is inert, then explicitly activates again and proves the click is accepted.
Separate cases verify release on `render-process-gone` and `destroyed`. The RED
run failed all three cases because none of those lifecycle listeners existed.

Fresh final-fix verification passed: `npm test` (13 files, 85/85 tests),
`npm run electron:typecheck`, `npm run build`, and `npm run electron:make` for
darwin/arm64. Artifact generation remained successful and the packaged app was
not launched.

## Final reload fix round 2: activation during navigation

### Root cause

The navigation-start release invalidated the current session, but the trusted
departing frame could still invoke `gesture:activate` after
`did-start-navigation` and before document commit. Because the trusted sender and
URL remained the same across reload, that late activation could survive into the
replacement document.

### Fix

- Main now keeps activation eligibility separate from general trusted IPC access.
  Permission queries and unconditional safety release retain their narrow trusted
  access, while `gesture:activate` additionally requires the current verified
  activation frame.
- Main-frame navigation increments a renderer generation, clears the activation
  frame synchronously, and initiates the first idempotent release. The departing
  frame therefore cannot reactivate during navigation.
- At top-level `dom-ready`, main captures the replacement
  `webContents.mainFrame`, performs a second idempotent release, and opens the
  activation gate only after that release settles and only if the window, frame,
  and renderer generation are still current.
- The activation gate is bound to the replacement `WebFrameMain` identity, so an
  event from the departing frame remains ineligible even though both frames have
  the same `webContents` and URL.
- Same-document main-frame navigation reopens the gate for the unchanged frame
  only after its release settles. Subframe navigation does not change generation,
  activation eligibility, or mouse state.
- Renderer crash and destruction increment the generation and clear activation
  eligibility before release, preventing an older readiness continuation from
  reopening the gate.

### Regression evidence

- A controller IPC regression first failed because a trusted event still reached
  `controller.activate()` while its readiness gate was closed.
- The main integration regression now uses distinct departing and replacement
  `WebFrameMain` objects. It proves the departing frame can activate before
  navigation, cannot activate after navigation starts, and remains ineligible
  after replacement readiness. It also proves replacement actions remain inert
  until that replacement frame performs a fresh explicit activation.
- The same test proves subframe navigation neither releases the tracked press nor
  closes activation eligibility.

Fresh round-2 verification passed: `npm test` (13 files, 86/86 tests),
`npm run electron:typecheck`, `npm run build`, and `npm run electron:make` for
darwin/arm64. `git diff --check` passed before commit. The app was not launched,
no Accessibility choice was made, and no real mouse operation was called.
