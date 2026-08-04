import { describe, expect, it } from "vitest";

import { GestureStabilizer } from "./gestureStabilizer";

const left = { kind: "left" as const, score: 1 };

describe("GestureStabilizer 高响应模式", () => {
  it("activates a left pinch on the next 60 fps frame", () => {
    const stabilizer = new GestureStabilizer();
    stabilizer.update(left, 0);

    expect(stabilizer.update(left, 15).activated).toBeNull();
    expect(stabilizer.update(left, 16)).toMatchObject({
      activated: "left",
      lockedGesture: "left",
      confirmationProgress: 1,
    });
  });

  it("releases a left pinch on the next 60 fps frame", () => {
    const stabilizer = new GestureStabilizer();
    stabilizer.update(left, 0);
    stabilizer.update(left, 16);

    expect(stabilizer.update(null, 32).released).toBeNull();
    expect(stabilizer.update(null, 48)).toMatchObject({
      released: "left",
      phase: "cooldown",
    });
  });

  it("keeps the neutral cooldown below four 60 fps frames", () => {
    const stabilizer = new GestureStabilizer();
    stabilizer.update(left, 0);
    stabilizer.update(left, 16);
    stabilizer.update(null, 32);
    stabilizer.update(null, 48);

    expect(stabilizer.update(left, 97).phase).toBe("cooldown");
    expect(stabilizer.update(left, 98).phase).toBe("candidate");
  });

  it("never activates invalid input and releases a lost lock safely", () => {
    const stabilizer = new GestureStabilizer();
    stabilizer.update(left, 0, false);
    expect(stabilizer.update(left, 200, false).activated).toBeNull();

    stabilizer.reset();
    stabilizer.update(left, 0);
    stabilizer.update(left, 16);
    expect(stabilizer.update(null, 32, false).timedOut).toBe(false);
    expect(stabilizer.update(null, 136, false)).toMatchObject({ timedOut: true, lockedGesture: null });
  });
});
