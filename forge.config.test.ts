import { describe, expect, it } from "vitest";

import config from "./forge.config";

describe("macOS package identity", () => {
  it("uses a stable bundle identifier and a Chinese camera usage description", () => {
    expect(config.packagerConfig).toMatchObject({
      appBundleId: "com.xiaobanmodao.hovra",
      extendInfo: {
        NSCameraUsageDescription: "Hovra 需要使用摄像头在本机识别您的手部动作。",
      },
    });
  });

  it("packages only the cursor helper and excludes the retired hand-pose helper", () => {
    expect(config.packagerConfig?.extraResource).toEqual(["native/cursor-visibility.node"]);
  });
});
