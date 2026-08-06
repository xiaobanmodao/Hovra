import { GestureEngine } from "./gestureEngine";
import { replayGestureTrace } from "./gestureReplay";
import { parseGestureTrace, type GestureTrace } from "./gestureTrace";

export type GestureRegressionEventKind =
  | "click"
  | "rightClick"
  | "dragStart"
  | "dragEnd"
  | "pause";

export type GestureRegressionEvent = {
  event: GestureRegressionEventKind;
  t: number;
};

export type GestureRegressionExpectation = {
  event: GestureRegressionEventKind;
  startMs: number;
  endMs: number;
  minCount?: number;
  maxCount?: number;
};

export type GestureRegressionCase = {
  name: string;
  trace: GestureTrace;
  expectations: GestureRegressionExpectation[];
};

export type GestureRegressionFailure = {
  code: "count" | "unexpected";
  message: string;
};

export type GestureRegressionReport = {
  name: string;
  passed: boolean;
  events: GestureRegressionEvent[];
  failures: GestureRegressionFailure[];
};

type ValidatedExpectation = Required<GestureRegressionExpectation>;

export function runGestureRegression(
  testCase: GestureRegressionCase,
): GestureRegressionReport {
  const trace = parseGestureTrace(JSON.stringify(testCase.trace));
  const engine = new GestureEngine();
  const outputs = replayGestureTrace(
    trace,
    (landmarks, worldLandmarks, nowMs, imageAspectRatio) => engine.update(
      landmarks,
      nowMs,
      worldLandmarks,
      null,
      imageAspectRatio,
    ),
  );
  const events: GestureRegressionEvent[] = [];
  let wasPaused = false;

  outputs.forEach((output, index) => {
    const t = trace.frames[index]!.t;
    if (output.click) events.push({ event: "click", t });
    if (output.rightClick) events.push({ event: "rightClick", t });
    if (output.dragStart) events.push({ event: "dragStart", t });
    if (output.dragEnd) events.push({ event: "dragEnd", t });
    if (output.state === "paused" && !wasPaused) {
      events.push({ event: "pause", t });
    }
    wasPaused = output.state === "paused";
  });

  return evaluateGestureEvents(testCase, events);
}

export function evaluateGestureEvents(
  testCase: GestureRegressionCase,
  actualEvents: GestureRegressionEvent[],
): GestureRegressionReport {
  const expectations = validateExpectations(testCase.expectations);
  const events = [...actualEvents].sort(compareEvents);
  const consumed = new Set<number>();
  const failures: GestureRegressionFailure[] = [];

  for (const expectation of expectations) {
    const matched = events.flatMap((event, index) => (
      event.event === expectation.event
      && event.t >= expectation.startMs
      && event.t <= expectation.endMs
        ? [index]
        : []
    ));
    matched.forEach((index) => consumed.add(index));

    if (matched.length < expectation.minCount || matched.length > expectation.maxCount) {
      const required = expectation.minCount === expectation.maxCount
        ? `${expectation.minCount}`
        : `${expectation.minCount}–${expectation.maxCount}`;
      failures.push({
        code: "count",
        message: `${testCase.name}：${expectation.event} 在 ${expectation.startMs}–${expectation.endMs} 毫秒内需要 ${required} 次，实际 ${matched.length} 次`,
      });
    }
  }

  events.forEach((event, index) => {
    if (!consumed.has(index)) {
      failures.push({
        code: "unexpected",
        message: `${testCase.name}：${event.t} 毫秒出现未允许的 ${event.event}`,
      });
    }
  });

  return {
    name: testCase.name,
    passed: failures.length === 0,
    events,
    failures,
  };
}

function validateExpectations(
  expectations: GestureRegressionExpectation[],
): ValidatedExpectation[] {
  const validated = expectations.map((expectation) => {
    if (!Number.isFinite(expectation.startMs) || !Number.isFinite(expectation.endMs)) {
      throw new TypeError("Gesture regression expectation times must be finite");
    }
    if (expectation.startMs > expectation.endMs) {
      throw new TypeError("Gesture regression expectation times must be ordered");
    }
    const minCount = expectation.minCount ?? 1;
    const maxCount = expectation.maxCount ?? 1;
    if (
      !Number.isInteger(minCount)
      || minCount < 0
      || !Number.isInteger(maxCount)
      || maxCount < 0
    ) {
      throw new TypeError("Gesture regression expectation counts must be non-negative integers");
    }
    if (minCount > maxCount) {
      throw new TypeError("Gesture regression minimum count must not exceed maximum count");
    }
    return { ...expectation, minCount, maxCount };
  }).sort((left, right) => (
    left.startMs - right.startMs
    || left.endMs - right.endMs
    || left.event.localeCompare(right.event)
  ));

  for (let index = 0; index < validated.length; index += 1) {
    const current = validated[index]!;
    const nextOfSameKind = validated.slice(index + 1).find(
      (expectation) => expectation.event === current.event,
    );
    if (nextOfSameKind && nextOfSameKind.startMs <= current.endMs) {
      throw new TypeError(
        `Gesture regression expectation windows for ${current.event} must not overlap`,
      );
    }
  }

  return validated;
}

function compareEvents(left: GestureRegressionEvent, right: GestureRegressionEvent): number {
  return left.t - right.t || left.event.localeCompare(right.event);
}
