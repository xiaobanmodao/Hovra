import {
  INDEX_FINGER_TIP,
  THUMB_TIP,
  type Landmark,
} from "./types";

export const landmarkDistance = (first: Landmark, second: Landmark): number =>
  Math.hypot(first.x - second.x, first.y - second.y, (first.z ?? 0) - (second.z ?? 0));

export function thumbIndexDistance(landmarks: Landmark[] | null): number | null {
  const thumb = landmarks?.[THUMB_TIP];
  const index = landmarks?.[INDEX_FINGER_TIP];

  return thumb && index ? landmarkDistance(thumb, index) : null;
}
