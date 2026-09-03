import { crx } from "@crxjs/vite-plugin";
import { defineConfig } from "vite";
import manifest from "./manifest.json" with { type: "json" };

export default defineConfig({
  plugins: [crx({ manifest: manifest as chrome.runtime.ManifestV3 })],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      // The offscreen document is created dynamically at runtime
      // (chrome.offscreen.createDocument), so it's never reachable from the
      // manifest and crxjs won't discover it on its own — declare it explicitly.
      input: {
        offscreen: "src/offscreen/offscreen.html",
      },
    },
  },
});
