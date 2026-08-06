import { MakerZIP } from "@electron-forge/maker-zip";
import { AutoUnpackNativesPlugin } from "@electron-forge/plugin-auto-unpack-natives";
import { VitePlugin } from "@electron-forge/plugin-vite";
import type { ForgeConfig } from "@electron-forge/shared-types";
import { execFile } from "node:child_process";

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    appBundleId: "com.xiaobanmodao.hovra",
    extendInfo: {
      NSCameraUsageDescription: "Hovra 需要使用摄像头在本机识别您的手部动作。",
    },
    extraResource: ["native/cursor-visibility.node"],
    afterCopyExtraResources: [(
      buildPath,
      _electronVersion,
      platform,
      _arch,
      callback,
    ) => {
      if (platform !== "darwin") {
        callback();
        return;
      }
      execFile("xattr", ["-cr", buildPath], (error) => callback(error ?? undefined));
    }],
    osxSign: {
      identity: "-",
      identityValidation: false,
      optionsForFile: () => ({ hardenedRuntime: false }),
    },
    ignore: (file) =>
      Boolean(file) &&
      !file.startsWith("/.vite") &&
      !file.startsWith("/node_modules"),
  },
  makers: [new MakerZIP({}, ["darwin"])],
  plugins: [
    new AutoUnpackNativesPlugin({}),
    new VitePlugin({
      build: [
        {
          entry: "electron/main.ts",
          config: "vite.config.ts",
        },
        {
          entry: "electron/preload.ts",
          config: "vite.config.ts",
        },
      ],
      renderer: [
        {
          name: "main_window",
          config: "vite.config.ts",
        },
      ],
    }),
  ],
};

export default config;
