import { landmarkDistance } from "./landmarkMetrics";
import {
  INDEX_FINGER_MCP,
  INDEX_FINGER_TIP,
  MIDDLE_FINGER_MCP,
  MIDDLE_FINGER_TIP,
  PINKY_MCP,
  RING_FINGER_MCP,
  RING_FINGER_TIP,
  THUMB_TIP,
  WRIST,
  type Landmark,
} from "./types";

export type Vector3 = Required<Landmark>;

export type HandGeometry = {
  sourceLandmarks: Vector3[];
  landmarks: Vector3[];
  localLandmarks: Vector3[];
  origin: Vector3;
  xAxis: Vector3;
  yAxis: Vector3;
  zAxis: Vector3;
  scale: number;
  space: "image" | "world";
  imageAspectRatio: number;
  pinchRatios: { left: number; right: number; double: number };
  projectDelta(delta: Landmark): Vector3;
};

const EPSILON = 1e-6;

export function buildHandGeometry(landmarks: Landmark[] | null): HandGeometry | null {
  return buildGeometry(landmarks, "world", 1);
}

export function buildImageHandGeometry(
  landmarks: Landmark[] | null,
  aspectRatio: number,
): HandGeometry | null {
  return buildGeometry(landmarks, "image", sanitizeAspectRatio(aspectRatio));
}

function buildGeometry(
  landmarks: Landmark[] | null,
  space: "image" | "world",
  imageAspectRatio: number,
): HandGeometry | null {
  if (!landmarks || landmarks.length !== 21 || landmarks.some((point) => !isFiniteLandmark(point))) {
    return null;
  }

  const sourceLandmarks = landmarks.map(toVector);
  const points = space === "image"
    ? sourceLandmarks.map((point) => ({ x: point.x * imageAspectRatio, y: point.y, z: 0 }))
    : sourceLandmarks;
  const wrist = points[WRIST];
  const indexMcp = points[INDEX_FINGER_MCP];
  const middleMcp = points[MIDDLE_FINGER_MCP];
  const ringMcp = points[RING_FINGER_MCP];
  const pinkyMcp = points[PINKY_MCP];
  const origin = average([wrist, indexMcp, middleMcp, ringMcp, pinkyMcp]);

  const xAxis = normalize(subtract(pinkyMcp, indexMcp));
  if (!xAxis) {
    return null;
  }
  const rawY = subtract(middleMcp, wrist);
  const orthogonalY = subtract(rawY, multiply(xAxis, dot(rawY, xAxis)));
  const yAxis = normalize(orthogonalY);
  if (!yAxis) {
    return null;
  }
  const zAxis = normalize(cross(xAxis, yAxis));
  if (!zAxis) {
    return null;
  }

  const palmWidth = landmarkDistance(indexMcp, pinkyMcp);
  const palmLength = landmarkDistance(wrist, middleMcp);
  const scale = space === "image"
    ? Math.max(palmWidth, palmLength)
    : (palmWidth + palmLength) / 2;
  if (!Number.isFinite(scale) || scale <= EPSILON) {
    return null;
  }

  const projectDelta = (delta: Landmark): Vector3 => {
    const vector = toVector(delta);
    return {
      x: dot(vector, xAxis) / scale,
      y: dot(vector, yAxis) / scale,
      z: dot(vector, zAxis) / scale,
    };
  };
  const localLandmarks = points.map((point) => projectDelta(subtract(point, origin)));
  const thumb = points[THUMB_TIP];

  return {
    sourceLandmarks,
    landmarks: points,
    localLandmarks,
    origin,
    xAxis,
    yAxis,
    zAxis,
    scale,
    space,
    imageAspectRatio,
    pinchRatios: {
      left: landmarkDistance(thumb, points[INDEX_FINGER_TIP]) / scale,
      right: landmarkDistance(thumb, points[MIDDLE_FINGER_TIP]) / scale,
      double: landmarkDistance(thumb, points[RING_FINGER_TIP]) / scale,
    },
    projectDelta,
  };
}

function sanitizeAspectRatio(aspectRatio: number): number {
  return Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : 1;
}

function isFiniteLandmark(point: Landmark | undefined): point is Landmark {
  if (!point) {
    return false;
  }

  return Number.isFinite(point.x)
    && Number.isFinite(point.y)
    && (point.z === undefined || Number.isFinite(point.z));
}

function toVector(point: Landmark): Vector3 {
  return { x: point.x, y: point.y, z: point.z ?? 0 };
}

function subtract(first: Landmark, second: Landmark): Vector3 {
  return {
    x: first.x - second.x,
    y: first.y - second.y,
    z: (first.z ?? 0) - (second.z ?? 0),
  };
}

function multiply(vector: Vector3, scalar: number): Vector3 {
  return { x: vector.x * scalar, y: vector.y * scalar, z: vector.z * scalar };
}

function dot(first: Vector3, second: Vector3): number {
  return first.x * second.x + first.y * second.y + first.z * second.z;
}

function cross(first: Vector3, second: Vector3): Vector3 {
  return {
    x: first.y * second.z - first.z * second.y,
    y: first.z * second.x - first.x * second.z,
    z: first.x * second.y - first.y * second.x,
  };
}

function normalize(vector: Vector3): Vector3 | null {
  const length = Math.hypot(vector.x, vector.y, vector.z);
  return length <= EPSILON ? null : multiply(vector, 1 / length);
}

function average(vectors: Vector3[]): Vector3 {
  const total = vectors.reduce(
    (sum, vector) => ({ x: sum.x + vector.x, y: sum.y + vector.y, z: sum.z + vector.z }),
    { x: 0, y: 0, z: 0 },
  );
  return multiply(total, 1 / vectors.length);
}
