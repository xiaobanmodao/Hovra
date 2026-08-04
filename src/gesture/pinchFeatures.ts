import type { HandGeometry } from "./handGeometry";
import { landmarkDistance } from "./landmarkMetrics";
import {
  INDEX_FINGER_DIP,
  INDEX_FINGER_MCP,
  INDEX_FINGER_PIP,
  INDEX_FINGER_TIP,
  THUMB_CMC,
  THUMB_IP,
  THUMB_MCP,
  THUMB_TIP,
  type Landmark,
} from "./types";

export type PinchFrameFeatures = {
  timestampMs: number;
  imageRatio: number;
  worldRatio: number | null;
  imageDepthGap: number;
  worldDepthGap: number | null;
  approachVelocity: number;
  thumbCurl: number;
  indexCurl: number;
  contactPoseScore: number;
  frameIntervalMs: number | null;
};

export class PinchFeatureExtractor {
  private previous: { timestampMs: number; imageRatio: number } | null = null;

  update(image: HandGeometry, world: HandGeometry | null, nowMs: number): PinchFrameFeatures {
    if (!Number.isFinite(nowMs)) {
      this.reset();
      throw new TypeError("Pinch feature timestamp must be finite");
    }
    if (this.previous && nowMs < this.previous.timestampMs) this.reset();

    const frameIntervalMs = this.previous ? nowMs - this.previous.timestampMs : null;
    const approachVelocity = frameIntervalMs !== null && frameIntervalMs >= 8 && frameIntervalMs <= 80
      ? clamp((this.previous!.imageRatio - image.pinchRatios.left) / (frameIntervalMs / 1_000), -8, 8)
      : 0;
    const thumbCurl = curl(
      image.landmarks,
      [THUMB_CMC, THUMB_MCP, THUMB_IP, THUMB_TIP],
    );
    const indexCurl = curl(
      image.landmarks,
      [INDEX_FINGER_MCP, INDEX_FINGER_PIP, INDEX_FINGER_DIP, INDEX_FINGER_TIP],
    );
    const contactPoseScore = clamp01(
      0.75 * (1 - image.pinchRatios.left / 0.5)
      + 0.15 * thumbCurl
      + 0.10 * indexCurl,
    );

    this.previous = { timestampMs: nowMs, imageRatio: image.pinchRatios.left };
    return {
      timestampMs: nowMs,
      imageRatio: image.pinchRatios.left,
      worldRatio: world?.pinchRatios.left ?? null,
      imageDepthGap: fingertipDepthGap(image),
      worldDepthGap: world ? fingertipDepthGap(world) : null,
      approachVelocity,
      thumbCurl,
      indexCurl,
      contactPoseScore,
      frameIntervalMs,
    };
  }

  reset(): void {
    this.previous = null;
  }
}

function fingertipDepthGap(geometry: HandGeometry): number {
  return Math.abs(
    geometry.localLandmarks[THUMB_TIP]!.z - geometry.localLandmarks[INDEX_FINGER_TIP]!.z,
  );
}

function curl(points: Landmark[], indexes: [number, number, number, number]): number {
  const [base, first, second, tip] = indexes;
  const path = landmarkDistance(points[base]!, points[first]!)
    + landmarkDistance(points[first]!, points[second]!)
    + landmarkDistance(points[second]!, points[tip]!);
  if (path <= 1e-9) return 0;
  return clamp01(1 - landmarkDistance(points[base]!, points[tip]!) / path);
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
