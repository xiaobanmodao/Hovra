import { describe, expect, it } from "vitest";

import { OneEuroPointFilter } from "./oneEuroFilter";

describe("OneEuroPointFilter", () => {
  it("压低静止手指的高频抖动但不会返回非法坐标", () => {
    const filter = new OneEuroPointFilter({ minCutoff: 0.8, beta: 0.04, derivativeCutoff: 1 });
    const raw = [0.5, 0.52, 0.48, 0.515, 0.485, 0.5];
    const filtered = raw.map((x, index) => filter.filter({ x, y: 0.5, z: 0 }, index * 16).x);
    const rawRange = Math.max(...raw.slice(1)) - Math.min(...raw.slice(1));
    const filteredRange = Math.max(...filtered.slice(1)) - Math.min(...filtered.slice(1));

    expect(filteredRange).toBeLessThan(rawRange * 0.7);
    expect(filtered.every(Number.isFinite)).toBe(true);
  });

  it("快速移动时比固定重度低通更快跟上目标", () => {
    const filter = new OneEuroPointFilter({ minCutoff: 0.8, beta: 2, derivativeCutoff: 1 });
    filter.filter({ x: 0.1, y: 0.2 }, 0);
    filter.filter({ x: 0.1, y: 0.2 }, 16);
    const output = filter.filter({ x: 0.9, y: 0.2 }, 32);

    expect(output.x).toBeGreaterThan(0.35);
    expect(output.x).toBeLessThanOrEqual(0.9);
  });

  it("断帧后重建基线而不是从旧位置缓慢漂移", () => {
    const filter = new OneEuroPointFilter({ maxGapMs: 120 });
    filter.filter({ x: 0.1, y: 0.2 }, 0);
    const recovered = filter.filter({ x: 0.8, y: 0.7 }, 500);

    expect(recovered).toMatchObject({ x: 0.8, y: 0.7 });
  });
});
