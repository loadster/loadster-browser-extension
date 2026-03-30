# Playwright Recorder Implementation Reference

This document describes how the `PlaywrightRecorder.ts` works in the Loadster browser extension.
Use it as a reference for maintenance, debugging, and future changes.

## Overview

The recorder captures user interactions in a Chrome tab and generates valid [playwright-test](https://playwright.dev/docs/api/class-test) code in real time.
To do so, the recorder injects a content script into the page using `PlaywrightController.ts` and communicates with the page via Chrome DevTools Protocol (CDP).
The injected content script includes the original Playwright's [InjectedScript](https://github.com/microsoft/playwright/blob/main/packages/injected/src/injectedScript.ts).
It is supplemented with a custom UI overlay and designed to communicate with `PlaywrightController.ts` directly via CDP.
All the original playwright code is extracted from `playwright-core` at build stage using scripts from `src/scripts/` and bundled into ESM files in `/src/generated` folder for use in the browser extension context.
Generated code is git ignored.

### Pipeline overview

```
Loadster dashboard
      │ NAVIGATE_URL / OPTIONS messages (chrome.runtime port)
      ▼
PlaywrightRecorder (background service worker)
      │ startRecording(tabId)
      ▼
RecorderController
      ├── chrome.debugger.attach(tabId)          — CDP connection
      ├── Runtime.addBinding(__pw_recorderRecordAction) — action channel
      ├── Page.addScriptToEvaluateOnNewDocument(RECORDER_SCRIPT)
      ├── Runtime.evaluate(RECORDER_SCRIPT)      — inject into current page
      │
      │ Runtime.bindingCalled events
      ▼
  collapseActions() + generateCode()             — bundled from playwright-core
      │
      ▼
  'codeChanged' event → PlaywrightRecorder → RECORDING_EVENTS port message
      │
      ▼
  Loadster dashboard displays generated playwright-test code
```

### Playwright Overlay

Being injected into the page by `PlaywrightController` renders a custom overlay and uses the original Playwrgiht's InjectedScript for selector generation and emitting use action events back to the
controller.

## Key Files

| File                                              | Role                                                                                                           |
|---------------------------------------------------|----------------------------------------------------------------------------------------------------------------|
| `scripts/bundle-playwright.mjs`                   | esbuild bundler — produces `src/generated/playwright-codegen.js`                                               |
| `scripts/bundle-overlay.mjs`                      | esbuild bundler — produces `src/generated/overlayInjected.js`                                                  |
| `src/generated/playwright-codegen.js`             | Pre-built ESM (~208KB) — `generateCode`, `JavaScriptLanguageGenerator`, `collapseActions`, `shouldMergeAction` |
| `src/generated/playwright-recorder-source.js`     | Exports `pollingRecorderSource` string (available, not currently used)                                         |
| `src/background/PlaywrightRecorder.ts`            | Extension integration — creates RecorderController                                                             |
| `src/background/playwright/RecorderController.ts` | CDP controller — attaches debugger, injects recorder, accumulates actions, generates code                      

## CDP Binding Protocol

The injected recorder script communicates with the background via a single CDP binding:

| Binding                 | Direction         | Payload                       |
|-------------------------|-------------------|-------------------------------|
| `__pw_overlay_action__` | Page → Background | JSON-serialised action object |

The background registers this binding via `Runtime.addBinding({ name: '__pw_overlay_action__' })`. When the injected script calls `window.__pw_overlay_action__(payload)`, the background receives a `Runtime.bindingCalled` event.
Note: CDP binding functions in the page return `undefined` (not a Promise). The recorder script calls them fire-and-forget.

## Action Format

Actions sent via the binding match the `ActionInContext` interface:

```typescript
interface ActionInContext {
  frame: { pageGuid: string; pageAlias: string; framePath: string[] };
  action: {
    name: 'click' | 'fill' | 'check' | 'uncheck' | 'selectOption' | 'navigate';
    selector?: string;   // Playwright internal selector (e.g. 'internal:role=button[name="OK"i]')
    url?: string;        // for navigate
    text?: string;       // for fill
    signals: [];
    [key: string]: unknown;
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
  playwright-test code string (test() wrapper, await page.goto(), etc.)
```

`JavaScriptLanguageGenerator(true)` means "playwright-test format" (as opposed to raw Playwright script format).

## Selector Generation

The injected recorder generates Playwright internal selectors using a priority order:

1. `data-testid` attribute → `internal:testid=[data-testid="value"s]`
2. `aria-label` + role → `internal:role=button[name="Submit"i]`
3. Button/link by visible text → `internal:role=button[name="Click me"i]`
4. `<label for="...">` text → `internal:label="Password"i`
5. `placeholder` attribute → `internal:attr=[placeholder="Search..."i]`
6. CSS path fallback → `#id` or `tag:nth-child(n) > ...`

The internal selector strings are understood by `asLocator()` in the codegen bundle and are converted to human-readable `getByRole(...)`, `getByLabel(...)` etc. in the generated code.

## Build Pipeline (`scripts/bundle-playwright.mjs`)

Runs via `npm run prebuild`.

### Bundle A — `src/generated/playwright-codegen.js`

Bundles codegen from installed `node_modules/playwright-core/lib/` (CJS) into browser-compatible ESM.

**Entry:** A temporary ESM barrel (`.mjs`) written at build time with explicit `export const` statements — this is required so esbuild produces named exports rather than a default-only bundle.

**Core problem solved:** `playwright-core/lib/utils.ts` barrel uses `__reExport` calls at module level, pulling in Node.js modules (`http`, `net`, etc.) that can't be tree-shaken. A custom esbuild `onResolve` plugin intercepts the
`../../utils` require path from within playwright-core files and redirects to a minimal shim containing only the four isomorphic modules codegen actually uses (`locatorGenerators`, `stringUtils`, `timeoutRunner`, `protocolFormatter`).

**esbuild config:** `format: 'esm'`, `platform: 'browser'`, `bundle: true`, `treeShaking: true`.

### Bundle B — `src/generated/playwright-recorder-source.js`

Extracts the `source` string from `node_modules/playwright-core/lib/generated/pollingRecorderSource.js` and re-exports as `export { source as pollingRecorderSource }`.

Note: `pollingRecorderSource` is available but **not currently injected** into pages — it requires an `InjectedScript` instance that Playwright builds separately. A custom inline recorder is used instead.

## IFrame Handling

`Page.addScriptToEvaluateOnNewDocument` injects the recording script into **all frames** (main frame + iframes) by default. Each frame gets its own `InjectedScript` and overlay instance.

### Overlay Cleanup (Fix: overlay persists after recording stops)

`chrome.debugger.detach()` ends the CDP session but does **not** remove DOM nodes injected by `Runtime.evaluate()`. Without explicit cleanup, the overlay shadow host stays on the page after recording stops.

**Fix:** `index.ts` registers `window.__pw_destroyOverlay()` after mounting. It unmounts the Vue app, removes the shadow host from the DOM, and resets `__pw_overlay_loaded` so re-injection works if recording is restarted.

**Normal stop:** `RecorderController.stop()` calls `__pw_destroyOverlay` via `Runtime.evaluate` while CDP is still alive:

```typescript
await chrome.debugger.sendCommand({ tabId }, 'Runtime.evaluate', {
  expression: 'if (typeof window.__pw_destroyOverlay === "function") window.__pw_destroyOverlay();',
});
```

The call is guarded so it's only sent while `this.bound` is still true (i.e. while the CDP session is alive). The `.catch(() => {})` handles any race where the tab was already closed.

**External detach fallback:** When the debugger is detached externally (user cancels the infobar), `this.bound` is already `false` when `stop()` runs, so the CDP path above is skipped. `PlaywrightRecorder.stopAndCleanup()` handles this case
via `chrome.scripting.executeScript` with `world: 'MAIN'`:

```typescript
chrome.scripting.executeScript({
  target: { tabId },
  world: 'MAIN',  // required — overlay was injected into the MAIN world via CDP Runtime.evaluate
  func: () => {
    if (typeof window.__pw_destroyOverlay === 'function') window.__pw_destroyOverlay();
  },
}).catch(() => {
});
```

`world: 'MAIN'` is critical — without it, `executeScript` runs in the isolated extension world where `window.__pw_destroyOverlay` is not defined.

### Overlay UI (Fix: suppress badge/toolbar in iframes)

`OverlayApp.vue` checks `window === window.top` at setup time (`isTopFrame`).

- **Top frame**: renders HighlightBox + RecordingBadge + ModeToolbar
- **Iframes**: renders HighlightBox only (no badge/toolbar duplication)

Mode changes are synced cross-frame via `postMessage`:

- Top frame watches `state.mode` and recursively broadcasts `{ __pw_recorder_mode }` to all descendant frames
- Iframes listen for `message` events and update local `state.mode`

### Frame Path Computation (Fix: correct selectors for iframe actions)

Each frame's `injectedScript` is exposed as `window.__pw_injectedScript` (set in INJECTION_SCRIPT in `RecorderController.ts`).

When `sendAction()` is called inside an iframe, `computeFramePath()` walks up the frame hierarchy:

1. Gets `current.frameElement` — the `<iframe>` element in the parent doc (null for cross-origin)
2. Calls `current.parent.__pw_injectedScript.generateSelector(frameEl)` to produce a Playwright selector
3. Repeats up to `window.top`, then reverses (collected child→top, codegen expects top→child)

The `framePath` array is included in the CDP binding payload sent to `RecorderController`.

`handleRecordedAction` extracts `framePath` from the payload and places it in `frame.framePath` (not in `action`). The codegen bundle maps each entry to `.locator(selector).contentFrame()` chains in generated code.

**Limitation**: Cross-origin iframes (`frameElement === null`) fall back to `framePath: []` — actions are attributed to the main frame (same behaviour as before the fix).

## Debugger Detach Handling

Chrome shows an infobar "This extension started debugging this browser" when `chrome.debugger.attach()` is called. If the user clicks **Cancel**, Chrome detaches the debugger externally without notifying the recorder directly.

**Fix:** `RecorderController` listens for `chrome.debugger.onDetach` alongside `onEvent`. When a detach is received for the active tab (and `this.bound` is still true), it:

1. Removes both `onEvent` and `onDetach` listeners
2. Sets `this.bound = false`
3. Emits a `'detached'` event with the reason string

`PlaywrightRecorder.attachTab()` listens for `'detached'` and:

1. Calls `this.stopAndCleanup()` — removes listeners, destroys overlay via `chrome.scripting.executeScript({ world: 'MAIN' })`
2. Posts `{ type: RECORDING_STOP }` through the port so the dashboard dialog closes
3. Calls `this.port.disconnect()` — triggers `DISCONNECTED` in the bridge (silent cleanup; dashboard already notified in step 2)

**Guard:** If `stop()` is called first (normal stop from dashboard), `this.bound` is already `false` when `onDetach` fires (Chrome always fires it after `chrome.debugger.detach()`). The guard `if (!this.bound) return` makes the external
detach handler a no-op in this case, preventing double cleanup.

## Known Limitations and TODOs

- Cross-origin iframe recording: framePath cannot be computed; actions fall back to main-frame attribution.
- Pre-existing iframes at recording start: `injectNow()` only evaluates in the main frame, so iframes already loaded don't get the overlay injected.
- Choose between playwright-core from node_modules or from the fetch-playwrgiht.js script.
- Use original RecorderTypes and remove `recorderTypes.ts`. Look for types in `playwright` packages.
