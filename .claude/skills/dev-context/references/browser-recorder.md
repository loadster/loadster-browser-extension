[# Browser Recorder Implementation Reference]()

This document describes how the `BrowserRecorder.ts` works in the Loadster browser extension.
Use it as a reference for maintenance, debugging, and future changes.

## Overview

The BrowserRecorder captures user interactions (clicks, form changes, hover events, navigation) and generates Loadster browser step events in real time. Unlike the PlaywrightRecorder, it works in both **Chrome and Firefox** because it does
not rely on CDP/debugger APIs — only standard WebExtension APIs.

The recorder uses two content scripts injected into the recorded page:

- `windowEventRecorder.js` runs in the **MAIN world** to intercept DOM events and generate CSS selectors
- `contentTab.js` runs in the **ISOLATED world** to bridge between the page and the background script

### Pipeline Overview

```
Loadster dashboard
      │ NAVIGATE_URL message (chrome.runtime port)
      ▼
BrowserRecorder (background service worker)
      │ registers windowEventRecorder.js (MAIN world, document_start)
      │ injects contentTab.js on every navigation commit
      ▼
contentTab.js (ISOLATED world, outermost_frame)
      │ browser.runtime.connect({ endpointName: ENDPOINT_PAGE_CONNECT })
      │ background calls setupPageContentPort(port)
      │ CustomEvent ↔ port.postMessage bridge
      ▼
windowEventRecorder.js (MAIN world)
      │ monkey-patches Element.prototype.addEventListener
      │ listens for click, change, select, submit, mouseenter, mouseover
      │ generates CSS selectors via @medv/finder
      │ dispatches USER_ACTION CustomEvent to window.top
      ▼
contentTab.js forwards USER_ACTION → background via port
      ▼
BrowserRecorder.uploadBrowserEvent() → RECORDING_EVENTS → Loadster dashboard
```

## Key Files

| File                                 | Role                                                                                                            |
|--------------------------------------|-----------------------------------------------------------------------------------------------------------------|
| `src/background/BrowserRecorder.ts`  | Background — manages recording lifecycle, registers content scripts, handles navigation events                  |
| `src/content/windowEventRecorder.js` | MAIN world script — intercepts user events, generates CSS selectors via `@medv/finder`, dispatches CustomEvents |
| `src/content/contentTab.js`          | ISOLATED world bridge — relays CustomEvents from page to background port and port messages back to page         |
| `src/utils/windowUtils.js`           | `overrideEventListeners()` and `setupCSSHoverEventListener()` utilities used by `windowEventRecorder.js`        |

Both `contentTab.js` and `windowEventRecorder.js` are listed as `additionalInputs` in `vite.config.js` so Vite bundles them as separate output files, not as part of the main bundle.

## Content Script Injection

### windowEventRecorder.js (MAIN world)

Registered dynamically at BrowserRecorder construction time — before any tab is opened — to ensure the script is present from `document_start` the moment the recording tab navigates.

- **MV3 (Chrome):** `browser.scripting.registerContentScripts` with `world: 'MAIN'`, `runAt: 'document_start'`, `matches: '*://*/*'`
- **MV2 (Firefox):** `browser.contentScripts.register` (object stored in `this.registeredScripts` for cleanup)
- **Excluded:** `localhost/*`, `loadster.com/*`, `loadster.app/*`

On `stopAndCleanup`, the script is unregistered so it no longer runs on subsequent navigations.

### contentTab.js (ISOLATED world)

Injected on each `webNavigation.onCommitted` event for tracked tabs (outermost_frame only; Firefox injects on all frames).

- **MV3:** `browser.scripting.executeScript({ target: { tabId, allFrames: true }, files: ['src/content/contentTab.js'] })`
- **MV2:** `browser.tabs.executeScript(tabId, { file: 'src/content/contentTab.js', allFrames: true, runAt: 'document_start' })`

## Why Two Content Scripts?

`windowEventRecorder.js` must run in the **MAIN world** because:

1. It monkey-patches `Element.prototype.addEventListener/removeEventListener` to track which elements have JS event listeners — this only works in the page's own JS context.
2. It reads `document.styleSheets` to discover CSS `:hover` rules for hover event recording.
3. It needs access to the page's real DOM tree for `@medv/finder` selector generation.

**However, MAIN world scripts have no access to `chrome.runtime` or `browser.runtime`.** They cannot open ports to the background script. This is a browser security boundary.

`contentTab.js` runs in the **ISOLATED world** where `browser.runtime.connect()` is available. It acts as a relay:

```
windowEventRecorder.js (MAIN)  ──CustomEvent──▶  contentTab.js (ISOLATED)  ──port.postMessage──▶  background
background  ──port.postMessage──▶  contentTab.js (ISOLATED)  ──CustomEvent──▶  windowEventRecorder.js (MAIN)
```

## contentTab.js — Port Bridge

On injection, `contentTab.js` calls `connect()`:

1. Opens a port to the background: `browser.runtime.connect({ name: JSON.stringify({ endpointName: ENDPOINT_PAGE_CONNECT }) })`
2. `background.ts` routes this connection to `activeRecorder.setupPageContentPort(port)`, establishing the `pagePort` on `BrowserRecorder`
3. Listens for `USER_ACTION` CustomEvents on `window` and forwards them to the background via `port.postMessage`
4. Listens on `port.onMessage` for `RECORDING_STATUS` messages from the background and dispatches them as CustomEvents to the page

**BFCache handling:** A `pageshow` listener detects restoration from the back/forward cache (`event.persisted === true`) and calls `connect()` again since the old port is dead.

**Double-injection guard:** `window.loadsterContentLoaded` flag prevents re-initialization if the script is injected multiple times.

## windowEventRecorder.js — Event Recording

### Initialization

A `window.loadsterRecorderScriptsLoaded` flag prevents double-initialization.

Heavy setup is **deferred until recording is actually enabled** (first `RECORDING_STATUS` event with `enabled: true`):

1. `setupCSSHoverEventListener(false)` — collects `:hover` CSS rules from all stylesheets (deferred to `DOMContentLoaded`)
2. `overrideEventListeners()` — monkey-patches `Element.prototype.addEventListener/removeEventListener` so the recorder can detect which elements have JS listeners
3. Registers event listeners for: `click`, `dbclick`, `change`, `select`, `submit`, `mouseenter`, `mouseover`

### Event Flow

On each recorded event, `recordEvent()`:

1. Checks `enabled` flag and hover filter settings
2. Resolves the target element (applying `recordClickEvents` / `recordHoverEvents` mode logic)
3. Builds a `frameSelector` if running inside an iframe (`addFrameAttributes`)
4. Calls `getCssSelectors(element, frameSelector)` and `getTextSelector(element, frameSelector)`
5. Dispatches the result as `USER_ACTION` CustomEvent on `window.top` so it reaches `contentTab.js` even from iframes

## Selector Generation (@medv/finder)

`getCssSelectors()` calls `finder()` from `@medv/finder` with different configurations to generate three selector categories:

| Category         | Config                                         | Format                               |
|------------------|------------------------------------------------|--------------------------------------|
| `idSelectors`    | ID-only                                        | `#id`                                |
| `classSelectors` | class-only, two passes (seedMinLength 1 and 4) | `.class`                             |
| `otherSelectors` | tagName + attribute, two passes                | `[attr="value"]`, `tag:nth-child(n)` |

A shared `uniqueSelectors` Set deduplicates across all categories. Each selector is prepended with the `frameSelector` for iframe context.

User-configurable `selectorFilters` (from `recordingOptions`) can exclude specific IDs, classes, tags, and attributes via regex patterns.

`getTextSelector()` generates a `text=<content>` selector for leaf elements (no children) with text content that appears exactly once in `document.body`.

## Hover Recording Modes

Controlled by `recordingOptions.recordHoverEvents`:

| Mode               | Behavior                                                                                               |
|--------------------|--------------------------------------------------------------------------------------------------------|
| `'none'` (default) | All hover events ignored                                                                               |
| `'auto'`           | Records if element or an ancestor has a CSS `:hover` rule, or if element has a JS `mouseover` listener |
| `'all'`            | Records all hover events                                                                               |

## Click Recording Modes

Controlled by `recordingOptions.recordClickEvents`:

| Mode                | Behavior                                                                                         |
|---------------------|--------------------------------------------------------------------------------------------------|
| `'exact'` (default) | Uses event target directly                                                                       |
| `'closest'`         | Walks up the DOM looking for an ancestor with `href`, `onclick`, or a captured JS click listener |

## Frame Support

`addFrameAttributes()` computes a `frameSelector` string for iframe context:

- **Named frames:** `iframe[name="frameName"]`
- **Anonymous frames:** walks parent hierarchy finding each frame's index → `iframe[0] iframe[2]`

All selectors and text selectors include this prefix so they are unambiguous in the presence of iframes.

## Navigation Handling

`BrowserRecorder` listens on `browser.webNavigation.onCommitted`:

- For tracked tabs (outermost_frame, or all frames on Firefox): calls `injectForegroundScripts(tabId)` then `updateWindowsRecordingStatus()`
- If `transitionType === 'typed'` or `'link'` with `forward_back` qualifier: also records a `navigate` browser event

## Tab Tracking

`onCreatedTab` override: when a new tab is opened from a tracked tab, **clears `tabIds` and replaces it with only the new tab**. The recorder follows the user into the new tab and stops tracking the previous one. `stopBlinkingTitle()` is
called before clearing.

## Event Upload Format

Each recorded action is wrapped and sent via `RECORDING_EVENTS` to the Loadster dashboard:

```javascript
{
  http: {
  }
,
  browser: {
    [generateId(event.action)]
  :
    event  // unique ID per action
  }
}
```

## Known Limitations and TODOs

- **@medv/finder limitations (high priority — addressed by `LocatorBrowserRecorder`):** Generates CSS-only selectors with no semantic or accessibility awareness. Selectors are fragile on dynamic class names (e.g., CSS-in-JS). `LocatorBrowserRecorder` (see below) uses `@mizchi/selector-generator` (Playwright's engine) and resolves this.

- **Event listener monkey-patching (high priority — addressed by `LocatorBrowserRecorder`):** `overrideEventListeners()` patches `Element.prototype.addEventListener`, which is fragile. The new recorder does not monkey-patch anything.
- **No action collapsing:** Unlike PlaywrightRecorder's `collapseActions()`, every event is sent individually. Rapid sequences (e.g., multiple clicks, multiple `change` events while typing) are not merged, producing noisier recordings.

- **Two content scripts complexity:** The MAIN↔ISOLATED↔background relay adds latency and messaging complexity. Note that CDP is not an option as it only works in Chrome, and the BrowserRecorder is already an alternative solution to PlaywrightRecorder (CDP, chrome only)

- **Cross-origin iframes:** `frameSelector` falls back to index-based addressing (`iframe[n]`) when `window.name` is unavailable. Selectors inside cross-origin iframes cannot be constructed at all due to the security boundary. `LocatorBrowserRecorder` drops the path with `framePath: []` for cross-origin frames (same limitation as PlaywrightRecorder).

- **No visual overlay (low priority):** Unlike PlaywrightRecorder, there is no visible highlight or recording badge injected into the recorded page (only a blinking browser tab title).

---

## LocatorBrowserRecorder — Playwright-style alternative (RecorderType.BROWSER_LOCATOR)

This recorder produces Playwright-quality, accessibility-aware selectors and emits structured `ElementLocatorSpec[]` objects instead of CSS strings. It is intended to eventually replace the legacy `BrowserRecorder`.

| File                                        | Role                                                                                      |
|---------------------------------------------|-------------------------------------------------------------------------------------------|
| `src/background/LocatorBrowserRecorder.ts`  | Background — identical lifecycle to `BrowserRecorder` but registers `locatorRecorder.js` |
| `src/content/locatorRecorder.js`            | MAIN world — uses `@mizchi/selector-generator` to generate Playwright internal selectors  |

### Pipeline

```
LocatorBrowserRecorder (background)
      │ registerPageContentScripts → locatorRecorder.js (MAIN, allFrames)
      │ injectForegroundScripts   → contentTab.js (ISOLATED, allFrames)
      ▼
locatorRecorder.js (each frame, MAIN world)
      │ exposes window.__loadster_generateLocator(el) => rawSelector
      │ on click/dblclick/change/select/submit:
      │   • generateSelector(target) → rawSelector (Playwright internal format)
      │   • toLocator(rawSelector, 'jsonl') → JSON linked list → ElementLocatorSpec[]
      │   • walk parent frames via __loadster_generateLocator → framePath
      │   • dispatch USER_ACTION on window.top
      ▼
contentTab.js (ISOLATED) → background → Loadster dashboard
```

### Event payload (BrowserLocatorEvent)

```typescript
{
  timestamp: number;
  action: 'click' | 'dblclick' | 'change' | 'select' | 'submit';
  locators: ElementLocatorSpec[];       // primary Playwright locator chain
  framePath: ElementLocatorSpec[][];    // one chain per ancestor frame, top→child; [] for top frame
  rawSelector: string;                  // Playwright internal selector (e.g. "internal:role=button[name='OK'i]")
  value?: string;
  tagName: string;
  attrs: Record<string, string>;
  keyboard: { alt, shift, ctrl, meta };
  textContent: string;
  href: string | null;
}
```

### What is NOT included (v1)

- Hover recording
- `recordClickEvents: 'closest'` mode
- Visual overlay
- Code generation

### Selector engine activation

`RecorderType.BROWSER_LOCATOR = 'loadster-browser-locator-recorder'` must be sent from the Loadster dashboard at connect time. The background dispatcher (`background.ts`) constructs `LocatorBrowserRecorder` for this type.
