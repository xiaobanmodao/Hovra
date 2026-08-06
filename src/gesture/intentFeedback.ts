import type { PinchClickEvidence } from "./pinchClickStateMachine";
import type { Landmark } from "./types";

export type IntentLabel = "unlabeled" | "intentional" | "false-positive";

export type IntentFeedbackFrame = {
  t: number;
  evidence: PinchClickEvidence | null;
  clicked: boolean;
  pinchRatio: number | null;
};

export type IntentFeedbackEvent = {
  id: string;
  clickedAt: number;
  clickCursor: Landmark;
  label: IntentLabel;
  frames: IntentFeedbackFrame[];
};

export type IntentFeedbackOptions = {
  maxEvents: number;
  maxFramesPerEvent: number;
  preClickMs: number;
  postClickMs: number;
};

export type IntentFeedbackState = {
  events: IntentFeedbackEvent[];
  recentFrames: IntentFeedbackFrame[];
  nextId: number;
  options: IntentFeedbackOptions;
};

const DEFAULT_OPTIONS: IntentFeedbackOptions = {
  maxEvents: 60,
  maxFramesPerEvent: 90,
  preClickMs: 800,
  postClickMs: 250,
};

export function createIntentFeedbackState(
  options: Partial<IntentFeedbackOptions> = {},
  events: IntentFeedbackEvent[] = [],
): IntentFeedbackState {
  const resolved = resolveOptions(options);
  return {
    events: events.slice(-resolved.maxEvents).map(cloneEvent),
    recentFrames: [],
    nextId: events.length,
    options: resolved,
  };
}

export function recordIntentFrame(
  state: IntentFeedbackState,
  frame: IntentFeedbackFrame,
  clickCursor: Landmark | null = null,
): IntentFeedbackState {
  if (!isValidFrame(frame)) return state;

  const recentFrames = [...state.recentFrames, cloneFrame(frame)]
    .filter((candidate) => candidate.t >= frame.t - state.options.preClickMs)
    .slice(-state.options.maxFramesPerEvent);
  let changed = false;
  let events = state.events.map((event) => {
    if (frame.t <= event.clickedAt || frame.t > event.clickedAt + state.options.postClickMs) {
      return event;
    }
    changed = true;
    return {
      ...event,
      frames: [...event.frames, cloneFrame(frame)].slice(-state.options.maxFramesPerEvent),
    };
  });
  let nextId = state.nextId;

  if (frame.clicked && clickCursor && isFiniteLandmark(clickCursor)) {
    const event: IntentFeedbackEvent = {
      id: `click-${Math.round(frame.t)}-${nextId}`,
      clickedAt: frame.t,
      clickCursor: { ...clickCursor },
      label: "unlabeled",
      frames: recentFrames.map(cloneFrame),
    };
    nextId += 1;
    events = [...events, event].slice(-state.options.maxEvents);
    changed = true;
  }

  return {
    ...state,
    recentFrames,
    events: changed ? events : state.events,
    nextId,
  };
}

export function labelIntentEvent(
  state: IntentFeedbackState,
  id: string,
  label: Exclude<IntentLabel, "unlabeled">,
): IntentFeedbackState {
  const index = state.events.findIndex((event) => event.id === id);
  if (index < 0) return state;
  const events = state.events.slice();
  events[index] = { ...events[index]!, label };
  return { ...state, events };
}

export function intentFeedbackCounts(events: IntentFeedbackEvent[]): {
  intentional: number;
  falsePositive: number;
  unlabeled: number;
} {
  return events.reduce((counts, event) => {
    if (event.label === "intentional") counts.intentional += 1;
    else if (event.label === "false-positive") counts.falsePositive += 1;
    else counts.unlabeled += 1;
    return counts;
  }, { intentional: 0, falsePositive: 0, unlabeled: 0 });
}

export function serializeIntentFeedback(events: IntentFeedbackEvent[]): string {
  return JSON.stringify({ version: 1, events: events.map(cloneEvent) });
}

export function parseIntentFeedback(serialized: string | null): IntentFeedbackEvent[] {
  if (!serialized) return [];
  try {
    const parsed = JSON.parse(serialized) as { version?: unknown; events?: unknown };
    if (parsed.version !== 1 || !Array.isArray(parsed.events)) return [];
    return parsed.events.filter(isValidEvent).slice(-DEFAULT_OPTIONS.maxEvents).map(cloneEvent);
  } catch {
    return [];
  }
}

function resolveOptions(options: Partial<IntentFeedbackOptions>): IntentFeedbackOptions {
  return {
    maxEvents: integer(options.maxEvents, 1, 500, DEFAULT_OPTIONS.maxEvents),
    maxFramesPerEvent: integer(options.maxFramesPerEvent, 3, 300, DEFAULT_OPTIONS.maxFramesPerEvent),
    preClickMs: range(options.preClickMs, 0, 5_000, DEFAULT_OPTIONS.preClickMs),
    postClickMs: range(options.postClickMs, 0, 2_000, DEFAULT_OPTIONS.postClickMs),
  };
}

function cloneEvent(event: IntentFeedbackEvent): IntentFeedbackEvent {
  return {
    ...event,
    clickCursor: { ...event.clickCursor },
    frames: event.frames.map(cloneFrame),
  };
}

function cloneFrame(frame: IntentFeedbackFrame): IntentFeedbackFrame {
  return {
    ...frame,
    evidence: frame.evidence ? {
      ...frame.evidence,
      cursor: { ...frame.evidence.cursor },
      motionCursor: { ...frame.evidence.motionCursor },
    } : null,
  };
}

function isValidEvent(value: unknown): value is IntentFeedbackEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Partial<IntentFeedbackEvent>;
  return typeof event.id === "string"
    && Number.isFinite(event.clickedAt)
    && isFiniteLandmark(event.clickCursor)
    && (event.label === "unlabeled" || event.label === "intentional" || event.label === "false-positive")
    && Array.isArray(event.frames)
    && event.frames.length <= DEFAULT_OPTIONS.maxFramesPerEvent
    && event.frames.every(isValidFrame);
}

function isValidFrame(value: unknown): value is IntentFeedbackFrame {
  if (!value || typeof value !== "object") return false;
  const frame = value as Partial<IntentFeedbackFrame>;
  return Number.isFinite(frame.t)
    && typeof frame.clicked === "boolean"
    && (frame.pinchRatio === null || Number.isFinite(frame.pinchRatio))
    && (frame.evidence === null || isValidEvidence(frame.evidence));
}

function isValidEvidence(value: unknown): value is PinchClickEvidence {
  if (!value || typeof value !== "object") return false;
  const evidence = value as Partial<PinchClickEvidence>;
  return typeof evidence.contact === "boolean"
    && typeof evidence.separated === "boolean"
    && typeof evidence.suppressed === "boolean"
    && typeof evidence.blockingReason === "string"
    && isFiniteLandmark(evidence.cursor)
    && isFiniteLandmark(evidence.motionCursor);
}

function isFiniteLandmark(value: unknown): value is Landmark {
  if (!value || typeof value !== "object") return false;
  const point = value as Landmark;
  return Number.isFinite(point.x)
    && Number.isFinite(point.y)
    && (point.z === undefined || Number.isFinite(point.z));
}

function integer(value: number | undefined, min: number, max: number, fallback: number): number {
  return value !== undefined && Number.isInteger(value) && value >= min && value <= max ? value : fallback;
}

function range(value: number | undefined, min: number, max: number, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value >= min && value <= max ? value : fallback;
}

