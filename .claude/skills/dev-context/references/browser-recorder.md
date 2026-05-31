# Browser Recorder Implementation Reference

This document describes how `BrowserRecorder.ts` works in the Loadster browser extension.
Use it as a reference for maintenance, debugging, and future changes.

## Overview

The BrowserRecorder captures user interactions (clicks, form changes, navigation) and generates structured Loadster browser step events in real time. Unlike the PlaywrightRecorder, it works in both **Chrome and Firefox** — no CDP, only standard WebExtension APIs. It uses Playwright's own `InjectedScript` (the same engine used by `playwright codegen`) via `locator-shared/injectedScriptFactory.ts`, and emits structured `ElementLocatorSpec[]` locator chains.

### Pipeline overview

```
BrowserRecorder (background)
      │ registerPageContentScripts → locatorRecorder.js (MAIN, allFrames)
      │ injectForegroundScripts   → locator-overlay/index.js (ISOLATED, allFrames, on navigation)
      ▼
locatorRecorder.js (each frame, MAIN world)
      │ exposes window.__loadster_generateLocator(el) → rawSelector
      │ on click/dblclick/change/select/submit:
      │   • createSelectorGenerator(window, { testIdAttributeName }) → generateSelector
      │   • buildFramePath() from locator-shared/userAction.ts
      │   • dispatchUserAction({ element, action, generateSelector, framePath, keyboard })
      │     → USER_ACTION CustomEvent on window.top
      ▼
locator-overlay/index.js (ISOLATED, each frame)
      │ port.postMessage(USER_ACTION) → background
      │ port.onMessage(RECORDING_STATUS) → CustomEvent on window
      │ [top frame only] mounts OverlayApp via mountShadowOverlay() into closed Shadow DOM
      ▼
BrowserRecorder.setupPageContentPort → uploadBrowserEvent → RECORDING_EVENTS → Loadster dashboard
```

### Recording Overlay

Top frame only. `OverlayApp` provides a draggable recording panel and a pick mode for selecting elements without triggering real clicks.

```
locator-overlay/OverlayApp.vue (ISOLATED, top frame only)
      │ record mode: OverlayPanel (RecordingBadge + ModeToolbar) visible
      │ pick mode:   HighlightBox tracks cursor; click → dispatchUserAction({ action: 'hover' })
      ▼
USER_ACTION CustomEvent (action: 'hover') → port → background → dashboard
```

## Key Files

| File | Role |
|---|---|
| `src/background/BrowserRecorder.ts` | Background recorder class |
| `src/background/Recorder.ts` | Base class — port/tabIds/options/title-blink/PING-PONG |
| `src/background/background.ts` | Factory: `RecorderType.BROWSER` → `new BrowserRecorder(port)` |
| `src/content/locatorRecorder.js` | MAIN-world recorder, all frames; exposes `window.__loadster_generateLocator` |
| `src/content/locator-overlay/index.ts` | ISOLATED-world port bridge + overlay mount; Vue overlay on top frame only |
| `src/content/locator-overlay/OverlayApp.vue` | Root overlay component; record/pick modes |
| `src/content/locator-overlay/types.ts` | `Mode = 'record' \| 'pick'`; `loadsterContentLoaded`/`__loadster_destroyOverlay` window declarations |
| `src/content/locator-shared/injectedScriptFactory.ts` | `createSelectorGenerator(win, opts)` — wraps Playwright `InjectedScript` |
| `src/content/locator-shared/userAction.ts` | `dispatchUserAction`, `buildFramePath`, `TEST_ID_ATTRIBUTE_NAME` |
| `src/content/locator-shared/selectorAdapter.ts` | `adaptSelector()` + `includeElementAttributes()`; Playwright selector string → `ElementLocatorSpec[]` |
| `src/content/locator-shared/globals.d.ts` | MAIN-world window flag types (`loadsterLocatorRecorderLoaded`, `__loadster_generateLocator`) |
| `src/content/overlay-shared/shadowMount.ts` | `mountShadowOverlay({ rootComponent, provides })` — shadow host + closed shadow root + Vue app; provides `'overlayHost'` |
| `src/content/overlay-shared/fonts.ts` | `fontFaceCSS` — Overpass @font-face rules (weights 300/400/600/800) |
| `src/content/overlay-shared/styles.css` | All overlay styles: panel, badge, toolbar, highlight-box, `__ls_pulse__` keyframes |
| `src/content/overlay-shared/types.ts` | `ModeDef { id: string; label: string }` |
| `src/content/overlay-shared/composables/useDraggable.ts` | Pointer-based drag for the panel; clamps to viewport |
| `src/content/overlay-shared/components/HighlightBox.vue` | Hover rect + selector label (pick mode) |
| `src/content/overlay-shared/components/ModeToolbar.vue` | Mode switcher buttons |
| `src/content/overlay-shared/components/OverlayPanel.vue` | Draggable panel: RecordingBadge + separator + ModeToolbar + grip |
| `src/content/overlay-shared/components/RecordingBadge.vue` | Pulsing dot + status text |
| `src/content/loadsterBridge.ts` | Dashboard-side bridge — opens port via `BridgeEvent.CONNECT` |
| `index.ts` | `BridgeEvent`, `RecorderMessageType`, `RecorderType` enums + shared types |

