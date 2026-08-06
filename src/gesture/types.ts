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
  /** 短按释放或长按开始时使用的捏合前锁定坐标。 */
  clickCursor?: Landmark | null;
  /** 与本帧点击状态机完全一致的数值证据，供本地离线重放使用。 */
  intentEvidence?: import("./pinchClickStateMachine").PinchClickEvidence | null;
  rightClick: boolean;
  doubleClick: boolean;
  scrollY: number;
  dragStart: boolean;
  dragEnd: boolean;
  phase: GesturePhase;
  candidate: GestureKind | null;
  lockedGesture: GestureKind | null;
  confirmationProgress: number;
  longPressProgress: number;
  diagnostics: GestureDiagnosticsSnapshot;
};

export type GestureDiagnosticsSnapshot = {
  timestampMs: number;
  quality: number;
  trackingSource: import("./handTrackingStabilizer").TrackingSource;
  trackingQuality: number;
  rejectedLandmarkCount: number;
  palmScale: number | null;
  screenPinchGap: number | null;
  imageAspectRatio: number;
  worldPalmScale: number | null;
  palmFacingScore: number | null;
  leftPinchRatio: number | null;
  worldLeftPinchRatio: number | null;
  pinchDepthReliable: boolean;
  rightPinchRatio: number | null;
  doublePinchRatio: number | null;
  openPalmScore: number | null;
  scrollPoseScore: number | null;
  pinchProbability: number | null;
  pinchImageDepthGap: number | null;
  pinchWorldQuality: number;
  pinchQualityReasons: import("./pinchQuality").PinchQualityReason[];
  pinchBlockingReason: import("./pinchProbability").PinchBlockingReason | null;
  pinchEnterVotes: number;
  pinchRequiredVotes: number;
  effectiveFps: number | null;
  inferenceMs: number | null;
  pinchModelMode: "mediapipe" | "dual";
  visionPinchRatio: number | null;
  visionConfidence: number | null;
  visionAgeMs: number | null;
  visionInferenceMs: number | null;
  modelAgreement: boolean | null;
  /** 同帧、宽高比修正后的二维拇指—食指距离与掌部尺度之比。 */
  pinchScreenRatio?: number | null;
  /** 同帧 MediaPipe 归一化三维指尖距离与掌部尺度之比。 */
  pinchSpatialRatio?: number | null;
  /** 稳定内核进入接触状态的严格阈值。 */
  pinchEnterRatio?: number | null;
  /** 稳定内核重新武装点击的释放阈值。 */
  pinchExitRatio?: number | null;
  /** 整只手的归一化移动速度，用于高速防误触。 */
  cursorSpeed?: number | null;
  /** 点击状态机给出的最终阻止原因。 */
  clickBlockingReason?: import("./pinchClickStateMachine").ClickBlockingReason | null;
  /** 四指均折回掌心时为真，只用于阻止点击，不会触发张掌暂停。 */
  fistCandidate?: boolean;
};

export type GestureSettings = {
  gestureSensitivity: number;
  openPalmMinTipDistance: number;
  cursorSmoothingFactor: number;
  cursorOffsetX: number;
  cursorOffsetY: number;
  cameraStaleFrameMs: number;
  pinchEnterRatio?: number;
  pinchExitRatio?: number;
  pinchContactFrames?: number;
  pinchReleaseFrames?: number;
  maxClickSpeed?: number;
  maxClickTravel?: number;
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
