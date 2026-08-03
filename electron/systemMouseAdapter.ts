import * as robot from "@jitsi/robotjs";

import type { SystemMouseAdapter } from "./mouseController";

export const systemMouse: SystemMouseAdapter = {
  async move(x, y) {
    robot.moveMouse(x, y);
  },
  async click() {
    robot.mouseClick("left");
  },
  async press() {
    robot.mouseToggle("down", "left");
  },
  async release() {
    robot.mouseToggle("up", "left");
  },
};
