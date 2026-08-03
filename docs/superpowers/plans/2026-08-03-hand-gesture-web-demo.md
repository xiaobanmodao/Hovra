# Hand Gesture Web Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local, browser-only hand-gesture demo that moves a virtual cursor and triggers click and drag interactions inside the page.

**Architecture:** A camera component supplies frames to a MediaPipe adapter. A pure gesture engine converts landmark coordinates to stable interaction events; a cursor controller smooths and maps those events to page coordinates. React components render the camera/overlay and a small interaction playground without any server.

**Tech Stack:** Vite, React, TypeScript, `@mediapipe/tasks-vision`, Vitest, React Testing Library.

## Global Constraints

- Run hand recognition entirely in the browser; do not add a server, account, persistence, or network frame upload.
- Process only the first detected hand and preserve the recognizer/gesture-engine boundary for the desktop phase.
- Use a mirrored preview and map the mirrored index fingertip to viewport coordinates.
- Treat an open palm or lost hand as paused; finish an active drag when the hand is lost.
- Keep thresholds and timing constants together in `src/gesture/config.ts`.

---

## Planned file structure

- `package.json`: scripts and browser/test dependencies.
- `src/main.tsx`: React bootstrap.
- `src/App.tsx`: orchestration of camera, recognizer, engine, cursor and playground state.
- `src/styles.css`: dashboard, canvas overlay, cursor and accessible status styles.
- `src/gesture/config.ts`: gesture thresholds, hold duration and smoothing factor.
- `src/gesture/types.ts`: shared hand landmark and interaction event types.
- `src/gesture/gestureEngine.ts`: pure, stateful landmark-to-event state machine.
- `src/gesture/gestureEngine.test.ts`: deterministic gesture transitions.
- `src/vision/handLandmarker.ts`: MediaPipe creation and frame detection adapter.
- `src/vision/handLandmarker.test.ts`: error normalization and first-hand selection tests using mocked MediaPipe results.
- `src/cursor/cursorController.ts`: pure mirrored-coordinate mapping and exponential smoothing.
- `src/cursor/cursorController.test.ts`: coordinate and smoothing tests.
- `src/components/CameraStage.tsx`: webcam video, landmark overlay canvas and setup status.
- `src/components/Playground.tsx`: click target and draggable card, operated by virtual cursor events.
- `src/components/StatusPanel.tsx`: live camera/tracker/gesture labels.
- `src/components/Playground.test.tsx`: click and drag visual state tests.
- `README.md`: local setup, camera permission guidance, gesture guide and manual verification checklist.

### Task 1: Scaffold the browser application

**Files:**
- Create: `package.json`
- Create: `index.html`
- Create: `src/main.tsx`
- Create: `src/App.tsx`
- Create: `src/styles.css`
- Create: `vite.config.ts`
- Create: `tsconfig.json`
- Create: `README.md`

**Interfaces:**
- Produces: `npm run dev`, `npm run build`, and `npm test` commands.
- Produces: `App` as the root React component.

- [ ] **Step 1: Create the package manifest and Vite configuration**

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "test": "vitest run"
  }
}
```

Configure Vitest with `environment: "jsdom"` and `@testing-library/jest-dom/vitest` as its setup file.

- [ ] **Step 2: Add the failing smoke test**

Create `src/App.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import App from "./App";

