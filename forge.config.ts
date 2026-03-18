import type { ForgeConfig } from "@electron-forge/shared-types";
import { VitePlugin } from "@electron-forge/plugin-vite";
import path from "path";
import fs from "fs";

function copyNativeModule(buildPath: string, moduleName: string) {
  const src = path.join(__dirname, "node_modules", moduleName);
  const dest = path.join(buildPath, "node_modules", moduleName);
  fs.cpSync(src, dest, { recursive: true });
}

const config: ForgeConfig = {
  packagerConfig: {
    icon: "assets/icon",
    asar: {
      unpack: "**/node-pty/**",
    },
  },
  rebuildConfig: {},
  hooks: {
    packageAfterCopy: async (_config, buildPath) => {
      // Copy native node-pty module into the build so it's available at runtime
      copyNativeModule(buildPath, "node-pty");
    },
  },
  makers: [
    { name: "@electron-forge/maker-zip" },
    {
      name: "@electron-forge/maker-dmg",
      config: {
        format: "ULFO",
      },
    },
    {
      name: "@electron-forge/maker-deb",
      config: {},
    },
    {
      name: "@electron-forge/maker-rpm",
      config: {},
    },
    {
      name: "@electron-forge/maker-squirrel",
      config: {},
    },
  ],
  plugins: [
    new VitePlugin({
      build: [
        {
          entry: "src/main/index.ts",
          config: "vite.main.config.ts",
          target: "main",
        },
        {
          entry: "src/preload/preload.ts",
          config: "vite.preload.config.ts",
          target: "preload",
        },
      ],
      renderer: [
        {
          name: "main_window",
          config: "vite.renderer.config.ts",
        },
      ],
    }),
  ],
};

export default config;
