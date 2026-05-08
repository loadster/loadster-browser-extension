#!/usr/bin/env node
/**
 * Bundles the Vue 3 overlay app for injection into recorded pages via CDP.
 *
 * Produces: src/generated/overlayInjected.js (self-contained IIFE)
 *
 * Run via: npm run bundle-overlay
 * This runs automatically before every build (prebuild).
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import vue from '@vitejs/plugin-vue';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

console.log('Bundling overlayInjected.js ...');

await build({
  root: ROOT,
  configFile: false,
  plugins: [vue()],
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  build: {
    lib: {
      entry: path.join(ROOT, 'src/content/playwright-overlay/index.ts'),
      formats: ['iife'],
      name: '__pw_overlay',
    },
    assetsInlineLimit: Infinity, // inline all assets (fonts, images) as base64 data URIs
    outDir: path.join(ROOT, 'src/generated'),
    emptyOutDir: false,
    rollupOptions: {
      external: [],
      output: {
        entryFileNames: 'overlayInjected.js',
        globals: {},
      },
    },
    minify: true,
  },
  logLevel: 'warn',
});

const size = (await import('node:fs')).statSync(path.join(ROOT, 'src/generated/overlayInjected.js')).size;
console.log(`  src/generated/overlayInjected.js (${(size / 1024).toFixed(1)} KB)`);
console.log('Done.');