it("renders the hand gesture demo heading", () => {
  render(<App />);
  expect(screen.getByRole("heading", { name: /hand gesture/i })).toBeInTheDocument();
});
```

- [ ] **Step 3: Run the smoke test to verify it fails**

Run: `npm test -- src/App.test.tsx`

Expected: FAIL because the project files and `App` module do not exist.

- [ ] **Step 4: Implement the minimal React entry point and static shell**

Create `main.tsx` with `createRoot(document.getElementById("root")!).render(<App />)`. Implement `App` with an `h1` titled `Hand Gesture Control`, an introductory line saying recognition stays in this browser, and a placeholder main region. Import `styles.css` from `main.tsx`.

- [ ] **Step 5: Run the smoke test and production build**

Run: `npm test -- src/App.test.tsx && npm run build`

Expected: both commands exit with status 0.

- [ ] **Step 6: Commit the scaffold**

```bash
git add package.json index.html vite.config.ts tsconfig.json src README.md
git commit -m "chore: scaffold gesture control web demo"
```

### Task 2: Implement and test pure gesture interpretation

**Files:**
- Create: `src/gesture/types.ts`
- Create: `src/gesture/config.ts`
- Create: `src/gesture/gestureEngine.ts`
- Create: `src/gesture/gestureEngine.test.ts`

**Interfaces:**
- Produces: `type Landmark = { x: number; y: number; z?: number }`.
- Produces: `type GestureState = "tracking" | "paused" | "lost" | "pinching" | "dragging"`.
- Produces: `class GestureEngine` with `update(landmarks: Landmark[] | null, nowMs: number): GestureOutput`.
- Produces: `GestureOutput` with `{ state, cursor: Landmark | null, click, dragStart, dragEnd }` booleans.

- [ ] **Step 1: Write failing state-transition tests**

Use landmark helpers that place `THUMB_TIP` at index 4 and `INDEX_FINGER_TIP` at index 8. Assert the following transition sequence:

```ts
const engine = new GestureEngine();
expect(engine.update(openHand(), 0).state).toBe("paused");
expect(engine.update(trackingHand(), 16).state).toBe("tracking");
expect(engine.update(pinchedHand(), 32).state).toBe("pinching");
expect(engine.update(trackingHand(), 64).click).toBe(true);
expect(engine.update(pinchedHand(), 100).dragStart).toBe(false);
expect(engine.update(pinchedHand(), 550).dragStart).toBe(true);
expect(engine.update(null, 570).dragEnd).toBe(true);
```

- [ ] **Step 2: Run the unit test to verify it fails**

Run: `npm test -- src/gesture/gestureEngine.test.ts`

Expected: FAIL because `GestureEngine` does not exist.

- [ ] **Step 3: Define gesture types, constants and minimal state machine**

Use named landmark indices `WRIST = 0`, `THUMB_TIP = 4`, `INDEX_FINGER_TIP = 8`, and `MIDDLE_FINGER_TIP = 12`. In `config.ts`, export `PINCH_DISTANCE = 0.055`, `DRAG_HOLD_MS = 350`, and `OPEN_PALM_MIN_TIP_DISTANCE = 0.18`. Mark an open palm when index, middle, ring and pinky tips are each farther than the palm threshold from the wrist. On a pinch release, set `click` only when drag was never entered. On null landmarks, set `dragEnd` if needed and return `lost`.

- [ ] **Step 4: Run gesture-engine tests**

Run: `npm test -- src/gesture/gestureEngine.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the gesture engine**

```bash
git add src/gesture
git commit -m "feat: add hand gesture state machine"
```

### Task 3: Add hand-recognition and cursor-mapping adapters

**Files:**
- Create: `src/vision/handLandmarker.ts`
- Create: `src/vision/handLandmarker.test.ts`
- Create: `src/cursor/cursorController.ts`
- Create: `src/cursor/cursorController.test.ts`

**Interfaces:**
- Consumes: `Landmark` from `src/gesture/types.ts`.
- Produces: `createHandLandmarker(): Promise<HandLandmarker>` and `detectFirstHand(landmarker, video, nowMs): Landmark[] | null`.
- Produces: `mapMirroredPoint(point, viewport): { x: number; y: number }` and `smoothPoint(previous, target, factor): Point`.

- [ ] **Step 1: Write failing adapter tests**

```ts
expect(mapMirroredPoint({ x: 0.2, y: 0.25 }, { width: 1000, height: 800 }))
  .toEqual({ x: 800, y: 200 });
expect(smoothPoint({ x: 0, y: 0 }, { x: 100, y: 80 }, 0.2))
  .toEqual({ x: 20, y: 16 });
```

Mock a MediaPipe result containing two hands and assert `detectFirstHand` returns only the first hand. Mock `detectForVideo` throwing and assert the adapter returns `null` after reporting the supplied error callback once.

- [ ] **Step 2: Run adapter tests to verify they fail**

Run: `npm test -- src/vision/handLandmarker.test.ts src/cursor/cursorController.test.ts`

Expected: FAIL because both adapters do not exist.

- [ ] **Step 3: Implement the MediaPipe adapter and pure cursor utilities**

Initialize `FilesetResolver.forVisionTasks` with the MediaPipe WASM asset base and create the landmarker with `runningMode: "VIDEO"`, `numHands: 1`, and model asset URL. In `detectFirstHand`, call `detectForVideo(video, nowMs)`, return `result.landmarks[0] ?? null`, and normalize runtime errors through the callback. Map x as `(1 - point.x) * width`, map y as `point.y * height`, and use `previous + (target - previous) * factor` for smoothing.

