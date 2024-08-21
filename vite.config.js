import { defineConfig } from "vite";
import webExtension, { readJsonFile } from "vite-plugin-web-extension";

// eslint-disable-next-line no-undef
const target = process.env.TARGET || "chrome";

export default defineConfig({
  define: {
    __BROWSER__: JSON.stringify(target),
  },
  build: {
    // outDir: `dist-${target}`,
    emptyOutDir: true,
  },
  plugins: [webExtension({
    browser: target,
    manifest: () => {
      // Use `readJsonFile` instead of import/require to avoid caching during rebuild.
      const pkg = readJsonFile("package.json");
      const template = readJsonFile(target === "chrome" ? "manifest.chrome.json" : "manifest.firefox.json");
      return {
        ...template,
        version: pkg.version,
        name: pkg.name,
        description: pkg.description,
      };
    },
  })],
});
