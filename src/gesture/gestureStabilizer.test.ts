import { describe, expect, it } from "vitest";

import { GestureStabilizer } from "./gestureStabilizer";

const left = { kind: "left" as const, score: 1 };

describe("GestureStabilizer 高响应模式", () => {
  it("requires three complete 60 fps intervals before activating a left pinch", () => {
    const stabilizer = new GestureStabilizer();
    stabilizer.update(left, 0);

    expect(stabilizer.update(left, 16).activated).toBeNull();
    expect(stabilizer.update(left, 32).activated).toBeNull();
    expect(stabilizer.update(left, 47).activated).toBeNull();
    expect(stabilizer.update(left, 48)).toMatchObject({
      activated: "left",
      lockedGesture: "left",
      confirmationProgress: 1,
    });
  });

  it("releases a left pinch on the next 60 fps frame", () => {
    const stabilizer = new GestureStabilizer();
    stabilizer.update(left, 0);
    stabilizer.update(left, 48);

    expect(stabilizer.update(null, 64).released).toBeNull();
    expect(stabilizer.update(null, 80)).toMatchObject({
      released: "left",
      phase: "cooldown",
    });
  });

  it("keeps the neutral cooldown below four 60 fps frames", () => {
    const stabilizer = new GestureStabilizer();
    stabilizer.update(left, 0);
    stabilizer.update(left, 48);
    stabilizer.update(null, 64);
    stabilizer.update(null, 80);

    expect(stabilizer.update(left, 129).phase).toBe("cooldown");
    expect(stabilizer.update(left, 130).phase).toBe("candidate");
  });

  it("never activates invalid input and releases a lost lock safely", () => {
    const stabilizer = new GestureStabilizer();
    stabilizer.update(left, 0, false);
    expect(stabilizer.update(left, 200, false).activated).toBeNull();

    stabilizer.reset();
    stabilizer.update(left, 0);
    stabilizer.update(left, 48);
    expect(stabilizer.update(null, 64, false).timedOut).toBe(false);
    expect(stabilizer.update(null, 168, false)).toMatchObject({ timedOut: true, lockedGesture: null });
  });

  it("keeps open-palm stop on the next 60 fps frame", () => {
    const stabilizer = new GestureStabilizer();
    const openPalm = { kind: "open-palm" as const, score: 1 };

    expect(stabilizer.update(openPalm, 0).activated).toBeNull();
    expect(stabilizer.update(openPalm, 16).activated).toBe("open-palm");
  });
});
