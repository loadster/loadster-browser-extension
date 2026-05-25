import { defineConfig } from 'vite';
import webExtension, { readJsonFile } from 'vite-plugin-web-extension';
import { spawn } from 'child_process';
import path from 'path';

/**
 * Builds the locator overlay (Vue 3 + Shadow DOM) for each target.
 * Runs as a post-step after the main bundle so the Vue plugin can be applied.
 * Output: dist/{target}/src/content/locator-overlay/index.js
 */
function locatorOverlayBuildPlugin(target) {
  return {
    name: 'locator-overlay-build',
    apply: 'build',
    async closeBundle() {
      const { build } = await import('vite');
      const { default: vue } = await import('@vitejs/plugin-vue');
      await build({
        root: process.cwd(),
        configFile: false,
        publicDir: false,
        plugins: [vue()],
        define: {
          __BROWSER__: JSON.stringify(target),
          'process.env.NODE_ENV': JSON.stringify('production'),
        },
        build: {
          lib: {
            entry: path.resolve(process.cwd(), 'src/content/locator-overlay/index.ts'),
            formats: ['iife'],
            name: '__ls_overlay',
          },
          assetsInlineLimit: Infinity,
          outDir: `dist/${target}/src/content/locator-overlay`,
          emptyOutDir: false,
          rollupOptions: {
            output: { entryFileNames: 'index.js' },
          },
          minify: true,
          sourcemap: false,
        },
        logLevel: 'warn',
      });
    },
  };
}

/**
 * Builds overlayInjected.js once at dev-server startup and exposes a CLI
 * shortcut (press `o`) for on-demand rebuilds. No file watcher — avoids
 * race conditions from rapid saves and infinite HMR loops.
 *
 * Production builds use the `prebuild` npm hook instead (unchanged).
 */
function overlayBuildPlugin() {
  const bundleScript = path.resolve(process.cwd(), 'scripts/bundle-overlay.mjs');
  let building = false;

  function rebuild() {
    if (building) {
      console.log('[overlay] rebuild already in progress, ignoring');
      return Promise.resolve();
    }
    building = true;
    return new Promise((resolve) => {
      spawn('node', [bundleScript], { stdio: 'inherit' }).on('exit', (code) => {
        building = false;
        if (code !== 0) console.error(`[overlay] bundle-overlay.mjs exited with code ${code}`);
        resolve();
      });
    });
  }

  return {
    name: 'overlay-build',
    apply: 'serve',
    async configureServer(server) {
      await rebuild();

      const originalBind = server.bindCLIShortcuts.bind(server);
      server.bindCLIShortcuts = (options = {}) => {
        originalBind({
          ...options,
          customShortcuts: [
            ...(options.customShortcuts ?? []),
            { key: 'o', description: 'rebuild overlay (overlayInjected.js)', action: () => rebuild() },
          ],
        });
      };
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
    overlayBuildPlugin(),
    locatorOverlayBuildPlugin(target),
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
        'src/content/locatorRecorder.js'
      ]
    })
  ],
});