- [ ] **Step 4: Run adapter tests and build**

Run: `npm test -- src/vision/handLandmarker.test.ts src/cursor/cursorController.test.ts && npm run build`

Expected: both commands exit with status 0.

- [ ] **Step 5: Commit the adapters**

```bash
git add src/vision src/cursor
git commit -m "feat: add MediaPipe and cursor adapters"
```

### Task 4: Build the camera, status and interaction playground

**Files:**
- Create: `src/components/CameraStage.tsx`
- Create: `src/components/StatusPanel.tsx`
- Create: `src/components/Playground.tsx`
- Create: `src/components/Playground.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: `GestureOutput`, `Landmark`, mapped cursor `Point`, and recognizer status strings.
- Produces: `CameraStage` with video ref, overlay draw callback and camera error callback.
- Produces: `Playground` accepting `{ cursor, output }` and rendering a click count plus draggable card.

- [ ] **Step 1: Write failing playground behavior tests**

```tsx
render(<Playground cursor={{ x: 50, y: 50 }} output={{ ...idle, click: true }} />);
expect(screen.getByText(/clicks: 1/i)).toBeInTheDocument();
```

Then rerender with `dragStart: true`, move the cursor to `{ x: 200, y: 120 }`, rerender with `state: "dragging"`, and assert the card style contains a translated left/top position; rerender with `dragEnd: true` and assert its final position remains.

- [ ] **Step 2: Run the component test to verify it fails**

Run: `npm test -- src/components/Playground.test.tsx`

Expected: FAIL because `Playground` does not exist.

- [ ] **Step 3: Implement visual components and wire `App`**

`CameraStage` requests `{ video: { width: 1280, height: 720 } }`, sets `video.srcObject`, and stops every stream track during effect cleanup. Draw landmark dots and connections on a canvas aligned over the mirrored video. `App` initializes the landmarker, executes recognition via `requestAnimationFrame`, calls `GestureEngine.update`, and passes smoothed mirrored cursor points to the playground. Use a `role="status"` label for camera/tracker/gesture state. Render the virtual cursor as a fixed element with `pointer-events: none`.

`Playground` increments its click counter when `output.click` is true and the cursor lies within the click target bounds. On `dragStart` inside the card, store the cursor-to-card offset; while `state === "dragging"`, derive the card position from the cursor; on `dragEnd`, retain its position. Do not use global mouse events for this virtual interaction.

- [ ] **Step 4: Run component tests and build**

Run: `npm test -- src/components/Playground.test.tsx && npm run build`

Expected: both commands exit with status 0.

- [ ] **Step 5: Commit the interactive UI**

```bash
git add src/components src/App.tsx src/styles.css
git commit -m "feat: add camera gesture interaction demo"
```

### Task 5: Document and manually verify the full demo

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: completed local Vite app.
- Produces: reproducible local run instructions and a human verification checklist.

- [ ] **Step 1: Add the manual verification checklist to README**

Document these exact checks: run `npm install` then `npm run dev`; grant camera access; confirm mirrored preview and keypoints; move index finger and observe cursor; perform a short pinch on the target and observe one click; hold a pinch for at least 350 ms, move, then release and observe the card moves; open palm and confirm the cursor no longer moves; remove hand and confirm status changes to `lost`; deny access after a page reload and confirm guidance appears.

- [ ] **Step 2: Run all automated checks**

Run: `npm test && npm run build`

Expected: all tests pass and Vite emits a production build.

- [ ] **Step 3: Run the manual browser verification**

Run: `npm run dev`

Open the printed localhost URL in Chrome or Edge and perform every README checklist item. Record any device-specific limitation directly beneath the checklist.

- [ ] **Step 4: Commit the documentation**

```bash
git add README.md
git commit -m "docs: add demo setup and verification guide"
```

## Self-review

- Spec coverage: Tasks 1–4 implement local browser operation, camera preview, first-hand MediaPipe recognition, mirrored cursor motion, pinch click, hold drag, open-palm/lost-hand pausing, visual feedback and error paths. Task 5 provides the requested manual acceptance checks.
- Placeholder scan: no unassigned implementation tasks, deferred behaviors, or unspecified test commands remain.
- Type consistency: `Landmark` is defined in Task 2 and consumed in Task 3; Task 3 produces mapped cursor points used in Task 4; `GestureOutput` is defined in Task 2 and used by the UI in Task 4.
