# Browser Recorder Implementation Reference

This document describes how `BrowserRecorder.ts` works in the Loadster browser extension.
Use it as a reference for maintenance, debugging, and future changes.

## Overview

The BrowserRecorder captures user interactions (clicks, form changes, navigation) and generates structured Loadster browser step events in real time. Unlike the PlaywrightRecorder, it works in both **Chrome and Firefox** because it does not rely on CDP — only standard WebExtension APIs plus `@mizchi/selector-generator` for Playwright-quality, accessibility-aware selectors. The recorder emits structured `ElementLocatorSpec[]` locator chains instead of CSS strings.

### Pipeline overview

```
BrowserRecorder (background)
      │ registerPageContentScripts → locatorRecorder.js (MAIN, allFrames)
      │ injectForegroundScripts   → locator-overlay/index.js (ISOLATED, allFrames, on navigation)
      ▼
locatorRecorder.js (each frame, MAIN world)
      │ exposes window.__loadster_generateLocator(el) → rawSelector
      │ on click/dblclick/change/select/submit:
      │   • generateSelector(target) → { selector, selectors }
      │   • buildFramePath() → frameLocator steps from ancestor frames
      │   • locators = [...framePath.flat(), ...adaptSelector(rawSelector)]
      │   • dispatch USER_ACTION CustomEvent on window.top
      ▼
locator-overlay/index.js (ISOLATED, each frame)
      │ port.postMessage(USER_ACTION) → background
      │ port.onMessage(RECORDING_STATUS) → CustomEvent on window
      │ [top frame only] mounts Vue 3 OverlayApp into closed Shadow DOM
      ▼
BrowserRecorder.setupPageContentPort → uploadBrowserEvent → RECORDING_EVENTS → Loadster dashboard
```

### Recording Overlay

The overlay runs in the same ISOLATED-world script as the port bridge, top frame only. It provides a visual recording indicator and a "pick mode" for selecting elements without triggering real clicks.

