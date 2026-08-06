import { describe, expect, it } from "vitest";

import { GESTURE_REGRESSION_CASES } from "./fixtures/gestureRegressionCases";
import { runGestureRegression } from "./gestureRegression";

describe("关键手势轨迹自动回归", () => {
  it("覆盖当前允许动作和主要误触场景", () => {
    expect(GESTURE_REGRESSION_CASES.map((testCase) => testCase.name)).toEqual([
      "短捏合",
      "右键短捏合",
      "双指滚动",
      "长按",
      "右键保持防误触",
      "张掌停止",
      "握拳防误触",
      "纵深分离防误触",
      "右键纵深分离防误触",
      "多指含糊防误触",
      "移动防误触",
    ]);
  });

  describe.each(GESTURE_REGRESSION_CASES)("$name", (testCase) => {
    it("通过真实引擎自动回放", () => {
      const report = runGestureRegression(testCase);

      expect(
        report.failures,
        report.failures.map((failure) => failure.message).join("\n"),
      ).toEqual([]);
      expect(report.passed).toBe(true);
    });
  });
});
