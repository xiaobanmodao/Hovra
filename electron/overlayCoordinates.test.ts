import { describe, expect, it } from "vitest";

import { cursorOverlayBounds, toOverlayPoint } from "./overlayCoordinates";

describe("toOverlayPoint", () => {
  const display = { x: -1440, y: 120, width: 1440, height: 900 };

  it("uses the display top-left as the overlay origin", () => {
    expect(toOverlayPoint({ x: -1440, y: 120 }, display)).toEqual({ x: 0, y: 0 });
  });

  it("keeps the other three display corners aligned", () => {
    expect(toOverlayPoint({ x: -1, y: 120 }, display)).toEqual({ x: 1439, y: 0 });
    expect(toOverlayPoint({ x: -1440, y: 1019 }, display)).toEqual({ x: 0, y: 899 });
    expect(toOverlayPoint({ x: -1, y: 1019 }, display)).toEqual({ x: 1439, y: 899 });
  });
});

describe("cursorOverlayBounds", () => {
  it.each([
    [{ x: 600, y: 400 }, { x: 580, y: 380, width: 40, height: 40 }],
    [{ x: 0, y: 0 }, { x: -20, y: -20, width: 40, height: 40 }],
    [{ x: -1440, y: 120 }, { x: -1460, y: 100, width: 40, height: 40 }],
  ])("centers the overlay window exactly on the system pointer", (point, expected) => {
    expect(cursorOverlayBounds(point, 40)).toEqual(expected);
  });

  it("rounds fractional pointer coordinates without shifting the center by a pixel", () => {
    const bounds = cursorOverlayBounds({ x: 755.5, y: 490.5 }, 40);

    expect(bounds).toEqual({ x: 735, y: 470, width: 40, height: 40 });
  });
});