```
locator-overlay/index.js (ISOLATED, top frame only — overlay section)
      │ mounts Vue 3 OverlayApp into closed Shadow DOM
      │ record mode: RecordingBadge + ModeToolbar visible
      │ pick mode:   HighlightBox tracks cursor; click → emitHoverAction (not a real click)
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
| `src/content/locator-overlay/index.ts` | ISOLATED-world overlay + port bridge; Vue overlay on top frame, port bridge in every frame |
| `src/content/locator-overlay/OverlayApp.vue` | Root overlay component; record/pick modes |
| `src/content/locator-overlay/components/HighlightBox.vue` | Hover rect + selector label |
| `src/content/locator-overlay/components/ModeToolbar.vue` | Mode switcher buttons |
| `src/content/locator-overlay/components/RecordingBadge.vue` | Pulsing dot + status text |
| `src/content/locator-overlay/styles.css` | Overlay styles, `__ls_pulse__` animation, Overpass font rules |
| `src/content/locator-shared/selectorAdapter.ts` | `adaptSelector()` + `includeElementAttributes()`; JSONL node-chain → `ElementLocatorSpec[]` |
| `src/content/loadsterBridge.ts` | Dashboard-side bridge — opens port via `BridgeEvent.CONNECT` |
| `index.ts` | `BridgeEvent`, `RecorderMessageType`, `RecorderType` enums + shared types |

## Content Script Injection

`BrowserRecorder` registers one persistent dynamic content script via `SCRIPT_IDS`:

```typescript
const SCRIPT_IDS = {
  recorder: 'loadster-locator-content-scripts',
};
```

**MV3 (Chrome)** — `browser.scripting.registerContentScripts`:

| Script | File | World | `allFrames` | `runAt` | `matchOriginAsFallback` |
|---|---|---|---|---|---|
| recorder | `src/content/locatorRecorder.js` | `MAIN` | `true` | `document_end` | `true` |

**MV2 (Firefox)** — `browser.contentScripts.register`: same file and `allFrames` value; no `world` field (recorder sets `world: 'MAIN'`).

Both scripts use `excludeMatches: ['*://localhost/*', 'https://loadster.com/*', 'https://loadster.app/*']`.

`locator-overlay/index.js` is **not** registered persistently — it is injected dynamically into tracked tabs on each navigation commit via `injectForegroundScripts` (all frames) and `injectSubFrameScript` (single sub-frame). See [Navigation Handling](#navigation-handling).

`BrowserRecorder.cleanupStaleScripts()` is a static method called at background startup to unregister any leftover scripts from a previous service-worker cycle (MV3 only). It also removes the legacy overlay ID `'loadster-locator-overlay'` to clean up registrations from older extension versions.

## Why Two Content Scripts?

DOM event listeners and `window.__loadster_generateLocator` must run in the **MAIN world** to access the real page DOM and share `window` with the page's own scripts. However, MAIN-world scripts have no access to `browser.runtime` — no ports, no messaging.

`locator-overlay/index.js` runs in the **ISOLATED world**, where `browser.runtime.connect()` is available. It acts as the relay between the MAIN-world recorder and the background service worker, and also owns the Vue overlay UI on the top frame.

## Port Bridge (overlay module)

On injection, `locator-overlay/index.ts` calls `connect()`:

1. Opens a port to the background: `browser.runtime.connect({ name: JSON.stringify({ endpointName: ENDPOINT_PAGE_CONNECT }) })`
2. The background routes this to `BrowserRecorder.setupPageContentPort(port)`, establishing `this.pagePort`
3. Listens for `USER_ACTION` CustomEvents on `window` and forwards them: `port.postMessage({ type: USER_ACTION, data: event.detail })`
4. Listens on `port.onMessage` for `RECORDING_STATUS` messages — dispatches them as CustomEvents to `window` AND caches the last one in `lastStatusMessage`

**Replay-last-status:** `locatorRecorder.js` (MAIN) may load after the initial status was sent. The overlay module listens for one custom event and replays `lastStatusMessage` when it fires:

```javascript
window.addEventListener('loadster-locator-recorder-ready', replayLastStatus);
```

After mounting the Vue overlay (top frame only), `replayLastStatus()` is also called directly in-process so the overlay activates immediately if a status was already received.

**BFCache handling:** A `pageshow` listener detects restoration from the back/forward cache (`event.persisted === true`) and calls `connect()` again since the old port is dead.

**Double-injection guard:** `window.loadsterContentLoaded` flag prevents re-initialization if the script is injected multiple times into the same frame.

## Event Recording (MAIN world)

`locatorRecorder.js` runs in every frame of the recorded page.

**Init guard:** `window.loadsterLocatorRecorderLoaded` prevents double-initialization.

**Startup:** Dispatches `loadster-locator-recorder-ready` immediately so the overlay module can replay the last `RECORDING_STATUS` to this frame.

**Activation:** On the first `RECORDING_STATUS` CustomEvent with `enabled: true`:

1. Creates `generateSelector = createSelectorGenerator(window, false, 'javascript', 'data-testid')`
2. Exposes `window.__loadster_generateLocator(el)` — used by child frames when building their frame path
3. Attaches listeners for `['click', 'dblclick', 'change', 'select', 'submit']`

The `initialized` flag prevents duplicate listener registration if recording is stopped and re-enabled.

## Selector Generation

The selector pipeline uses `@mizchi/selector-generator` (^1.50.0-next):

1. `createSelectorGenerator(window, false, 'javascript', 'data-testid')` returns a `generateSelector(el, opts)` function.
2. Calling `generateSelector(el, { testIdAttributeName: 'data-testid' })` returns `{ selector, selectors }` where `selector` is a Playwright internal selector string (e.g. `"internal:role=button[name='Submit'i]"`).
3. `adaptSelector(rawSelector)` in `src/content/locator-shared/selectorAdapter.ts` converts this to an `ElementLocatorSpec[]`:
   - Calls `toLocator(rawSelector, 'jsonl')` → a JSON linked-list string
   - Walks `node.next` chain, mapping each `{ kind, body, options }` via `nodeToSpec`:

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

If `toLocator` or JSON parsing fails, falls back to `[{ method: 'locator', selector: rawSelector }]`.

**Two independent instances:** The overlay (`OverlayApp.vue`) creates its own `generateSelector` via `createSelectorGenerator` on first enable. It cannot share the MAIN-world instance from `locatorRecorder.js` because ISOLATED and MAIN worlds do not share a `window` object.

## Recording Overlay (ISOLATED world)

`src/content/locator-overlay/index.ts` mounts when `window === window.top` and `window.loadsterContentLoaded` has not been set (also covered by allFrames injection — only the top frame mounts).

**Setup:**

1. Creates a fixed-position `<div>` host (`zIndex: '2147483646'`, `pointerEvents: 'none'`)
2. Attaches a **closed** Shadow DOM (inaccessible from the page's JS)
3. Inlines `styles.css` + Overpass font `@font-face` rules into the shadow root
4. Mounts Vue 3 `OverlayApp` via `createApp(...).mount(mountPoint)` (Vue calls `onMounted` synchronously during `mount()`)
5. Registers `window.__loadster_destroyOverlay()` — unmounts the app, removes the host, disconnects the port, resets `loadsterContentLoaded`
6. Calls `replayLastStatus()` directly after mount so the overlay activates immediately if a `RECORDING_STATUS` was already received before mount

**Components:**

- `HighlightBox.vue` — positions a highlight rect + selector label over the hovered element (pick mode only)
- `RecordingBadge.vue` — pulsing dot indicator with "Recording" / "Pick mode" text
- `ModeToolbar.vue` — buttons to switch between `record` and `pick` modes

**Modes (`type Mode = 'record' | 'pick'`):**

- `record`: badge and toolbar visible; all DOM events pass through normally
- `pick`: additionally shows `HighlightBox`; click captures the element without triggering the real click (see [Pick Mode](#pick-mode-hover-recording))

The `isSelf(el)` guard (`el === host || host.contains(el)`) prevents the overlay from responding to its own shadow elements.

## Pick Mode (Hover Recording)

In `pick` mode, `OverlayApp.vue` intercepts mouse events at the document level (capture phase):

- **`mousemove`** — debounced with `requestAnimationFrame`; updates `hoveredRect` and `hoveredSelector` for `HighlightBox` display. Listeners are `{ capture: true, passive: true }` for performance.
- **`mouseleave`** — clears the hover highlight.
- **`click`** — calls `e.stopPropagation()` + `e.preventDefault()` to suppress the real click, then calls `emitHoverAction(el)`:
  - Generates selector with the overlay's own `generateSelector` instance
  - Dispatches a `USER_ACTION` CustomEvent on `window.top` with `action: 'hover'`
  - Payload matches the standard browser event format (see [Event Upload Format](#event-upload-format))
- **`keydown` Escape** — exits `pick` back to `record` mode.

This replaces v1's passive hover tracking with an explicit, click-triggered element picker that avoids interfering with hover-triggered UI.

## Frame Support

`locatorRecorder.js` runs in all frames (`allFrames: true`). Each frame exposes its own `window.__loadster_generateLocator`.

When `recordEvent` fires inside an iframe, `buildFramePath()` walks up the frame hierarchy:

```javascript
function buildFramePath() {
  const path = [];
  let cur = window;
  while (cur !== cur.top) {
    const frameEl = cur.frameElement;
    if (!frameEl || typeof cur.parent.__loadster_generateLocator !== 'function') break;
    const sel = cur.parent.__loadster_generateLocator(frameEl);
    if (!sel) break;
    path.push([{ method: 'frameLocator', selector: sel }]);
    cur = cur.parent;
  }
  return path.reverse(); // collected child→top, returned top→child
}
```

The resulting frame path is flattened and prepended to the element's own locator chain:

```javascript
const locators = [...framePath.flat(), ...adaptSelector(raw.selector)];
```

`locators` is a single flat `ElementLocatorSpec[]` that includes both the frame-locator steps and the element locators — there is no separate `framePath` field in the event payload.

**Cross-origin frames:** `cur.frameElement` returns `null` when crossing an origin boundary; the walk stops and the frame context is lost (locators contain element steps only, with no frame prefix).

## Navigation Handling

`BrowserRecorder` listens on `browser.webNavigation.onCommitted` for tracked tabs:

| Condition | Action |
|---|---|
| Firefox (all frames) OR `frameType === 'outermost_frame'` | `injectForegroundScripts(tabId)` — (re-)injects `locator-overlay/index.js` into all frames, then calls `updateWindowsRecordingStatus()` |
| `frameType === 'sub_frame'` | `injectSubFrameScript(tabId, frameId)` — injects `locator-overlay/index.js` into that single sub-frame only |
| `transitionType === 'typed'` | Records a `navigate` browser event |
| `transitionType === 'link'` + `forward_back` qualifier | Records a `navigate` browser event |

`injectForegroundScripts` also sends a `RECORDING_TRACKING` message (`type: 'inject-content-script'`) to the dashboard for diagnostic purposes.

## Tab Tracking

`onCreatedTab` override: when a new tab is opened from a tracked tab, `stopBlinkingTitle()` is called, `tabIds` is cleared, and only the new tab's ID is added. The recorder follows the user into the new tab and stops tracking the previous one.

## Event Upload Format

Each user interaction recorded by `locatorRecorder.js` (or the overlay's `emitHoverAction`) produces this payload inside `USER_ACTION`:

```typescript
{
  timestamp: number;                 // Date.now() at capture time
  action: 'click' | 'dblclick' | 'change' | 'select' | 'submit' | 'hover';
  locators: ElementLocatorSpec[];    // flat chain: frameLocator steps (if any) + element locators
  value?: string;                    // element.value (inputs, selects)
  tagName: string;                   // element.tagName
  rawSelector: string;               // best Playwright internal selector string
  rawSelectors: string[];            // all candidate selectors from @mizchi/selector-generator
  element: string;                   // alias for rawSelector (backwards compat)
  selectors: string[];               // alias for rawSelectors (backwards compat)
  attrs: Record<string, string>;     // all element attributes serialised by includeElementAttributes()
  keyboard: {
    alt: boolean;
    shift: boolean;
    ctrl: boolean;
    meta: boolean;
  };
  textContent: string;
  href: string | null;               // element.href or null
}
```

`BrowserRecorder.uploadBrowserEvent` wraps the event in a `BrowserEvent` envelope keyed by a generated ID and sends it as `RECORDING_EVENTS` to the dashboard.

## Dashboard Bridge

`src/content/loadsterBridge.ts` is a content script injected into the Loadster dashboard origin (via manifest `content_scripts`). It is the entry point for the entire recording session:

1. On load, dispatches `BridgeEvent.READY` so the dashboard knows the extension is present
2. Listens for `BridgeEvent.CONNECT` CustomEvent on `window`; the event's `detail.name` carries the `RecorderType`
3. Calls `browser.runtime.connect({ name: JSON.stringify({ recorderType }) })` → `background.ts` matches `recorderType === RecorderType.BROWSER` → creates `new BrowserRecorder(port)`
4. Relays port messages to the dashboard (as CustomEvents on `window`): `RECORDING_EVENTS`, `RECORDING_STOP`, `PONG`, `RECORDING_TRACKING`
5. Relays dashboard commands to the background port: `BridgeEvent.SEND` → `port.postMessage(event.detail)`, `BridgeEvent.STOP` → `port.postMessage(RECORDING_STOP)`
6. On port connect: dispatches `BridgeEvent.CONNECTED`; on port disconnect: dispatches `BridgeEvent.DISCONNECTED`

## Constants Reference

All enums are defined in `index.ts` (repo root).

**`BridgeEvent`** — CustomEvent names on the Loadster dashboard `window`:

| Key | Value |
|---|---|
| `CONNECT` | `'loadster_connect_extension'` |
| `CONNECTED` | `'loadster_connected_extension'` |
| `DISCONNECTED` | `'loadster_disconnected_extension'` |
| `SEND` | `'loadster_post_message'` |
| `STOP` | `'loadster_stop_recording'` |
| `READY` | `'loadster_recorder_ready'` |
| `PING` / `PONG` | `'Ping'` / `'Pong'` |

**`RecorderMessageType`** — port message types between background, content scripts, and dashboard:

| Key | Value |
|---|---|
| `RECORDING_STATUS` | `'loadster_recording_status'` |
| `RECORDING_EVENTS` | `'RecordingEvents'` |
| `RECORDING_STOP` | `'RecordingStop'` |
| `NAVIGATE_URL` | `'Url'` |
| `USER_ACTION` | `'loadster_user_action'` |
| `OPTIONS` | `'loadster_recording_options'` |
| `RECORDING_TRACKING` | `'loadster_recording_tracking'` |
| `ENDPOINT_PAGE_CONNECT` | `'loadster-browser-recorder-tab'` |

**`RecorderType`** — used as `recorderType` in `BridgeEvent.CONNECT` and the `background.ts` factory:

| Key | Value |
|---|---|
| `BROWSER` | `'loadster-browser-recorder'` |
| `PLAYWRIGHT` | `'loadster-playwright-recorder'` |
| `HTTP` | `'loadster-http-recorder'` |

## Known Limitations and TODOs

- **Cross-origin iframes:** `buildFramePath()` stops at origin boundaries; actions from cross-origin iframes carry no frame-locator prefix.
- **Overlay pick mode top-frame only:** The overlay runs only on the top frame. There is no pick mode for selecting elements inside iframes.
- **`testIdAttributeName` is hardcoded:** `'data-testid'` is the test ID attribute name in both `locatorRecorder.js` and `OverlayApp.vue`. A user preference mechanism is noted in `locatorRecorder.js:16`.
