import {
  INDEX_FINGER_TIP,
  THUMB_TIP,
  type Landmark,
} from "./types";

export const landmarkDistance = (first: Landmark, second: Landmark): number =>
  Math.hypot(first.x - second.x, first.y - second.y, (first.z ?? 0) - (second.z ?? 0));

export const imageLandmarkDistance = (
  first: Landmark,
  second: Landmark,
  aspectRatio: number,
): number => {
  const safeAspectRatio = Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : 1;
  return Math.hypot((first.x - second.x) * safeAspectRatio, first.y - second.y);
};

export function thumbIndexDistance(landmarks: Landmark[] | null): number | null {
  const thumb = landmarks?.[THUMB_TIP];
  const index = landmarks?.[INDEX_FINGER_TIP];

  return thumb && index ? landmarkDistance(thumb, index) : null;
}