## Content Script Injection

`BrowserRecorder` uses `pageContentScriptId = 'loadster-locator-recorder'` for the persistent dynamic content script.

**MV3 (Chrome)** — `browser.scripting.registerContentScripts`:

| Script | File | World | `allFrames` | `runAt` | `matchOriginAsFallback` |
|---|---|---|---|---|---|
| recorder | `src/content/locatorRecorder.js` | `MAIN` | `true` | `document_end` | `true` |

**MV2 (Firefox)** — `browser.contentScripts.register`: same file and `allFrames`; no `world` field (isolated world is sufficient for event capture on Firefox MV2).

Both use `excludeMatches: ['*://localhost/*', 'https://loadster.com/*', 'https://loadster.app/*']`.

`locator-overlay/index.js` is **not** registered persistently — injected dynamically into tracked tabs on each navigation commit via `injectForegroundScripts` (all frames) and `injectSubFrameScript` (single sub-frame).

`BrowserRecorder.cleanupStaleScripts()` is a static method called at background startup to unregister any leftover scripts from a previous service-worker cycle (MV3 only).

## Why Two Content Scripts?

DOM event listeners and `window.__loadster_generateLocator` must run in the **MAIN world** to access the real page DOM. ISOLATED-world scripts can't access MAIN-world globals but do have `browser.runtime.connect()` — so `locator-overlay/index.ts` acts as the port relay and mounts the Vue overlay.

## Port Bridge (overlay module)

On injection, `locator-overlay/index.ts` calls `connect()`:

1. Opens a port: `browser.runtime.connect({ name: JSON.stringify({ endpointName: ENDPOINT_PAGE_CONNECT }) })` → routes to `BrowserRecorder.setupPageContentPort(port)`.
2. Listens for `USER_ACTION` CustomEvents on `window` and forwards them over the port.
3. Listens on `port.onMessage` for `RECORDING_STATUS` — dispatches as CustomEvents on `window` and caches the last one in `lastStatusMessage`.

**Replay-last-status:** `locatorRecorder.js` (MAIN) may load after the initial status was sent. The overlay listens for `loadster-locator-recorder-ready` and replays `lastStatusMessage` when it fires. `replayLastStatus()` is also called directly after mounting the Vue overlay so it activates immediately.

**BFCache handling:** A `pageshow` listener reconnects the port when `event.persisted === true`.

**Double-injection guard:** `window.loadsterContentLoaded` prevents re-initialization if the script is injected multiple times into the same frame.

## Event Recording (MAIN world)

`locatorRecorder.js` runs in every frame of the recorded page.

**Init guard:** `window.loadsterLocatorRecorderLoaded` prevents double-initialization.

**Startup:** Dispatches `loadster-locator-recorder-ready` immediately after registering the `RECORDING_STATUS` listener. The ordering matters for Firefox isolated-world where the overlay's `replayLastStatus()` dispatch is synchronous.

**Activation:** On the first `RECORDING_STATUS` CustomEvent with `enabled: true`:

1. Creates `generateSelector = createSelectorGenerator(window, { testIdAttributeName: TEST_ID_ATTRIBUTE_NAME })` from `locator-shared/injectedScriptFactory.ts`.
2. Exposes `window.__loadster_generateLocator(el)` — used by child frames when building their frame path.
3. Attaches listeners for `EVENTS = ['click', 'dblclick', 'change', 'select', 'submit']`.

The `initialized` flag prevents duplicate listener registration if recording is stopped and re-enabled.

Each event calls `dispatchUserAction({ element, action, generateSelector, framePath, keyboard })` from `locator-shared/userAction.ts`. The function builds the full event payload and dispatches a `USER_ACTION` CustomEvent **always on `window.top`** so iframe events reach the top-frame port bridge.

## Selector Generation

`createSelectorGenerator(win, { testIdAttributeName })` from `locator-shared/injectedScriptFactory.ts` instantiates Playwright's `InjectedScript` class:

