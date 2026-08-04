import { GestureEngine } from "./gestureEngine";
import { DEFAULT_GESTURE_SETTINGS } from "./config";
import {
  INDEX_FINGER_TIP,
  MIDDLE_FINGER_TIP,
  PINKY_TIP,
  RING_FINGER_TIP,
  THUMB_TIP,
  WRIST,
  type Landmark,
} from "./types";

const landmarks = (): Landmark[] => Array.from({ length: 21 }, () => ({ x: 0, y: 0 }));

const handWithTips = (thumb: Landmark, index: Landmark, middle: Landmark): Landmark[] => {
  const hand = landmarks();
  hand[WRIST] = { x: 0, y: 0 };
  hand[THUMB_TIP] = thumb;
  hand[INDEX_FINGER_TIP] = index;
  hand[MIDDLE_FINGER_TIP] = middle;
  hand[RING_FINGER_TIP] = { x: 0.4, y: 0.4 };
  hand[PINKY_TIP] = { x: 0.5, y: 0.5 };
  return hand;
};

const openHand = (): Landmark[] => {
  const hand = handWithTips({ x: 0.3, y: 0 }, { x: 0.3, y: 0.1 }, { x: 0.2, y: 0.2 });
  hand[RING_FINGER_TIP] = { x: 0.25, y: 0.15 };
  hand[PINKY_TIP] = { x: 0.15, y: 0.25 };
  return hand;
};

const trackingHand = (): Landmark[] => handWithTips(
  { x: 0, y: 0 },
  { x: 0.2, y: 0 },
  { x: 0.12, y: 0 },
);

const pinchedHand = (): Landmark[] => handWithTips(
  { x: 0, y: 0 },
  { x: 0.03, y: 0 },
  { x: 0.12, y: 0 },
);

const handWithPinchDistance = (distance: number): Landmark[] => handWithTips(
  { x: 0, y: 0 },
  { x: distance, y: 0 },
  { x: 0.2, y: 0 },
);

const multiGestureHand = (
  target: "tracking" | "left" | "right" | "double",
): Landmark[] => {
  const hand = landmarks();
  hand[WRIST] = { x: 0.5, y: 0.8 };
  hand[THUMB_TIP] = { x: 0.4, y: 0.5 };
  hand[INDEX_FINGER_TIP] = target === "left"
    ? { x: 0.425, y: 0.5 }
    : { x: 0.6, y: 0.5 };
  hand[MIDDLE_FINGER_TIP] = target === "right"
    ? { x: 0.425, y: 0.5 }
    : { x: 0.65, y: 0.52 };
  hand[RING_FINGER_TIP] = target === "double"
    ? { x: 0.425, y: 0.5 }
    : { x: 0.7, y: 0.55 };
  hand[PINKY_TIP] = { x: 0.5, y: 0.75 };
  return hand;
};

const scrollHand = (verticalOffset = 0): Landmark[] => {
  const hand = landmarks();
  hand[WRIST] = { x: 0.5, y: 0.8 + verticalOffset };
  hand[THUMB_TIP] = { x: 0.3, y: 0.6 + verticalOffset };
  hand[6] = { x: 0.45, y: 0.58 + verticalOffset };
  hand[INDEX_FINGER_TIP] = { x: 0.45, y: 0.32 + verticalOffset };
  hand[10] = { x: 0.55, y: 0.58 + verticalOffset };
  hand[MIDDLE_FINGER_TIP] = { x: 0.55, y: 0.32 + verticalOffset };
  hand[14] = { x: 0.6, y: 0.58 + verticalOffset };
  hand[RING_FINGER_TIP] = { x: 0.6, y: 0.68 + verticalOffset };
  hand[18] = { x: 0.68, y: 0.6 + verticalOffset };
  hand[PINKY_TIP] = { x: 0.68, y: 0.7 + verticalOffset };
  return hand;
};

it("uses injected pinch and drag thresholds without mutating them", () => {
  const settings = {
    ...DEFAULT_GESTURE_SETTINGS,
    pinchDistance: 0.1,
    dragHoldMs: 600,
  };
  const engine = new GestureEngine(settings);

  expect(engine.update(handWithPinchDistance(0.08), 0).state).toBe("left-pinching");
  expect(engine.update(handWithPinchDistance(0.08), 500).dragStart).toBe(false);
  expect(engine.update(handWithPinchDistance(0.08), 600).dragStart).toBe(true);
  expect(settings).toEqual({
    ...DEFAULT_GESTURE_SETTINGS,
    pinchDistance: 0.1,
    dragHoldMs: 600,
  });
});

it("clicks when a short pinch using non-default settings is released", () => {
  const engine = new GestureEngine({
    ...DEFAULT_GESTURE_SETTINGS,
    pinchDistance: 0.1,
    dragHoldMs: 600,
  });

  engine.update(handWithPinchDistance(0.08), 0);
  const release = engine.update(trackingHand(), 500);

  expect(release.state).toBe("tracking");
  expect(release.click).toBe(true);
  expect(release.dragEnd).toBe(false);
});

