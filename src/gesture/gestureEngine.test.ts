import { GestureEngine } from "./gestureEngine";
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
