import { describe, expect, it } from "vitest";

import { AdaptiveLandmarkFilter } from "./adaptiveLandmarkFilter";
import type { Landmark } from "./types";

const handAt = (x: number, y = 0.4, z = -0.02): Landmark[] =>
  Array.from({ length: 21 }, (_, index) => ({
    x: x + index * 0.001,
    y: y + index * 0.001,
    z,
  }));

describe("AdaptiveLandmarkFilter", () => {
  it("reduces stationary alternating landmark noise", () => {
    const filter = new AdaptiveLandmarkFilter();
    const input: number[] = [];
    const output: number[] = [];

    for (let frame = 0; frame < 40; frame += 1) {
      const x = 0.5 + (frame % 2 === 0 ? -0.02 : 0.02);
      input.push(x);
      output.push(filter.update(handAt(x), frame * 16)![0]!.x);
    }

    const stableInput = input.slice(10);
    const stableOutput = output.slice(10);
    const inputRange = Math.max(...stableInput) - Math.min(...stableInput);
    const outputRange = Math.max(...stableOutput) - Math.min(...stableOutput);

    expect(outputRange).toBeLessThan(inputRange * 0.6);
  });

  it("follows rapid intentional motion to at least 80 percent within 100 ms", () => {
    const filter = new AdaptiveLandmarkFilter();
    filter.update(handAt(0.2), 0);
    filter.update(handAt(0.2), 16);

    const output = filter.update(handAt(0.8), 96)!;

    expect(output[0]!.x).toBeGreaterThanOrEqual(0.68);
  });

  it("uses elapsed time rather than an assumed frame rate", () => {
    const quickFilter = new AdaptiveLandmarkFilter();
    quickFilter.update(handAt(0.2), 0);
    const quick = quickFilter.update(handAt(0.8), 16)![0]!.x;

    const slowFilter = new AdaptiveLandmarkFilter();
    slowFilter.update(handAt(0.2), 0);
    const slow = slowFilter.update(handAt(0.8), 100)![0]!.x;

    expect(slow).toBeGreaterThan(quick);
  });

  it("resets on null input, timestamp reversal, and gaps over 250 ms", () => {
    const filter = new AdaptiveLandmarkFilter();
    filter.update(handAt(0.2), 100);
    expect(filter.update(null, 116)).toBeNull();
    expect(filter.update(handAt(0.8), 132)![0]!.x).toBeCloseTo(0.8, 8);

    filter.update(handAt(0.2), 148);
    expect(filter.update(handAt(0.7), 140)![0]!.x).toBeCloseTo(0.7, 8);

    filter.update(handAt(0.2), 156);
    expect(filter.update(handAt(0.9), 407)![0]!.x).toBeCloseTo(0.9, 8);
  });

  it("rejects malformed or non-finite landmark frames and can be reset explicitly", () => {
    const filter = new AdaptiveLandmarkFilter();
    filter.update(handAt(0.2), 0);

    expect(filter.update(handAt(0.3).slice(0, 20), 16)).toBeNull();
    const invalid = handAt(0.3);
    invalid[8]!.y = Number.NaN;
    expect(filter.update(invalid, 32)).toBeNull();

    filter.update(handAt(0.2), 48);
    filter.reset();
    expect(filter.update(handAt(0.9), 64)![0]!.x).toBeCloseTo(0.9, 8);
  });
});
