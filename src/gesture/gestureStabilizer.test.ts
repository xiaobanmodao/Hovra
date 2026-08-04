import { describe, expect, it } from "vitest";

import type { GestureCandidate } from "./types";
import { GestureStabilizer } from "./gestureStabilizer";

const candidate = (kind: GestureCandidate["kind"]): GestureCandidate => ({ kind, score: 1 });

describe("GestureStabilizer", () => {
  it("requires 80 ms before activating a pinch", () => {
    const stabilizer = new GestureStabilizer();
    stabilizer.update(candidate("left"), 0);

    expect(stabilizer.update(candidate("left"), 79).activated).toBeNull();
    const confirmed = stabilizer.update(candidate("left"), 80);
    expect(confirmed.activated).toBe("left");
    expect(confirmed.lockedGesture).toBe("left");
    expect(confirmed.confirmationProgress).toBe(1);
  });

  it("requires 100 ms for scroll entry", () => {
    const stabilizer = new GestureStabilizer();
    stabilizer.update(candidate("scroll"), 0);
    expect(stabilizer.update(candidate("scroll"), 99).activated).toBeNull();
    expect(stabilizer.update(candidate("scroll"), 100).activated).toBe("scroll");
  });

  it("locks the active action and tolerates brief release wobble", () => {
    const stabilizer = new GestureStabilizer();
    stabilizer.update(candidate("left"), 0);
    stabilizer.update(candidate("left"), 80);

    expect(stabilizer.update(candidate("right"), 90).lockedGesture).toBe("left");
    expect(stabilizer.update(null, 110).phase).toBe("releasing");
    expect(stabilizer.update(candidate("left"), 150).lockedGesture).toBe("left");
    expect(stabilizer.update(null, 160).released).toBeNull();
    expect(stabilizer.update(null, 220).released).toBe("left");
  });

  it("blocks another gesture during the 120 ms neutral cooldown", () => {
    const stabilizer = new GestureStabilizer();
    stabilizer.update(candidate("left"), 0);
    stabilizer.update(candidate("left"), 80);
    stabilizer.update(null, 100);
    stabilizer.update(null, 160);

    expect(stabilizer.update(candidate("right"), 200).phase).toBe("cooldown");
    expect(stabilizer.update(candidate("right"), 279).candidate).toBeNull();
    expect(stabilizer.update(candidate("right"), 280).candidate).toBe("right");
    expect(stabilizer.update(candidate("right"), 360).activated).toBe("right");
  });

  it("never activates invalid input and times out a lock after 120 ms without releasing it", () => {
    const idle = new GestureStabilizer();
    idle.update(candidate("left"), 0, false);
    expect(idle.update(candidate("left"), 200, false).activated).toBeNull();

    const active = new GestureStabilizer();
    active.update(candidate("left"), 0);
    active.update(candidate("left"), 80);
    expect(active.update(null, 100, false).timedOut).toBe(false);
    const timeout = active.update(null, 220, false);
    expect(timeout.timedOut).toBe(true);
    expect(timeout.released).toBeNull();
    expect(timeout.lockedGesture).toBeNull();
  });

  it("times out immediately when the first missing update follows a gap of 120 ms", () => {
    const stabilizer = new GestureStabilizer();
    stabilizer.update(candidate("left"), 0);
    stabilizer.update(candidate("left"), 80);

    expect(stabilizer.update(null, 200, false).timedOut).toBe(true);
  });

  it("resets safely when timestamps move backwards", () => {
    const stabilizer = new GestureStabilizer();
    stabilizer.update(candidate("left"), 100);
    const reset = stabilizer.update(candidate("left"), 90);

    expect(reset.phase).toBe("candidate");
    expect(reset.confirmationProgress).toBe(0);
    expect(reset.lockedGesture).toBeNull();
  });
});
