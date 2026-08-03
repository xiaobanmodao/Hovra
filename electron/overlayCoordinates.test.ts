import { describe, expect, it } from "vitest";

import { toOverlayPoint } from "./overlayCoordinates";

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
