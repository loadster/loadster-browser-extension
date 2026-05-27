#!/usr/bin/env node
/**
 * Bundles Playwright codegen functions for browser use.
 *
 * Produces two files in src/generated/:
 *   playwright-codegen.js     — generateCode, JavaScriptLanguageGenerator, collapseActions
 *   playwright-recorder-source.js — pollingRecorderSource string (injected into pages)
 *
 * Run via: npm run bundle-playwright
 * This runs automatically before every build (prebuild).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import esbuild from 'esbuild';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PW_LIB = path.resolve(ROOT, 'node_modules/playwright-core/lib');
const OUT_DIR = path.join(ROOT, 'src/generated');

if (!fs.existsSync(PW_LIB)) {
  console.error('playwright-core not found in node_modules. Run: npm install');
  process.exit(1);
}

fs.mkdirSync(OUT_DIR, { recursive: true });

// ---------------------------------------------------------------------------
// Bundle A: Codegen functions (generateCode, JavaScriptLanguageGenerator, collapseActions)
// ---------------------------------------------------------------------------

// Barrel entry — ESM so esbuild produces named exports
const barrelPath = path.join(ROOT, '_codegen_barrel.mjs');
// esbuild bundles CJS files when imported from ESM; it wraps them and exposes named exports
// via the CJS default shape. We re-export what we need explicitly.
fs.writeFileSync(barrelPath, [
  '// Auto-generated barrel — do not edit',
  `import _lang from ${JSON.stringify(PW_LIB + '/server/codegen/language.js')};`,
  `import _js   from ${JSON.stringify(PW_LIB + '/server/codegen/javascript.js')};`,
  `import _ru   from ${JSON.stringify(PW_LIB + '/server/recorder/recorderUtils.js')};`,
  `import _lg   from ${JSON.stringify(PW_LIB + '/utils/isomorphic/locatorGenerators.js')};`,
  '',
  'export const generateCode              = _lang.generateCode;',
  'export const toSignalMap               = _lang.toSignalMap;',
  'export const JavaScriptLanguageGenerator = _js.JavaScriptLanguageGenerator;',
  'export const collapseActions           = _ru.collapseActions;',
  'export const shouldMergeAction         = _ru.shouldMergeAction;',
  'export const asLocator                 = _lg.asLocator;',
].join('\n'));

// Shim for playwright-core/lib/utils.js — exposes only what codegen actually uses,
// avoiding the full barrel that pulls in Node.js server utilities.
const utilsShimPath = path.join(ROOT, '_utils_shim.cjs');
fs.writeFileSync(utilsShimPath, [
  '"use strict";',
  `const lg = require(${JSON.stringify(PW_LIB + '/utils/isomorphic/locatorGenerators.js')});`,
  `const su = require(${JSON.stringify(PW_LIB + '/utils/isomorphic/stringUtils.js')});`,
  `const tr = require(${JSON.stringify(PW_LIB + '/utils/isomorphic/timeoutRunner.js')});`,
  `const pf = require(${JSON.stringify(PW_LIB + '/utils/isomorphic/protocolFormatter.js')});`,
  'module.exports = { ...lg, ...su, ...tr, ...pf };',
].join('\n'));

// esbuild plugin: redirect require("../../utils") from playwright-core to our shim
const utilsShimPlugin = {
  name: 'playwright-utils-shim',
  setup(build) {
    // Intercept the relative ../../utils import that codegen/recorder files use
    build.onResolve({ filter: /^\.\.\/\.\.\/utils$/ }, (args) => {
      if (args.importer.includes('playwright-core')) {
        return { path: utilsShimPath };
      }
    });
  },
};

console.log('Bundling playwright-codegen.js ...');

let buildOk = false;
try {
  await esbuild.build({
    entryPoints: [barrelPath],
    bundle: true,
    outfile: path.join(OUT_DIR, 'playwright-codegen.js'),
    format: 'esm',
    platform: 'browser',
    target: 'ES2020',
    treeShaking: true,
    plugins: [utilsShimPlugin],
    define: { 'process.env.NODE_ENV': '"production"' },
    // CJS modules imported from ESM barrel need this to avoid interop issues
    mainFields: ['browser', 'module', 'main'],
  });
  buildOk = true;
} finally {
  fs.unlinkSync(barrelPath);
  fs.unlinkSync(utilsShimPath);
}

if (!buildOk) process.exit(1);

const size = fs.statSync(path.join(OUT_DIR, 'playwright-codegen.js')).size;
console.log(`  src/generated/playwright-codegen.js (${(size / 1024).toFixed(1)} KB)`);

// ---------------------------------------------------------------------------
// Bundle B: page-injected sources — pre-built IIFEs that Playwright injects into pages
// ---------------------------------------------------------------------------

const req = createRequire(import.meta.url);

function loadGeneratedSource(name) {
  try {
    return req(path.join(PW_LIB, `generated/${name}.js`)).source;
  } catch {
    console.warn(`Warning: ${name}.js not found in playwright-core/lib/generated/`);
    return null;
  }
}

const pollingSource = loadGeneratedSource('pollingRecorderSource');
const injectedSource = loadGeneratedSource('injectedScriptSource');
const bindingsSource = loadGeneratedSource('bindingsControllerSource');

if (pollingSource && injectedSource && bindingsSource) {
  fs.writeFileSync(
    path.join(OUT_DIR, 'playwright-recorder-source.js'),
    [
      '// Auto-generated — do not edit',
      `export const injectedScriptSource = ${JSON.stringify(injectedSource)};`,
      `export const bindingsControllerSource = ${JSON.stringify(bindingsSource)};`,
      `export const pollingRecorderSource = ${JSON.stringify(pollingSource)};`,
      '',
    ].join('\n'),
  );
  console.log('  src/generated/playwright-recorder-source.js (3 exports)');
} else {
  console.warn('Warning: one or more recorder sources missing, skipping Bundle B');
}

// ---------------------------------------------------------------------------
// Bundle C: InjectedScript constructor module — IIFE inlined as static code.
// Using new Function() or eval() is blocked by the extension's CSP; inlining the
// IIFE directly means it executes as regular JS at module load, not via eval.
// ---------------------------------------------------------------------------

if (injectedSource) {
  fs.writeFileSync(
    path.join(OUT_DIR, 'playwright-injected-ctor.js'),
    [
      '// Auto-generated — do not edit',
      'const __module = {};',
      '(function(module) {',
      injectedSource,
      '})(__module);',
      'export function getInjectedScriptClass() {',
      '  return __module.exports.InjectedScript();',
      '}',
      '',
    ].join('\n'),
  );
  const csize = fs.statSync(path.join(OUT_DIR, 'playwright-injected-ctor.js')).size;
  console.log(`  src/generated/playwright-injected-ctor.js (${(csize / 1024).toFixed(1)} KB)`);
} else {
  console.warn('Warning: injectedSource missing, skipping Bundle C');
}

console.log('Done.');
