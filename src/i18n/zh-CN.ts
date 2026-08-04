import type { GestureKind, GesturePhase, GestureState } from "../gesture/types";

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
