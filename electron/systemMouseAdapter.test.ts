import { beforeEach, expect, it, vi } from "vitest";

const robotMocks = vi.hoisted(() => ({
  moveMouse: vi.fn(),
  dragMouse: vi.fn(),
  mouseClick: vi.fn(),
  mouseToggle: vi.fn(),
}));

vi.mock("@jitsi/robotjs", () => ({
  moveMouse: robotMocks.moveMouse,
  dragMouse: robotMocks.dragMouse,
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

it("preserves the RobotJS press-drag-release sequence for a terminal drag", async () => {
  await systemMouse.press();
  await systemMouse.drag(320, 240);
  await systemMouse.release();

  expect(robotMocks.dragMouse).toHaveBeenCalledWith(320, 240);
  expect(robotMocks.moveMouse).not.toHaveBeenCalled();
  expect(robotMocks.mouseToggle.mock.calls).toEqual([
    ["down", "left"],
    ["up", "left"],
  ]);
  expect(robotMocks.mouseToggle.mock.invocationCallOrder[0]).toBeLessThan(
    robotMocks.dragMouse.mock.invocationCallOrder[0],
  );
  expect(robotMocks.dragMouse.mock.invocationCallOrder[0]).toBeLessThan(
    robotMocks.mouseToggle.mock.invocationCallOrder[1],
  );
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
