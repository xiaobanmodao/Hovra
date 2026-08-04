# Pinch Calibration Gesture Guide Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add clear, stage-specific realistic hand illustrations to personal pinch calibration so users can imitate every pose without relying on long text.

**Architecture:** Keep the existing calibration state machine and sample collection unchanged. Add a small presentational `CalibrationGestureGuide` that maps the four active stages to bundled PNG assets and accessible Chinese copy; `PinchCalibrationWizard` selects the stage while retaining ownership of timers, counters, buttons, and profile fitting.

**Tech Stack:** React, TypeScript, Vite asset imports, Vitest, Testing Library, CSS, Electron Forge.

## Global Constraints

- Do not change sample counts: 3-second baseline, 5 front contacts, 5 side contacts, and 3 false-overlap negatives.
- Do not change pinch recognition, threshold fitting, storage, or privacy behavior.
- Only the thumb and index finger may participate in the illustrated click; the other three fingers remain visibly uninvolved.
- All four final images use the same handedness and camera convention.
- The false-overlap image must show a 2–3 cm depth gap and must not use a large X over the whole panel.
- Images are bundled locally; no runtime network request and no camera-frame persistence.

---

## File Structure

- Create `src/assets/pinch-calibration/baseline-open-palm.png`: relaxed open palm and horizontal motion arrows.
- Create `src/assets/pinch-calibration/front-thumb-index-contact.png`: front-facing thumb-index contact.
- Create `src/assets/pinch-calibration/side-thumb-index-contact.png`: side-facing thumb-index contact.
- Create `src/assets/pinch-calibration/false-overlap-separated.png`: apparent overlap plus an explicit side-view depth gap.
- Create `src/components/CalibrationGestureGuide.tsx`: stage metadata and accessible guide rendering only.
- Modify `src/components/PinchCalibrationWizard.tsx`: select the guide for the current stage without changing collection logic.
- Modify `src/components/PinchCalibrationWizard.test.tsx`: assert stage-specific images, instructions, and unchanged collection behavior.
- Modify `src/styles.css`: responsive illustration, progress, instruction, and warning styling.

### Task 1: Correct and Prepare the Four Final Image Assets

**Files:**
- Source: `/Users/hht/.codex/generated_images/019fc580-4e2b-7422-b206-22a42530d490/exec-27dbc601-1a92-451e-85aa-2c4d8903548d.png`
- Create: `src/assets/pinch-calibration/baseline-open-palm.png`
- Create: `src/assets/pinch-calibration/front-thumb-index-contact.png`
- Create: `src/assets/pinch-calibration/side-thumb-index-contact.png`
- Create: `src/assets/pinch-calibration/false-overlap-separated.png`

**Interfaces:**
- Consumes: the approved 2×2 realistic-hand contact sheet.
- Produces: four local PNG imports consumed by `CalibrationGestureGuide.tsx`.

- [ ] **Step 1: Correct the source sheet before cropping**

Use the built-in image-generation edit workflow with the approved source as the edit target and this exact edit brief:

```text
Preserve the realistic 2×2 calibration contact sheet, navy background, anatomy,
lighting, correct front OK gesture, and correct side OK gesture. Change only:
1. Horizontally orient panel 1 so its handedness matches panels 2–4 while keeping
   the open palm and cyan movement arrows.
2. In panel 4 remove the large red X. Preserve the apparent front-view overlap,
   but make the side-view inset show the thumb and index fingertip separated by
   2–3 cm with a small red double-headed distance arrow between them.
No text, numbers, letters, logos, watermark, extra fingers, fused fingers, or
other panel changes.
```

Copy the accepted generated output to `tmp/imagegen/calibration-sheet-final.png` and leave the generator's original output in place.

- [ ] **Step 2: Inspect the corrected sheet at original resolution**

Use `view_image` with `detail: "original"` and check every item explicitly:

1. Exactly five anatomically plausible fingers per visible hand.
2. Panel 2 uses only thumb and index finger and forms a clear round opening.
3. Panel 3 uses only thumb and index finger in side view.
4. Panel 4 appears overlapped from the camera view but the inset proves no contact.
5. All panels use the same handedness; no whole-panel prohibition symbol remains.

If any check fails, perform one targeted image edit and inspect again before continuing.

- [ ] **Step 3: Crop the accepted sheet into four square assets**

Create `src/assets/pinch-calibration/`, then use macOS `sips` crop offsets against the 1254×1254 source to produce four equally sized panels while excluding the white dividers. Inspect all four output files after cropping; adjust offsets if any hand, fingertip, inset, or marker is clipped.

