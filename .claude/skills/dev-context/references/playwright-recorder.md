# Playwright Recorder Implementation Reference

This document describes how the `PlaywrightRecorder.ts` works in the Loadster browser extension.
Use it as a reference for maintenance, debugging, and future changes.

## Overview

The recorder captures user interactions in a Chrome tab and generates valid [playwright-test](https://playwright.dev/docs/api/class-test) code in real time. It injects a content script into the page using `RecorderController.ts` and communicates with the page via Chrome DevTools Protocol (CDP). The injected script includes Playwright's `InjectedScript` (inlined from `injectedScriptSource` in `playwright-recorder-source.js`), supplemented with a custom Vue overlay bundled via `bundle-overlay.mjs`.

### Pipeline overview

```
Loadster dashboard
      │ NAVIGATE_URL / OPTIONS messages (chrome.runtime port)
      ▼
PlaywrightRecorder (background service worker)
      │ startRecording(tabId)
      ▼
RecorderController
      ├── chrome.debugger.attach(tabId)
      ├── Runtime.addBinding(__pw_overlay_action__)   — action channel
      ├── Page.addScriptToEvaluateOnNewDocument(INJECTION_SCRIPT)
      ├── Runtime.evaluate(INJECTION_SCRIPT)          — inject into current page
      │
      │ Runtime.bindingCalled events
      ▼
  collapseActions() + generateCode()                  — from playwright-codegen.js
      │
      ▼
  'codeChanged' event → PlaywrightRecorder → RECORDING_EVENTS port message
      │
      ▼
  Loadster dashboard displays generated playwright-test code
```

### Playwright Overlay

`INJECTION_SCRIPT` (in `RecorderController.ts`) instantiates `InjectedScript`, assigns it to `window.__pw_injectedScript`, then calls `window.__pw_initOverlay(injectedScript)` — the entry point defined in `playwright-overlay/index.ts`. The overlay renders a custom Vue UI and uses the `InjectedScript` instance for selector generation and emitting actions back to the controller via the CDP binding.

## Key Files

| File | Role |
|---|---|
| `scripts/bundle-playwright.mjs` | esbuild bundler — produces three bundles in `src/generated/` |
| `scripts/bundle-overlay.mjs` | Vite build — produces `src/generated/overlayInjected.js` |
| `src/generated/playwright-codegen.js` | Pre-built ESM — `generateCode`, `JavaScriptLanguageGenerator`, `collapseActions`, `shouldMergeAction`, `asLocator` |
| `src/generated/playwright-recorder-source.js` | Pre-built ESM — exports `injectedScriptSource`, `bindingsControllerSource`, `pollingRecorderSource` strings |
| `src/generated/playwright-injected-ctor.js` | Pre-built ESM — exports `getInjectedScriptClass()`; used by `locator-shared/injectedScriptFactory.ts` |
| `src/generated/overlayInjected.js` | Pre-built IIFE — Vue overlay bundle injected by `INJECTION_SCRIPT` |
| `src/background/PlaywrightRecorder.ts` | Extension integration — creates RecorderController |
| `src/background/playwright/RecorderController.ts` | CDP controller — attaches debugger, injects recorder, accumulates actions, generates code |
| `src/content/playwright-overlay/index.ts` | Defines `window.__pw_initOverlay(injectedScript)` — mounts overlay via `mountShadowOverlay` |
| `src/content/playwright-overlay/OverlayApp.vue` | Root overlay; 4 modes: record/assertVisible/assertText/assertValue |
| `src/content/playwright-overlay/types.ts` | `Mode` union; `window.__pw_*` flag declarations |

Components and styles are shared with the BrowserRecorder overlay — see `src/content/overlay-shared/` (described in `browser-recorder.md`).

## CDP Binding Protocol

`RecorderController` declares a single binding:

```typescript
const OVERLAY_BINDING = '__pw_overlay_action__';
```

| Binding | Direction | Payload |
|---|---|---|
| `__pw_overlay_action__` | Page → Background | JSON-serialised action object |

Registered via `Runtime.addBinding({ name: OVERLAY_BINDING })`. The injected script calls `window.__pw_overlay_action__(payload)` fire-and-forget; the background receives `Runtime.bindingCalled`.

## Action Format

```typescript
interface ActionInContext {
  frame: { pageGuid: string; pageAlias: string; framePath: string[] };
  action: {
    name: 'click' | 'fill' | 'check' | 'uncheck' | 'selectOption' | 'navigate';
    selector?: string;   // Playwright internal selector
    url?: string;        // for navigate
    text?: string;       // for fill
    signals: [];
  };
  startTime: number;
  endTime: number;
}
```

## Code Generation Pipeline

```
ActionInContext[]
      │
      ▼
  collapseActions()        — merges sequential fill/navigate/click actions
      │
      ▼
  generateCode(actions, JavaScriptLanguageGenerator(true), options)
      │
      ▼
  playwright-test code string
```

`JavaScriptLanguageGenerator(true)` = playwright-test format.

## Selector Generation

The injected recorder generates Playwright internal selectors using a priority order:

1. `data-testid` → `internal:testid=[data-testid="value"s]`
2. `aria-label` + role → `internal:role=button[name="Submit"i]`
3. Button/link by visible text → `internal:role=button[name="Click me"i]`
4. `<label for="...">` text → `internal:label="Password"i`
5. `placeholder` → `internal:attr=[placeholder="Search..."i]`
6. CSS path fallback

`asLocator()` in `playwright-codegen.js` converts these internal strings to human-readable `getByRole(...)`, `getByLabel(...)`, etc. in generated code.

## Build Pipeline (`scripts/bundle-playwright.mjs`)

Runs via `npm run prebuild` (`npm run bundle-playwright && node scripts/bundle-overlay.mjs`).

### Bundle A — `src/generated/playwright-codegen.js`

esbuild + custom `playwright-utils-shim` plugin (intercepts `require('../../utils')` → a minimal shim with only `locatorGenerators`, `stringUtils`, `timeoutRunner`, `protocolFormatter`). Config: `format: 'esm'`, `platform: 'browser'`, `treeShaking: true`.

Named exports: `generateCode`, `toSignalMap`, `JavaScriptLanguageGenerator`, `collapseActions`, `shouldMergeAction`, `asLocator`.

### Bundle B — `src/generated/playwright-recorder-source.js`

Uses `createRequire` to load playwright-core generated sources. Exports three named strings:

| Export | Consumed by |
|---|---|
| `injectedScriptSource` | `RecorderController.ts` — inlined into `INJECTION_SCRIPT` |
| `bindingsControllerSource` | Not currently used |
| `pollingRecorderSource` | Not currently used |

### Bundle C — `src/generated/playwright-injected-ctor.js` (new)

Wraps `injectedScriptSource` in a `(function(module){ … })(__module)` IIFE and exports `getInjectedScriptClass()`. Used by `src/content/locator-shared/injectedScriptFactory.ts` (BrowserRecorder pipeline). Not consumed by `RecorderController`.

**Why:** The extension CSP blocks `eval`/`new Function`. Bundling the IIFE as ordinary module code lets `locator-shared/injectedScriptFactory.ts` instantiate `InjectedScript` without eval.

### Overlay Bundle — `src/generated/overlayInjected.js`

`scripts/bundle-overlay.mjs` is a **Vite programmatic build** (`import { build } from 'vite'` + `@vitejs/plugin-vue`). Entry: `src/content/playwright-overlay/index.ts`. Config: `formats: ['iife']`, `name: '__pw_overlay'`, `assetsInlineLimit: Infinity` (inlines fonts/images as base64). Output: single minified IIFE. Does not bundle `locator-overlay/`.

## Overlay: `playwright-overlay/`

After the `overlay-shared/` extraction, `playwright-overlay/` contains only three files: `OverlayApp.vue`, `index.ts`, `types.ts`.

### `index.ts`

Defines `window.__pw_initOverlay(injectedScript)` — called by `INJECTION_SCRIPT` after instantiating `InjectedScript`:

```typescript
window.__pw_initOverlay = function (injectedScript) {
  if (window.__pw_overlay_loaded) return;
  window.__pw_overlay_loaded = true;
  const { destroy } = mountShadowOverlay({
    rootComponent: OverlayApp,
    provides: { injectedScript },
  });
  window.__pw_destroyOverlay = () => { destroy(); window.__pw_overlay_loaded = false; };
};
```

`mountShadowOverlay` is from `overlay-shared/shadowMount.ts` — see `browser-recorder.md` for details.

### `OverlayApp.vue`

Injects `injectedScript` (from Vue `provide`) for selector generation and `overlayHost` (provided by `mountShadowOverlay`) for the `isSelf()` guard.

**Modes** (`'record' | 'assertVisible' | 'assertText' | 'assertValue'`):

- `record`: badge + toolbar visible; click/change events generate actions.
- `assertVisible` / `assertText` / `assertValue`: click is suppressed (`stopPropagation`/`preventDefault`) and generates the corresponding assert action.

**Top-frame vs iframes:**

- Top frame: renders `OverlayPanel` (draggable badge + toolbar); watches `state.mode` and `broadcastMode()` to all descendant frames via `postMessage`.
- Iframes: renders `HighlightBox` only; listens for `{ __pw_recorder_mode }` messages to sync mode.

`HighlightBox` and `OverlayPanel` are imported from `overlay-shared/components/`.

### `types.ts`

Declares `Mode` and all `window.__pw_*` flags:

```typescript
type Mode = 'record' | 'assertVisible' | 'assertText' | 'assertValue';
// Window: __pw_initOverlay, __pw_destroyOverlay, __pw_overlay_loaded,
//         __pw_overlay_action__, __pw_injectedScript, __pw_recorder_loaded
```

## PlaywrightRecorder.ts

### Overlay Cleanup

`chrome.debugger.detach()` does **not** remove injected DOM nodes. Two cleanup paths exist:

**Normal stop:** `RecorderController.stop()` calls `window.__pw_destroyOverlay()` via `Runtime.evaluate` while CDP is still alive.

**External detach fallback:** When `this.bound` is already `false` (debugger detached externally), `PlaywrightRecorder.stopAndCleanup()` runs:

```typescript
chrome.scripting.executeScript({
  target: { tabId },
  world: 'MAIN',  // required — overlay was injected via CDP into the MAIN world
  func: () => { if (typeof window.__pw_destroyOverlay === 'function') window.__pw_destroyOverlay(); },
}).catch(() => {});
```

`world: 'MAIN'` is critical — the isolated extension world can't access `window.__pw_destroyOverlay`.

### Multi-Tab Inheritance

`onCreatedTab` calls `switchToTab(newTab)` when a new tab is opened from a tracked tab. `switchToTab`:

1. Captures `inheritedActions = oldRecorder.getActions()`.
2. Runs `__pw_destroyOverlay` on the old tab via `chrome.scripting.executeScript({ world: 'MAIN' })`.
3. Calls `attachTab(newTab, inheritedActions)` — `RecorderController` accepts `initialActions` in its constructor, so the action list carries over and code generation continues uninterrupted.

## RecorderController.ts

### Injection Script

`INJECTION_SCRIPT` is a single IIFE that:
1. Guards via `window.__pw_recorder_loaded`.
2. Instantiates `InjectedScript` by inlining `${injectedScriptSource}` (from Bundle B) and assigns `window.__pw_injectedScript = injectedScript`.
3. Inlines `${overlaySource}` (the IIFE from `overlayInjected.js`) and calls `__pw_initOverlay(injectedScript)`.

### start()

1. `chrome.debugger.attach`, `Runtime.enable`, `Runtime.addBinding({ name: OVERLAY_BINDING })`, `Page.enable`.
2. Registers `onDebuggerEvent` + `onDebuggerDetach` listeners; sets `this.bound = true`.
3. `Page.addScriptToEvaluateOnNewDocument(INJECTION_SCRIPT)` + `injectNow()` (Runtime.evaluate into current page).
4. **Initial URL handling:** reads `document.readyState`; if `complete` or `interactive`, synthesises a `navigate` action for the initial URL (since `Page.frameNavigated` won't fire retroactively after CDP attaches).

### Debugger Detach Handling

Chrome shows a "This extension started debugging" infobar. If the user clicks Cancel, `onDebuggerDetach` fires:

1. Guards `if (!this.bound) return` (no-op if already stopped normally).
2. Removes listeners, sets `this.bound = false`, emits `'detached'` with reason string.

`PlaywrightRecorder.attachTab()` listens for `'detached'` → calls `stopAndCleanup()`, posts `RECORDING_STOP` through the port, then `port.disconnect()`.

## IFrame Handling

`Page.addScriptToEvaluateOnNewDocument` injects into all frames. Each frame gets its own `InjectedScript` instance.

### Frame Path Computation

`computeFramePath()` in `OverlayApp.vue` walks up from `window` to `window.top`:

1. Gets `current.frameElement` (null for cross-origin).
2. Calls `current.parent.__pw_injectedScript.generateSelector(frameEl, ...)`.
3. Reverses result (collected child→top, codegen expects top→child).

Included in the CDP binding payload as `framePath: string[]`. `handleRecordedAction` places it in `frame.framePath` — the codegen maps each entry to `.locator(selector).contentFrame()` chains.

**Limitation:** Cross-origin iframes fall back to `framePath: []`.

## Known Limitations and TODOs

- Cross-origin iframe recording: framePath cannot be computed; actions fall back to main-frame attribution.
- Pre-existing iframes at recording start: `injectNow()` only evaluates in the main frame; already-loaded iframes don't get the overlay.
- Use original RecorderTypes and remove `recorderTypes.ts` — internal types are not exported from `playwright-core` npm package.
