import { defineConfig } from "vite";

export default defineConfig({
  define: {
    BUILD_CHANNEL: JSON.stringify(process.env.VITE_BUILD_CHANNEL || "local"),
  },
  build: {
    rollupOptions: {
      external: [
        "electron",
        "node-pty",
      ],
    },
  },
});
