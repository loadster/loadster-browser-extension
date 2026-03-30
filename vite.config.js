import { defineConfig } from 'vite';
import webExtension, { readJsonFile } from 'vite-plugin-web-extension';
import { spawn } from 'child_process';
import path from 'path';

/**
 * Watches src/content/playwright-overlay/** and rebuilds overlayInjected.js on
 * any change. Vite then detects that src/generated/overlayInjected.js changed and
 * triggers HMR for RecorderController.ts (which imports it via ?raw).
 */
function overlayWatchPlugin() {
  const overlayDir = path.resolve(process.cwd(), 'src/content/playwright-overlay');
  const bundleScript = path.resolve(process.cwd(), 'scripts/bundle-overlay.mjs');
  let building = false;

  function rebuild() {
    if (building) return;
    building = true;
    spawn('node', [bundleScript], { stdio: 'inherit' }).on('exit', () => { building = false; });
  }

  return {
    name: 'overlay-watch',
    configureServer(server) {
      rebuild(); // initial build (prebuild only runs before `build`, not `dev`)
      server.watcher.add(overlayDir);
      server.watcher.on('change', (file) => {
        if (file.startsWith(overlayDir)) rebuild();
      });
    },
  };
}

 
const target = process.env.TARGET || 'chrome';

export default defineConfig({
  resolve: {
    alias: { events: 'events' },
  },
  define: {
    __BROWSER__: JSON.stringify(target),
  },
  build: {
    outDir: `dist/${target}`,
    emptyOutDir: true,
    sourcemap: true,
  },
  plugins: [
    {
      name: 'cleanup-virtual-temp',
      generateBundle(_, bundle) {
        for (const key of Object.keys(bundle)) {
          if (key.includes('virtual:temp')) delete bundle[key];
        }
      },
    },
    overlayWatchPlugin(),
    webExtension({
      verbose: true,
      browser: target, manifest: () => {
        // Use `readJsonFile` instead of import/require to avoid caching during rebuild.
        const pkg = readJsonFile('package.json');
        const template = readJsonFile(target === 'chrome' ? './src/manifest.chrome.json' : './src/manifest.firefox.json');

        return {
          ...template,
          version: pkg.version,
          name: 'Loadster Recorder Extension',
          description: pkg.description,
        };
      },
      additionalInputs: [
        'src/index.html',
        'src/content/contentTab.js',
        'src/content/windowEventRecorder.js'
      ]
    })
  ],
});
