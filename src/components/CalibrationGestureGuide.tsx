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
    title: "正面捏合 · 真实点击 × 5",
    instruction: "手掌正对摄像头，指腹轻碰后完全分开。",
    caution: "只使用拇指和食指；其余三指不要弯曲参与。",
    imageSrc: frontContactImage,
    imageAlt: "正面使用拇指和食指真实接触",
  },
  side: {
    step: 3,
    title: "侧向或斜向捏合 · 真实点击 × 5",
    instruction: "手掌旋转约 90°，指腹轻碰后完全分开。",
    caution: "只使用拇指和食指；其余三指不要弯曲参与。",
    imageSrc: sideContactImage,
    imageAlt: "侧面使用拇指和食指真实接触",
  },
  negative: {
    step: 4,
    title: "画面重合但不要接触 · 假重合 × 3",
    instruction: "从摄像头正面看，让两指尖在画面中重合。",
    caution: "让两指在画面中重合，但实际前后分开 2–3 厘米，不要接触。",
    imageSrc: falseOverlapImage,
    imageAlt: "拇指和食指画面重合但实际前后分开",
  },
};

const GUIDE_STEPS = [1, 2, 3, 4] as const;

export function CalibrationGestureGuide({ stage }: { stage: CalibrationGuideStage }) {
  const guide = GUIDE_DEFINITIONS[stage];

  return (
    <figure className="calibration-gesture-guide" data-stage={stage}>
      <ol className="calibration-guide-progress" aria-label="个人点击校准进度">
        {GUIDE_STEPS.map((step) => (
          <li key={step} aria-current={step === guide.step ? "step" : undefined}>{step}</li>
        ))}
      </ol>
      <div className="calibration-guide-image">
        <img src={guide.imageSrc} alt={guide.imageAlt} />
        {stage === "negative" && (
          <span className="calibration-depth-reminder">保持前后分开</span>
        )}
      </div>
      <figcaption>
        <strong>{guide.title}</strong>
        <span>{guide.instruction}</span>
        <small>{guide.caution}</small>
      </figcaption>
    </figure>
  );
}
