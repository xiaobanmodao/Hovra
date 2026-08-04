import { MakerZIP } from "@electron-forge/maker-zip";
import { AutoUnpackNativesPlugin } from "@electron-forge/plugin-auto-unpack-natives";
import { VitePlugin } from "@electron-forge/plugin-vite";
import type { ForgeConfig } from "@electron-forge/shared-types";

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    extraResource: ["native/cursor-visibility.node"],
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
