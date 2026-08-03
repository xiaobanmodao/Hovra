import { expect, it } from "vitest";
import { mapMirroredPoint, smoothPoint } from "./cursorController";

it("maps a normalized point into mirrored viewport coordinates", () => {
  expect(mapMirroredPoint({ x: 0.2, y: 0.25 }, { width: 1000, height: 800 }))
    .toEqual({ x: 800, y: 200 });
});

it("smooths a cursor point toward its target", () => {
  expect(smoothPoint({ x: 0, y: 0 }, { x: 100, y: 80 }, 0.2))
    .toEqual({ x: 20, y: 16 });
});