- [ ] **Step 4: Validate image metadata and visual output**

Run:

```bash
sips -g pixelWidth -g pixelHeight src/assets/pinch-calibration/*.png
```

Expected: four readable square PNG files with matching dimensions. Open all four with `view_image` and repeat the anatomy/contact checklist from Step 2.

- [ ] **Step 5: Commit the accepted assets**

```bash
git add src/assets/pinch-calibration
git commit -m "assets: add pinch calibration gesture guides"
```

### Task 2: Render Stage-Specific Guidance Without Changing Calibration Logic

**Files:**
- Create: `src/components/CalibrationGestureGuide.tsx`
- Modify: `src/components/PinchCalibrationWizard.tsx`
- Test: `src/components/PinchCalibrationWizard.test.tsx`

**Interfaces:**
- Consumes: four PNG imports from Task 1 and the existing stages `baseline | front | side | negative`.
- Produces: `CalibrationGestureGuide({ stage }: { stage: CalibrationGuideStage }): JSX.Element`.

- [ ] **Step 1: Write a failing stage-guidance test**

Add a test that enters every active stage and checks the image accessible name plus defensive copy:

```tsx
it("shows the correct realistic hand guide for each calibration stage", () => {
  vi.useFakeTimers();
  render(<PinchCalibrationWizard currentSample={contact} onComplete={vi.fn()} onCancel={vi.fn()} />);

  fireEvent.click(screen.getByRole("button", { name: "开始三秒基线采集" }));
  expect(screen.getByRole("img", { name: "张开手掌并缓慢左右移动" })).toBeInTheDocument();

  act(() => vi.advanceTimersByTime(3_000));
  expect(screen.getByRole("img", { name: "正面使用拇指和食指真实接触" })).toBeInTheDocument();
  expect(screen.getByText("只使用拇指和食指；其余三指不要弯曲参与。"))
    .toBeInTheDocument();

  for (let count = 0; count < 5; count += 1) {
    fireEvent.click(screen.getByRole("button", { name: "记录当前接触" }));
  }
  expect(screen.getByRole("img", { name: "侧面使用拇指和食指真实接触" })).toBeInTheDocument();

  for (let count = 0; count < 5; count += 1) {
    fireEvent.click(screen.getByRole("button", { name: "记录当前接触" }));
  }
  expect(screen.getByRole("img", { name: "拇指和食指画面重合但实际前后分开" }))
    .toBeInTheDocument();
  expect(screen.getByText("让两指在画面中重合，但实际前后分开 2–3 厘米，不要接触。"))
    .toBeInTheDocument();
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npx vitest run src/components/PinchCalibrationWizard.test.tsx
```

Expected: FAIL because the current wizard has no stage image with the requested accessible name.

- [ ] **Step 3: Add the guide component and metadata**

Create the component with this public type and metadata shape:

```tsx
import baselineImage from "../assets/pinch-calibration/baseline-open-palm.png";
import falseOverlapImage from "../assets/pinch-calibration/false-overlap-separated.png";
import frontContactImage from "../assets/pinch-calibration/front-thumb-index-contact.png";
import sideContactImage from "../assets/pinch-calibration/side-thumb-index-contact.png";

export type CalibrationGuideStage = "baseline" | "front" | "side" | "negative";

type GuideDefinition = {
  step: number;
  title: string;
  instruction: string;
  caution: string;
  imageSrc: string;
  imageAlt: string;
};

const GUIDE_DEFINITIONS: Record<CalibrationGuideStage, GuideDefinition> = {
  baseline: {
    step: 1,
    title: "自然移动 3 秒",
    instruction: "张开手掌，在画面中缓慢左右移动。",
    caution: "保持五指自然分开，这一步不要捏合。",
    imageSrc: baselineImage,
    imageAlt: "张开手掌并缓慢左右移动",
  },
  front: {
    step: 2,
    title: "正面真实点击 × 5",
    instruction: "手掌正对摄像头，指腹轻碰后完全分开。",
    caution: "只使用拇指和食指；其余三指不要弯曲参与。",
    imageSrc: frontContactImage,
    imageAlt: "正面使用拇指和食指真实接触",
  },
  side: {
    step: 3,
    title: "侧面真实点击 × 5",
    instruction: "手掌旋转约 90°，指腹轻碰后完全分开。",
    caution: "只使用拇指和食指；其余三指不要弯曲参与。",
    imageSrc: sideContactImage,
    imageAlt: "侧面使用拇指和食指真实接触",
  },
  negative: {
    step: 4,
    title: "假重合样本 × 3",
    instruction: "从摄像头正面看，让两指尖在画面中重合。",
    caution: "让两指在画面中重合，但实际前后分开 2–3 厘米，不要接触。",
    imageSrc: falseOverlapImage,
    imageAlt: "拇指和食指画面重合但实际前后分开",
  },
};

export function CalibrationGestureGuide({ stage }: { stage: CalibrationGuideStage }) {
  const guide = GUIDE_DEFINITIONS[stage];
  return (
    <figure className="calibration-gesture-guide" data-stage={stage}>
      <ol className="calibration-guide-progress" aria-label="个人点击校准进度">
        {[1, 2, 3, 4].map((step) => (
          <li key={step} aria-current={step === guide.step ? "step" : undefined}>{step}</li>
        ))}
      </ol>
      <img src={guide.imageSrc} alt={guide.imageAlt} />
      <figcaption>
        <strong>{guide.title}</strong>
        <span>{guide.instruction}</span>
        <small>{guide.caution}</small>
      </figcaption>
    </figure>
  );
}
```

