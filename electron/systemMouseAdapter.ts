import * as robot from "@jitsi/robotjs";

import type { SystemMouseAdapter } from "./mouseController";

export const systemMouse: SystemMouseAdapter = {
  async move(x, y) {
    robot.moveMouse(x, y);
  },
  async drag(x, y) {
    robot.dragMouse(x, y);
  },
  async click() {
    robot.mouseClick("left");
  },
  async rightClick() {
    robot.mouseClick("right");
  },
  async doubleClick() {
    robot.mouseClick("left", true);
  },
  async scroll(deltaY) {
    robot.scrollMouse(0, deltaY);
  },
  async press() {
    robot.mouseToggle("down", "left");
  },
  async release() {
    robot.mouseToggle("up", "left");
  },
};
