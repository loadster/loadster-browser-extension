/**
 * Applies patches to node_modules without relying on the patch-package binary.
 * This replaces the postinstall: "patch-package" script.
 *
 * Patch: vite-plugin-web-extension — guard reload() against undefined runner
 * See: patches/vite-plugin-web-extension+4.5.0.patch
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const filePath = resolve(root, 'node_modules/vite-plugin-web-extension/dist/index.js');

const original = `    async reload() {
      await runner.reloadAllExtensions();
      logger.log("");
    },`;

const patched = `    async reload() {
      if (runner) {
        await runner.reloadAllExtensions();
        logger.log("");
      }
    },`;

let content;

try {
  content = readFileSync(filePath, 'utf8');
} catch {
  // Package not installed (e.g. --omit=dev in CI) — nothing to patch.
  process.exit(0);
}

if (content.includes(patched)) {
  console.log('vite-plugin-web-extension: patch already applied, skipping.');
} else if (content.includes(original)) {
  writeFileSync(filePath, content.replace(original, patched));
  console.log('vite-plugin-web-extension: patch applied successfully.');
} else {
  console.warn('vite-plugin-web-extension: patch target not found — the package may have been updated. Please review patches/vite-plugin-web-extension+4.5.0.patch.');
}
