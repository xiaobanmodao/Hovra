# Full-Page Gesture Interactions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the existing virtual hand cursor click and drag the demo objects anywhere in the visible browser viewport.

**Architecture:** Extract small pure viewport-boundary helpers, then make `Playground` a fixed full-page overlay that stores positions for both objects. It continues consuming the existing `cursor` and `GestureOutput` interfaces; no camera, MediaPipe, or gesture-engine behavior changes.

**Tech Stack:** React, TypeScript, Vitest, React Testing Library.

## Global Constraints

- Keep all recognition, gesture interpretation, and interaction inside the browser; add no server, upload, account, or persistence.
- Click target and draggable card use `position: fixed` and viewport coordinates.
- Keep each interactive object within the visible viewport with a fixed safety margin; when the viewport is smaller than an object plus margins, use coordinate `0` on that axis.
- Virtual cursor remains on top with `pointer-events: none`.
- Open-palm, lost-hand, and stalled-camera behavior must continue ending active drags through the existing `dragEnd` event.

---

## Planned file structure

- `src/components/viewportBounds.ts`: pure point clamp and resize correction helpers.
- `src/components/viewportBounds.test.ts`: boundary behavior tests independent of React layout.
- `src/components/Playground.tsx`: fixed page overlay, object positions, hit testing, drag state, resize listener.
- `src/components/Playground.test.tsx`: full-page click/drag and integration behavior tests.
- `src/styles.css`: fixed overlay/object styles, z-index rules and responsive visual treatment.
- `README.md`: updated interaction guidance and manual check for whole-viewport motion.

### Task 1: Add viewport-boundary utilities with tests

**Files:**
- Create: `src/components/viewportBounds.ts`
- Create: `src/components/viewportBounds.test.ts`

**Interfaces:**
- Produces: `type Size = { width: number; height: number }` and `type Position = { x: number; y: number }`.
- Produces: `clampToViewport(position: Position, item: Size, viewport: Size, margin: number): Position`.

- [ ] **Step 1: Write failing utility tests**

```ts
expect(clampToViewport({ x: -10, y: 500 }, { width: 100, height: 80 }, { width: 400, height: 300 }, 16))
  .toEqual({ x: 16, y: 204 });
expect(clampToViewport({ x: 30, y: 30 }, { width: 200, height: 100 }, { width: 180, height: 80 }, 16))
  .toEqual({ x: 0, y: 0 });
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `npm test -- src/components/viewportBounds.test.ts`

Expected: FAIL because `viewportBounds` does not exist.

- [ ] **Step 3: Implement the pure clamp helper**

Compute `maxX = Math.max(0, viewport.width - item.width - margin)` and `maxY` equivalently. If an axis cannot fit (`viewport.width < item.width + margin * 2`), return `0` on that axis; otherwise clamp between `margin` and `maxX` (and similarly for y).

- [ ] **Step 4: Run utility tests**

Run: `npm test -- src/components/viewportBounds.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/viewportBounds.ts src/components/viewportBounds.test.ts
git commit -m "feat: add viewport interaction bounds"
```

### Task 2: Convert Playground into a full-page interaction overlay

**Files:**
- Modify: `src/components/Playground.tsx`
- Modify: `src/components/Playground.test.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: `cursor: Point | null` and `output: GestureOutput` from the existing component props.
- Consumes: `clampToViewport(position, item, viewport, margin)`.
- Produces: a full-page fixed overlay with a click target and draggable card, each independently positioned in viewport coordinates.

- [ ] **Step 1: Add failing full-page interaction tests**

Mock `getBoundingClientRect` for the fixed card and target. Assert a click at viewport coordinate `{ x: 900, y: 100 }` increments the target count when the target is positioned there, while `{ x: 20, y: 20 }` does not. Start dragging the card, rerender with a cursor near the bottom-right viewport corner, and assert its inline `left`/`top` are clamped to the viewport-safe maximum.

```tsx
rerender(<Playground cursor={{ x: 980, y: 760 }} output={{ ...idle, state: "dragging" }} />);
expect(screen.getByTestId("draggable-card")).toHaveStyle({ left: "784px", top: "648px" });
```

- [ ] **Step 2: Run component tests to confirm they fail**

Run: `npm test -- src/components/Playground.test.tsx`

Expected: FAIL because the existing component confines both objects to `playground-surface`.

- [ ] **Step 3: Implement fixed full-page layout and interaction state**

Replace the bounded `.playground-surface` with a root `.interaction-layer` using `position: fixed; inset: 0; pointer-events: none`. Render the click target and card as `position: fixed; pointer-events: auto`, controlled by separate `Position` state values. Use their client rectangles for hit testing, preserve the card’s grab offset, and apply `clampToViewport` with `window.innerWidth`, `window.innerHeight`, and `16` pixel margin during dragging. Keep the virtual cursor’s stacking context above this layer and non-interactive.

- [ ] **Step 4: Run component tests and full suite**

Run: `npm test -- src/components/Playground.test.tsx && npm test && npm run build`

Expected: every test passes and the production build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/components/Playground.tsx src/components/Playground.test.tsx src/styles.css
git commit -m "feat: make gesture targets work across page"
```

### Task 3: Preserve positions on resize and update verification guidance

**Files:**
- Modify: `src/components/Playground.tsx`
- Modify: `src/components/Playground.test.tsx`
- Modify: `README.md`

**Interfaces:**
- Consumes: `clampToViewport` and stored click-target/card positions.
- Produces: a `resize` listener that clamps both object positions and is removed on component cleanup.

- [ ] **Step 1: Add a failing resize test**

Set `window.innerWidth` and `window.innerHeight` to a smaller viewport after rendering objects near the former bottom-right corner. Dispatch `new Event("resize")`, then assert both objects’ `left` and `top` styles have moved to their safe maximum values. Unmount and dispatch resize again to confirm no state-update warning occurs.

- [ ] **Step 2: Run the resize test to confirm it fails**

Run: `npm test -- src/components/Playground.test.tsx`

Expected: FAIL because the component does not register resize correction.

- [ ] **Step 3: Implement resize correction and documentation**

Register one `window.addEventListener("resize", handleResize)` effect. In `handleResize`, read the rendered element sizes, call `clampToViewport` for the card and target, and update their position state only when coordinates change. Return cleanup with `removeEventListener`. Update the README manual checklist to state that both objects can be operated anywhere in the current viewport and remain visible after resizing.

- [ ] **Step 4: Run all verification commands**

Run: `npm test && npm run build && git diff --check`

Expected: all tests pass, build succeeds, and no whitespace errors are reported.

- [ ] **Step 5: Commit**

```bash
git add src/components/Playground.tsx src/components/Playground.test.tsx README.md
git commit -m "feat: retain full-page targets on resize"
```

## Self-review

- Spec coverage: Task 1 provides shared safe-boundary behavior; Task 2 implements fixed full-page click and drag interactions; Task 3 implements resize safety and updates manual verification.
- Placeholder scan: no deferred requirements or unspecified test steps are present.
- Type consistency: `Position` and `Size` are defined by Task 1; Tasks 2 and 3 use the same `clampToViewport` signature; existing `Point` and `GestureOutput` inputs remain unchanged.
