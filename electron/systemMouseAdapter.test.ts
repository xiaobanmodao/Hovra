import { beforeEach, expect, it, vi } from "vitest";

const robotMocks = vi.hoisted(() => ({
  moveMouse: vi.fn(),
  mouseClick: vi.fn(),
  mouseToggle: vi.fn(),
}));

vi.mock("@jitsi/robotjs", () => ({
  moveMouse: robotMocks.moveMouse,
  mouseClick: robotMocks.mouseClick,
  mouseToggle: robotMocks.mouseToggle,
}));

import { systemMouse } from "./systemMouseAdapter";

beforeEach(() => {
  vi.clearAllMocks();
});

it("moves through the packaged RobotJS adapter", async () => {
  await systemMouse.move(240, 160);

  expect(robotMocks.moveMouse).toHaveBeenCalledWith(240, 160);
});

it("uses the left button for click, press, and release", async () => {
  await systemMouse.click();
  await systemMouse.press();
  await systemMouse.release();

  expect(robotMocks.mouseClick).toHaveBeenCalledWith("left");
  expect(robotMocks.mouseToggle.mock.calls).toEqual([
    ["down", "left"],
    ["up", "left"],
  ]);
});
