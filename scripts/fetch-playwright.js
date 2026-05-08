#!/usr/bin/env node
/**
 * Fetches specific Playwright source paths from GitHub using git sparse-checkout.
 * Run via: npm run fetch-playwright
 *
 * The `playwright/` directory is git-ignored — re-run this script after a fresh checkout.
 * To update to a newer Playwright version, change PLAYWRIGHT_REF below.
 */

import { execSync } from 'child_process';
import { existsSync, rmSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const TARGET_DIR = resolve(ROOT, 'playwright');

// Tag, branch, or commit SHA to fetch — must match installed playwright-core version
const PLAYWRIGHT_REF = 'v1.58.0';

// Paths inside the Playwright repo to include (sparse-checkout patterns)
const SPARSE_PATHS = [
  'packages/playwright-core/src/server/codegen',
  'packages/playwright-core/src/server/deviceDescriptors.ts',
  'packages/playwright-core/src/server/recorder',
  'packages/playwright-core/src/utils/isomorphic',
  'packages/playwright-core/src/generated',
  'packages/injected/src',
  'packages/protocol/src',
];

function run(cmd, cwd = ROOT) {
  execSync(cmd, { cwd, stdio: 'inherit' });
}

const GIT_DIR = resolve(TARGET_DIR, '.git');

if (existsSync(GIT_DIR)) {
  console.log('playwright/ already exists — updating...');
  run(`git fetch --depth=1 origin ${PLAYWRIGHT_REF}`, TARGET_DIR);
  run(`git checkout FETCH_HEAD`, TARGET_DIR);
} else {
  if (existsSync(TARGET_DIR)) {
    rmSync(TARGET_DIR, { recursive: true, force: true });
  }
  console.log(`Fetching Playwright ${PLAYWRIGHT_REF} (sparse)...`);
  run(
    `git clone --filter=blob:none --no-checkout --depth=1 --branch ${PLAYWRIGHT_REF} https://github.com/microsoft/playwright.git playwright`,
  );
  run(`git sparse-checkout init --cone`, TARGET_DIR);
  run(`git sparse-checkout set ${SPARSE_PATHS.join(' ')}`, TARGET_DIR);
  run(`git checkout`, TARGET_DIR);
}

rmSync(GIT_DIR, { recursive: true, force: true });
console.log('Done. Playwright source available at playwright/');
