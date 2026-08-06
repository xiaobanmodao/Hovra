import type { ClickBlockingReason } from "./pinchClickStateMachine";
import type { GestureKind, GesturePhase, GestureState, Landmark } from "./types";

export type HandOverlayState = {
  phase: GesturePhase;
  blockingReason: ClickBlockingReason | null;
  state?: GestureState;
  gesture?: GestureKind | null;
};

export type HandOverlayPoint = Required<Landmark> & { index: number };

export type HandOverlayBone = {
  from: number;
  to: number;
  depth: number;
  width: number;
  opacity: number;
};

export type HandOverlayJoint = {
  index: number;
  point: HandOverlayPoint;
  depth: number;
  radius: number;
  role: "thumb-tip" | "index-tip" | "joint";
};

export type HandOverlayModel = {
  points: HandOverlayPoint[];
  palm: { indices: readonly [0, 5, 9, 13, 17]; depth: number };
  palmScale: number;
  bones: HandOverlayBone[];
  joints: HandOverlayJoint[];
  pinchBridge: { from: 4; to: 8; state: "ready" | "active" | "blocked" } | null;
  statusLabel: string;
  depthReliable: boolean;
};

export const HAND_OVERLAY_CONNECTIONS: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
];

const PALM_INDICES = [0, 5, 9, 13, 17] as const;
const EPSILON = 1e-6;

export function buildHandOverlayModel(
  landmarks: Landmark[] | null,
  worldLandmarks: Landmark[] | null = null,
  overlayState: HandOverlayState = { phase: "neutral", blockingReason: null },
): HandOverlayModel | null {
  if (!isValidHand(landmarks)) return null;
  const palmScale = distance2(landmarks[5]!, landmarks[17]!);
  if (!Number.isFinite(palmScale) || palmScale <= EPSILON) return null;

  const depthReliable = isValidHand(worldLandmarks);
  const depthSource = depthReliable ? worldLandmarks : landmarks;
  const depthValues = depthSource.map((point) => point.z ?? 0);
  const minDepth = Math.min(...depthValues);
  const maxDepth = Math.max(...depthValues);
  const depthRange = Math.max(EPSILON, maxDepth - minDepth);
  const points: HandOverlayPoint[] = landmarks.map((point, index) => ({
    x: point.x,
    y: point.y,
    z: depthValues[index] ?? 0,
    index,
  }));
  const normalizedDepth = (index: number) => ((depthValues[index] ?? 0) - minDepth) / depthRange;
  const bones = HAND_OVERLAY_CONNECTIONS.map(([from, to]) => {
    const depth = (normalizedDepth(from) + normalizedDepth(to)) / 2;
    return {
      from,
      to,
      depth,
      width: palmScale * boneWidthRatio(to),
      opacity: depthReliable ? 0.48 + (1 - depth) * 0.42 : 0.76,
    };
  }).sort((first, second) => second.depth - first.depth);
  const joints = points.map((point, index) => ({
    index,
    point,
    depth: normalizedDepth(index),
    radius: palmScale * jointRadiusRatio(index),
    role: index === 4 ? "thumb-tip" as const : index === 8 ? "index-tip" as const : "joint" as const,
  })).sort((first, second) => second.depth - first.depth);
  const palmDepth = PALM_INDICES.reduce<number>(
    (sum, index) => sum + normalizedDepth(index),
    0,
  ) / PALM_INDICES.length;
  const scrollIntent = overlayState.gesture === "scroll" || overlayState.state === "scrolling";
  const bridgeVisible = !scrollIntent && (overlayState.phase === "candidate"
    || overlayState.phase === "active"
    || overlayState.phase === "dragging"
    || overlayState.phase === "releasing");
  const blocked = overlayState.blockingReason !== null
    && overlayState.blockingReason !== "none"
    && overlayState.blockingReason !== "image";

  return {
    points,
    palm: { indices: PALM_INDICES, depth: palmDepth },
    palmScale,
    bones,
    joints,
    pinchBridge: bridgeVisible ? {
      from: 4,
      to: 8,
      state: blocked ? "blocked" : overlayState.phase === "active"
        || overlayState.phase === "dragging"
        || overlayState.phase === "releasing"
        ? "active" : "ready",
    } : null,
    statusLabel: overlayStatusLabel(overlayState),
    depthReliable,
  };
}

function boneWidthRatio(to: number): number {
  if ([5, 9, 13, 17].includes(to)) return 0.2;
  if ([1, 6, 10, 14, 18].includes(to)) return 0.16;
  if ([2, 7, 11, 15, 19].includes(to)) return 0.13;
  if ([3, 8, 12, 16, 20].includes(to)) return 0.1;
  return 0.085;
}

function jointRadiusRatio(index: number): number {
  if (index === 4 || index === 8) return 0.14;
  if (PALM_INDICES.includes(index as 0 | 5 | 9 | 13 | 17)) return 0.12;
  return 0.09;
}

function overlayStatusLabel(state: HandOverlayState): string {
  if (state.state === "lost") return "未检测到手部";
  if (state.state === "paused") return "张开手掌：控制已停止";
  if (state.gesture === "scroll" && state.phase === "candidate") return "双指滚动候选：保持姿势";
  if (state.state === "scrolling" && state.phase === "releasing") return "正在退出双指滚动";
  if (state.gesture === "scroll" || state.state === "scrolling") return "双指滚动中：上下移动手掌";
  if (state.blockingReason === "high-speed") return "移动过快：本次不会点击";
  if (state.blockingReason === "travel") return "移动范围过大：本次不会点击";
  if (state.blockingReason === "timeout") return "捏合时间过长：请重新操作";
  if (state.blockingReason === "suppressed") return "防误触冷却中";
  if (state.blockingReason === "depth") return "指尖仅在画面重合，纵深未接触";
  if (state.phase === "candidate") return "捏合候选：保持稳定后释放";
  if (state.phase === "active") return "已捏合：松开以点击";
  if (state.phase === "dragging") return "长按中：松开以释放";
  if (state.phase === "releasing") return "正在确认释放";
  if (state.phase === "cooldown") return "防误触冷却中";
  return "移动食指控制光标";
}

function isValidHand(points: Landmark[] | null): points is Landmark[] {
  return points?.length === 21 && points.every((point) => Number.isFinite(point.x)
    && Number.isFinite(point.y)
    && (point.z === undefined || Number.isFinite(point.z)));
}

function distance2(first: Landmark, second: Landmark): number {
  return Math.hypot(first.x - second.x, first.y - second.y);
}
