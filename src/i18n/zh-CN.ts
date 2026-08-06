import type { GestureKind, GesturePhase, GestureState } from "../gesture/types";
import type { PinchBlockingReason } from "../gesture/pinchProbability";
import type { ClickBlockingReason } from "../gesture/pinchClickStateMachine";
import type { PinchQualityReason } from "../gesture/pinchQuality";

const gestureStates: Record<GestureState, string> = {
  tracking: "跟踪中",
  "left-pinching": "左键捏合",
  "right-pinching": "右键捏合",
  "double-pinching": "双击捏合",
  dragging: "拖动中",
  scrolling: "滚动中",
  paused: "已暂停",
  lost: "未检测到手部",
};

const gesturePhases: Record<GesturePhase, string> = {
  neutral: "空闲",
  candidate: "候选确认",
  active: "已确认",
  dragging: "拖动中",
  releasing: "释放确认",
  cooldown: "冷却中",
  lost: "未检测到手部",
};

const gestureKinds: Record<GestureKind, string> = {
  left: "左键",
  right: "右键",
  double: "双击",
  scroll: "滚动",
  "open-palm": "张开手掌",
};

export function gestureStateLabel(state: GestureState): string {
  return gestureStates[state];
}

export function gesturePhaseLabel(phase: GesturePhase): string {
  return gesturePhases[phase];
}

export function gestureKindLabel(kind: GestureKind | null): string {
  return kind === null ? "—" : gestureKinds[kind];
}

const pinchQualityReasons: Record<PinchQualityReason, string> = {
  "world-missing": "世界坐标缺失",
  "stale-frame": "视频帧已过期",
  "scale-jump": "手掌尺度突变",
  "bone-jitter": "掌骨坐标抖动",
  "ratio-jitter": "比例抖动",
};

const pinchBlockingReasons: Record<PinchBlockingReason, string> = {
  none: "无",
  image: "画面指尖距离过大",
  depth: "指尖在画面中重合，但纵深仍分离",
  pose: "手指姿态不像真实接触",
  approach: "尚未观察到靠近过程",
  vision: "原生手部模型判定指尖尚未接触",
};

export function pinchQualityReasonLabel(reason: PinchQualityReason): string {
  return pinchQualityReasons[reason];
}

export function pinchBlockingReasonLabel(reason: PinchBlockingReason): string {
  return pinchBlockingReasons[reason];
}

const clickSafetyReasons: Partial<Record<ClickBlockingReason, string>> = {
  "high-speed": "移动过快，已阻止点击",
  travel: "移动范围过大，已阻止点击",
  timeout: "捏合时间过长，请重新操作",
  suppressed: "张掌、握拳或冷却期间禁止点击",
  "tracking-gap": "跟踪中断，需稳定后重新操作",
};

export function clickBlockingReasonLabel(reason: ClickBlockingReason): string {
  return clickSafetyReasons[reason] ?? pinchBlockingReasonLabel(reason as PinchBlockingReason);
}