```typescript
new InjectedScriptCtor(win, {
  sdkLanguage: 'javascript', testIdAttributeName, browserName: 'chromium',
  stableRafCount: 1, isUtilityWorld: false, customEngines: [],
})
```

`InjectedScriptCtor` is imported from `src/generated/playwright-injected-ctor.js` — a build artifact that inlines the `injectedScriptSource` IIFE as ordinary module code (avoiding the extension CSP's ban on `eval`/`new Function`).

Calling `generateSelector(el, { testIdAttributeName })` returns `{ selector, selectors }` where `selector` is a Playwright internal selector string (e.g. `"internal:role=button[name='Submit'i]"`).

`adaptSelector(rawSelector)` in `src/content/locator-shared/selectorAdapter.ts` converts this to an `ElementLocatorSpec[]`:
- Calls `asLocator('jsonl', rawSelector)` from `playwright-codegen.js` → JSONL string
- Walks the linked-list chain, mapping each `{ kind, body, options }` via `nodeToSpec`:

| `kind` | `ElementLocatorSpec.method` |
|---|---|
| `role` | `getByRole` |
| `text` | `getByText` |
| `label` | `getByLabel` |
| `placeholder` | `getByPlaceholder` |
| `alt` | `getByAltText` |
| `title` | `getByTitle` |
| `test-id` | `getByTestId` |
| `nth` | `nth` |
| `first` / `last` | `first` / `last` |
| `has-text` / `has-not-text` / `has` / `hasNot` | `filter` |
| `frame-locator` | `frameLocator` |
| _(default)_ | `locator` |

Falls back to `[{ method: 'locator', selector: rawSelector }]` on parse error.

**Two independent instances:** The overlay (`OverlayApp.vue`) creates its own `generateSelector` via `createSelectorGenerator` on first enable. ISOLATED and MAIN worlds don't share a `window`, so they can't share the same instance.

## Recording Overlay (ISOLATED world)

`locator-overlay/index.ts` mounts when `window === window.top` and `window.loadsterContentLoaded` is not set.

**Setup:**

1. Calls `mountShadowOverlay({ rootComponent: OverlayApp })` from `overlay-shared/shadowMount.ts`. This helper creates a fixed-position host `<div>` (`z-index: 2147483646`, `pointer-events: none`), attaches a closed shadow root, injects `fontFaceCSS + overlayStyles` into it, mounts the Vue app with `'overlayHost'` provided, and returns a `destroy()` closure.
2. Registers `window.__loadster_destroyOverlay()` — calls `destroy()`, disconnects the port, resets `loadsterContentLoaded`.
3. Calls `replayLastStatus()` directly after mount so the overlay activates immediately if a status was already received.

**Components (from `overlay-shared/components/`):**

- `HighlightBox.vue` — positions a highlight rect + selector label over the hovered element (pick mode only)
- `OverlayPanel.vue` — draggable panel that composes `RecordingBadge` + separator + `ModeToolbar` with a `⠿` grip handle wired to `useDraggable`
- `RecordingBadge.vue` — pulsing dot indicator with configurable label text
- `ModeToolbar.vue` — buttons to switch between `record` and `pick` modes

**Modes (`type Mode = 'record' | 'pick'`):**

- `record`: panel visible; all DOM events pass through normally
- `pick`: additionally shows `HighlightBox`; click captures the element without triggering the real click

The `isSelf(el)` guard prevents the overlay from responding to its own shadow elements.

## Pick Mode (Hover Recording)

In `pick` mode, `OverlayApp.vue` intercepts mouse events at the document level (capture phase):

- **`mousemove`** — debounced with `requestAnimationFrame`; updates `hoveredRect` and `hoveredSelector`. Listeners are `{ capture: true, passive: true }`.
- **`mouseleave`** — clears the hover highlight.
- **`click`** — calls `e.stopPropagation()` + `e.preventDefault()` to suppress the real click, then calls `emitHoverAction(el)`:
  - Calls `dispatchUserAction({ element: el, action: 'hover', generateSelector })` (no framePath/keyboard)
- **`keydown` Escape** — exits `pick` back to `record` mode.

## Frame Support

`locatorRecorder.js` runs in all frames (`allFrames: true`). Each frame exposes its own `window.__loadster_generateLocator`.

When `recordEvent` fires inside an iframe, `buildFramePath()` from `locator-shared/userAction.ts` walks up the frame hierarchy:
- For each step, calls `parent.__loadster_generateLocator(frameElement)` to get the iframe's selector
- Stops if `cur.frameElement` is `null` (cross-origin boundary) or the parent lacks the locator helper
- Returns the path reversed to top→child order

`dispatchUserAction` flattens the frame path in front of the element's locator chain:
```javascript
locators = [...framePath.flat(), ...adaptSelector(raw.selector)]
```

`locators` is a single flat `ElementLocatorSpec[]` — there is no separate `framePath` field in the event payload.

**Cross-origin frames:** `cur.frameElement` returns `null` when crossing an origin boundary; the walk stops and the frame context is lost.

## Navigation Handling

`BrowserRecorder` listens on `browser.webNavigation.onCommitted` for tracked tabs:

| Condition | Action |
|---|---|
| Firefox (all frames) OR `frameType === 'outermost_frame'` | `injectForegroundScripts(tabId)` — (re-)injects `locator-overlay/index.js` into all frames, then calls `updateWindowsRecordingStatus()` |
| `frameType === 'sub_frame'` | `injectSubFrameScript(tabId, frameId)` — injects into that single sub-frame only |
| `transitionType === 'typed'` | Records a `navigate` browser event |
| `transitionType === 'link'` + `forward_back` qualifier | Records a `navigate` browser event |

`injectForegroundScripts` also sends a `RECORDING_TRACKING` message (`type: 'inject-content-script'`) to the dashboard.

## Tab Tracking

`onCreatedTab` override: when a new tab is opened from a tracked tab, `stopBlinkingTitle()` is called, `tabIds` is cleared, and only the new tab's ID is added. The recorder follows the user into the new tab.

## Event Upload Format

Each user interaction produces this payload inside `USER_ACTION` (built by `dispatchUserAction` in `locator-shared/userAction.ts`):

```typescript
{
  timestamp: number;                 // Date.now() at capture time
  action: 'click' | 'dblclick' | 'change' | 'select' | 'submit' | 'hover';
  locators: ElementLocatorSpec[];    // flat chain: frameLocator steps (if any) + element locators
  value?: string;                    // element.value (inputs, selects)
  tagName: string;                   // element.tagName
  rawSelector: string;               // best Playwright internal selector string
  rawSelectors: string[];            // all candidate selectors
  element: string;                   // alias for rawSelector (backwards compat)
  selectors: string[];               // alias for rawSelectors (backwards compat)
  attrs: Record<string, string>;     // all element attributes via includeElementAttributes()
  keyboard: { alt, shift, ctrl, meta: boolean };
  textContent: string;
  href: string | null;
}
```

`BrowserRecorder.uploadBrowserEvent` wraps the event in a `BrowserEvent` envelope keyed by a generated ID and sends it as `RECORDING_EVENTS`.

## Dashboard Bridge

`src/content/loadsterBridge.ts` is a content script injected into the Loadster dashboard origin. It:

1. Dispatches `BridgeEvent.READY` on load.
2. Listens for `BridgeEvent.CONNECT` — calls `browser.runtime.connect({ name: JSON.stringify({ recorderType }) })` → `background.ts` creates `new BrowserRecorder(port)`.
3. Relays port messages to the dashboard (as CustomEvents): `RECORDING_EVENTS`, `RECORDING_STOP`, `PONG`, `RECORDING_TRACKING`.
4. Relays dashboard commands to the port: `BridgeEvent.SEND` → `port.postMessage`, `BridgeEvent.STOP` → `port.postMessage(RECORDING_STOP)`.

## Window Flags

| Flag | World | Set by | Purpose |
|---|---|---|---|
| `loadsterLocatorRecorderLoaded` | MAIN | `locatorRecorder.js` | Prevents double-initialization |
| `__loadster_generateLocator(el)` | MAIN | `locatorRecorder.js` | Cross-frame iframe locator helper |
| `loadsterContentLoaded` | ISOLATED | `locator-overlay/index.ts` | Prevents double-injection of bridge+overlay |
| `__loadster_destroyOverlay()` | ISOLATED | `locator-overlay/index.ts` | Explicit teardown (top frame only) |

## Constants Reference

All enums are defined in `index.ts` (repo root): `BridgeEvent` (dashboard CustomEvent names), `RecorderMessageType` (port message types between background/content/dashboard), `RecorderType` (recorder factory keys).

## Known Limitations and TODOs

- **Cross-origin iframes:** `buildFramePath()` stops at origin boundaries; actions from cross-origin iframes carry no frame-locator prefix.
- **Overlay pick mode top-frame only:** The overlay runs only on the top frame. There is no pick mode for selecting elements inside iframes.
- **`testIdAttributeName` is hardcoded:** `TEST_ID_ATTRIBUTE_NAME = 'data-testid'` in `locator-shared/userAction.ts`. A user preference mechanism is noted in `locatorRecorder.js`.
