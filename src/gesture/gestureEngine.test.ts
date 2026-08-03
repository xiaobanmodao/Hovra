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
  { x: 0.05, y: 0 },
);

const pinchedHand = (): Landmark[] => handWithTips(
  { x: 0, y: 0 },
  { x: 0.03, y: 0 },
  { x: 0.05, y: 0 },
);

const handWithPinchDistance = (distance: number): Landmark[] => handWithTips(
  { x: 0, y: 0 },
  { x: distance, y: 0 },
  { x: 0.05, y: 0 },
);

it("uses injected pinch and drag thresholds without mutating them", () => {
  const settings = {
    ...DEFAULT_GESTURE_SETTINGS,
    pinchDistance: 0.1,
    dragHoldMs: 600,
  };
  const engine = new GestureEngine(settings);

  expect(engine.update(handWithPinchDistance(0.08), 0).state).toBe("pinching");
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

it("transitions between paused, tracking, pinching, clicking, dragging, and lost", () => {
  const engine = new GestureEngine();

  expect(engine.update(openHand(), 0).state).toBe("paused");
  expect(engine.update(trackingHand(), 16).state).toBe("tracking");
  expect(engine.update(pinchedHand(), 32).state).toBe("pinching");
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
