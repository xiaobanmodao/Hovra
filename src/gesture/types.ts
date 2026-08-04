export type Landmark = {
  x: number;
  y: number;
  z?: number;
};

export type GestureState =
  | "tracking"
  | "left-pinching"
  | "right-pinching"
  | "double-pinching"
  | "dragging"
  | "scrolling"
  | "paused"
  | "lost";

export type GestureKind = "left" | "right" | "double" | "scroll" | "open-palm";

export type GesturePhase =
  | "neutral"
  | "candidate"
  | "active"
  | "dragging"
  | "releasing"
  | "cooldown"
  | "lost";

export type GestureCandidate = {
  kind: GestureKind;
  score: number;
};

export type GestureOutput = {
  state: GestureState;
  cursor: Landmark | null;
  click: boolean;
  rightClick: boolean;
  doubleClick: boolean;
  scrollY: number;
  dragStart: boolean;
  dragEnd: boolean;
  phase: GesturePhase;
  candidate: GestureKind | null;
  lockedGesture: GestureKind | null;
  confirmationProgress: number;
  diagnostics: GestureDiagnosticsSnapshot;
};

export type GestureDiagnosticsSnapshot = {
  timestampMs: number;
  quality: number;
  palmScale: number | null;
  leftPinchRatio: number | null;
  worldLeftPinchRatio: number | null;
  pinchDepthReliable: boolean;
  rightPinchRatio: number | null;
  doublePinchRatio: number | null;
  openPalmScore: number | null;
  scrollPoseScore: number | null;
};

export type GestureSettings = {
  gestureSensitivity: number;
  openPalmMinTipDistance: number;
  cursorSmoothingFactor: number;
  cursorOffsetX: number;
  cursorOffsetY: number;
  cameraStaleFrameMs: number;
};

export const WRIST = 0;
export const THUMB_CMC = 1;
export const THUMB_MCP = 2;
export const THUMB_IP = 3;
export const THUMB_TIP = 4;
export const INDEX_FINGER_MCP = 5;
export const INDEX_FINGER_TIP = 8;
export const INDEX_FINGER_PIP = 6;
export const INDEX_FINGER_DIP = 7;
export const MIDDLE_FINGER_MCP = 9;
export const MIDDLE_FINGER_TIP = 12;
export const MIDDLE_FINGER_PIP = 10;
export const MIDDLE_FINGER_DIP = 11;
export const RING_FINGER_MCP = 13;
export const RING_FINGER_TIP = 16;
export const RING_FINGER_PIP = 14;
export const RING_FINGER_DIP = 15;
export const PINKY_MCP = 17;
export const PINKY_TIP = 20;
export const PINKY_PIP = 18;
export const PINKY_DIP = 19;