Keep this metadata map and all four image imports inside the presentational component module.

- [ ] **Step 4: Integrate the guide into the existing stage branches**

Render `CalibrationGestureGuide stage="baseline"` beside the existing three-second live status. Extend `SampleStep` with a required `stage: Exclude<CalibrationGuideStage, "baseline">` property and render the guide before the count and button. Pass `front`, `side`, and `negative` from their existing branches. Do not modify `recordContact`, `recordNegative`, timers, counts, `fitPinchCalibration`, or callbacks.

- [ ] **Step 5: Run the focused test and verify GREEN**

Run:

```bash
npx vitest run src/components/PinchCalibrationWizard.test.tsx
```

Expected: all wizard tests PASS, including the pre-existing collection, unavailable-hand, and cancellation cases.

- [ ] **Step 6: Commit the behavior**

```bash
git add src/components/CalibrationGestureGuide.tsx src/components/PinchCalibrationWizard.tsx src/components/PinchCalibrationWizard.test.tsx
git commit -m "feat: guide personal calibration with hand images"
```

### Task 3: Add Responsive Presentation and Complete Verification

**Files:**
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: class names emitted by `CalibrationGestureGuide`.
- Produces: a readable single-column calibration guide at desktop and narrow window sizes.

- [ ] **Step 1: Add minimal guide styling**

Add CSS for:

```css
.calibration-gesture-guide { display: grid; gap: 0.6rem; margin: 0; }
.calibration-guide-progress { display: grid; grid-template-columns: repeat(4, 1fr); }
.calibration-gesture-guide img { width: 100%; aspect-ratio: 1; object-fit: contain; }
.calibration-gesture-guide figcaption { display: grid; gap: 0.35rem; }
.calibration-gesture-guide figcaption small { color: #ffd37a; }
```

Style `[aria-current="step"]` with the existing cyan accent, keep the image background dark, and cap the desktop image size so controls remain visible without excessive scrolling. Under `@media (max-width: 560px)`, use the full available width and preserve `object-fit: contain`.

- [ ] **Step 2: Run focused and full automated verification**

Run:

```bash
npx vitest run src/components/PinchCalibrationWizard.test.tsx
npx vitest run --exclude '.worktrees/**'
npm run build
npm run electron:typecheck
```

Expected: all commands exit 0 with no failed tests or TypeScript errors.

- [ ] **Step 3: Package and inspect the desktop application**

Run:

```bash
npm run electron:make
```

Launch `/Users/hht/Desktop/手势控制/out/手势控制-darwin-arm64/手势控制.app`. Use the personal calibration flow and inspect all four stages:

1. The current stage shows one large image only.
2. No fingertip, wrist, side inset, or distance marker is cropped.
3. The visible hand direction remains consistent across stages.
4. Front and side stages unmistakably use thumb and index finger.
5. The false-overlap stage instructs the user to perform the pose without implying the whole step is forbidden.
6. Buttons, counts, three-second transition, cancellation, and disabled states remain usable.

- [ ] **Step 4: Commit presentation changes**

```bash
git add src/styles.css
git commit -m "style: present calibration hand guides clearly"
```

- [ ] **Step 5: Record final evidence**

Report the exact test counts, build/typecheck/package results, final app path, and the results of the six-point visual inspection. Do not claim the images pass until the packaged application has been inspected.
