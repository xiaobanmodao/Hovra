import { parseGestureTrace, type GestureTrace } from "./gestureTrace";
import type { Landmark } from "./types";

export function replayGestureTrace<T>(
  trace: GestureTrace,
  process: (landmarks: Landmark[] | null, nowMs: number) => T,
): T[] {
  const validated = parseGestureTrace(JSON.stringify(trace));
  return validated.frames.map((frame) => process(frame.landmarks, frame.t));
}