it("uses the shared three-dimensional pinch metric for thresholding", () => {
  const hand = handWithTips(
    { x: 0, y: 0, z: 0 },
    { x: 0.04, y: 0, z: 0.04 },
    { x: 0.15, y: 0 },
  );

  const strictEngine = new GestureEngine({
    ...DEFAULT_GESTURE_SETTINGS,
    pinchDistance: 0.055,
  });
  const permissiveEngine = new GestureEngine({
    ...DEFAULT_GESTURE_SETTINGS,
    pinchDistance: 0.06,
  });

  expect(strictEngine.update(hand, 0).state).toBe("tracking");
  expect(permissiveEngine.update(hand, 0).state).toBe("left-pinching");
});

it("transitions between paused, tracking, pinching, clicking, dragging, and lost", () => {
  const engine = new GestureEngine();

  expect(engine.update(openHand(), 0).state).toBe("paused");
  expect(engine.update(trackingHand(), 16).state).toBe("tracking");
  expect(engine.update(pinchedHand(), 32).state).toBe("left-pinching");
  expect(engine.update(trackingHand(), 64).click).toBe(true);
  expect(engine.update(pinchedHand(), 100).dragStart).toBe(false);
  expect(engine.update(pinchedHand(), 550).dragStart).toBe(true);
  expect(engine.update(null, 570).dragEnd).toBe(true);
});

it("clicks when a pinch is released into an open palm", () => {
  const engine = new GestureEngine();

  engine.update(pinchedHand(), 0);
  const release = engine.update(openHand(), 16);

  expect(release.state).toBe("paused");
  expect(release.click).toBe(true);
  expect(release.dragEnd).toBe(false);
});

it("ends a drag without clicking when released into tracking or an open palm", () => {
  const engine = new GestureEngine();

  engine.update(pinchedHand(), 0);
  engine.update(pinchedHand(), 350);
  const trackingRelease = engine.update(trackingHand(), 366);

  expect(trackingRelease.state).toBe("tracking");
  expect(trackingRelease.click).toBe(false);
  expect(trackingRelease.dragEnd).toBe(true);

  engine.update(pinchedHand(), 400);
  engine.update(pinchedHand(), 750);
  const openPalmRelease = engine.update(openHand(), 766);

  expect(openPalmRelease.state).toBe("paused");
  expect(openPalmRelease.click).toBe(false);
  expect(openPalmRelease.dragEnd).toBe(true);
});

it("reports the matching pinch state on its first recognized frame", () => {
  const cases = [
    ["left", "left-pinching"],
    ["right", "right-pinching"],
    ["double", "double-pinching"],
  ] as const;

  for (const [gesture, expectedState] of cases) {
    const engine = new GestureEngine();
    const output = engine.update(multiGestureHand(gesture), 0);

    expect(output.state).toBe(expectedState);
    expect(output.click).toBe(false);
    expect(output.rightClick).toBe(false);
    expect(output.doubleClick).toBe(false);
  }
});

it("emits exactly one action when each short pinch is released", () => {
  const cases = [
    ["left", { click: true, rightClick: false, doubleClick: false }],
    ["right", { click: false, rightClick: true, doubleClick: false }],
    ["double", { click: false, rightClick: false, doubleClick: true }],
  ] as const;

  for (const [gesture, expected] of cases) {
    const engine = new GestureEngine();
    engine.update(multiGestureHand(gesture), 0);
    const release = engine.update(multiGestureHand("tracking"), 100);

    expect(release).toMatchObject(expected);
    expect(engine.update(multiGestureHand("tracking"), 116)).toMatchObject({
      click: false,
      rightClick: false,
      doubleClick: false,
    });
  }
});

it("allows only the left pinch to become a drag", () => {
  const left = new GestureEngine();
  left.update(multiGestureHand("left"), 0);
  expect(left.update(multiGestureHand("left"), 350)).toMatchObject({
    state: "dragging",
    dragStart: true,
  });

  for (const gesture of ["right", "double"] as const) {
    const engine = new GestureEngine();
    engine.update(multiGestureHand(gesture), 0);
    expect(engine.update(multiGestureHand(gesture), 500)).toMatchObject({
      state: gesture === "right" ? "right-pinching" : "double-pinching",
      dragStart: false,
    });
  }
});

it("chooses the nearest valid fingertip when pinch candidates overlap", () => {
  const hand = multiGestureHand("right");
  hand[INDEX_FINGER_TIP] = { x: 0.445, y: 0.5 };

  expect(new GestureEngine().update(hand, 0).state).toBe("right-pinching");
});

it("accumulates bounded signed scroll steps and resets after leaving the pose", () => {
  const engine = new GestureEngine();

  expect(engine.update(scrollHand(), 0)).toMatchObject({ state: "scrolling", scrollY: 0 });
  expect(engine.update(scrollHand(-0.04), 16).scrollY).toBe(4);
  expect(engine.update(scrollHand(0.2), 32).scrollY).toBe(-12);

  engine.update(multiGestureHand("tracking"), 48);
  expect(engine.update(scrollHand(0.15), 64)).toMatchObject({
    state: "scrolling",
    scrollY: 0,
  });
});
