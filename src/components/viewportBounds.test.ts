import { expect, it } from "vitest";
import { clampToViewport } from "./viewportBounds";

it("keeps an item within the viewport safety margin", () => {
  expect(
    clampToViewport(
      { x: -10, y: 500 },
      { width: 100, height: 80 },
      { width: 400, height: 300 },
      16,
    ),
  ).toEqual({ x: 16, y: 204 });
});

it("uses the origin on axes that cannot fit the item and its margins", () => {
  expect(
    clampToViewport(
      { x: 30, y: 30 },
      { width: 200, height: 100 },
      { width: 180, height: 80 },
      16,
    ),
  ).toEqual({ x: 0, y: 0 });
});
