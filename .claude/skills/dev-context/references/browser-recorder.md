[# Browser Recorder Implementation Reference]()

This document describes how the `BrowserRecorder.ts` works in the Loadster browser extension.
Use it as a reference for maintenance, debugging, and future changes.

## Overview

The BrowserRecorder captures user interactions (clicks, form changes, hover events, navigation) and generates Loadster browser step events in real time. Unlike the PlaywrightRecorder, it works in both **Chrome and Firefox** because it does
not rely on CDP API — only standard WebExtension APIs + simplified Playwright selector generator engine. This recorder produces Playwright-quality, accessibility-aware selectors and emits structured `ElementLocatorSpec[]` objects instead of CSS strings.

The recorder uses the following content scripts injected into the recorded page:

- `locatorRecorder.js` runs in the **MAIN world** to capture DOM events and generate Playwright-style locators
- `locator-overlay.js` runs in the **ISOLATED world** **TODO**
- `contentTab.js` runs in the **ISOLATED world** to bridge between the page and the background script

### Pipeline Overview

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

## Key Files

| File                                | Role                                                                                                                                                               |
|-------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `src/background/BrowserRecorder.ts` | Background — manages recording lifecycle, registers content scripts, handles navigation events                                                                     |
| `src/content/locatorRecorder.js`    | MAIN world script — capture user events, generates selectors, dispatches CustomEvents. Uses `@mizchi/selector-generator` to generate Playwright internal selectors |
| `src/content/contentTab.js`         | ISOLATED world bridge — relays CustomEvents from page to background port and port messages back to page                                                            |

## Content Script Injection

**TODO**

## Why Multiple Content Scripts?

Due to a browser security boundary, to record user actions, the injected script must be in the MAIN world. **However, MAIN world scripts have no access to `chrome.runtime` or `browser.runtime`.** They cannot open ports to the background script.

`contentTab.js` runs in the **ISOLATED world** where `browser.runtime.connect()` is available. It acts as a relay between the page scripts and the background script.

## contentTab.js — Port Bridge

On injection, `contentTab.js` calls `connect()`:

1. Opens a port to the background: `browser.runtime.connect({ name: JSON.stringify({ endpointName: ENDPOINT_PAGE_CONNECT }) })`
2. `background.ts` routes this connection to `activeRecorder.setupPageContentPort(port)`, establishing the `pagePort` on `BrowserRecorder`
3. Listens for `USER_ACTION` CustomEvents on `window` and forwards them to the background via `port.postMessage`
4. Listens on `port.onMessage` for `RECORDING_STATUS` messages from the background and dispatches them as CustomEvents to the page

**BFCache handling:** A `pageshow` listener detects restoration from the back/forward cache (`event.persisted === true`) and calls `connect()` again since the old port is dead.

**Double-injection guard:** `window.loadsterContentLoaded` flag prevents re-initialization if the script is injected multiple times.

## Event Recording

### Initialization

A `window.loadsterRecorderScriptsLoaded` flag prevents double-initialization.

### Recording Overlay

### Recording Hover Events

## Frame Support

## Navigation Handling

`BrowserRecorder` listens on `browser.webNavigation.onCommitted`:

- For tracked tabs (outermost_frame, or all frames on Firefox): calls `injectForegroundScripts(tabId)` then `updateWindowsRecordingStatus()`
- If `transitionType === 'typed'` or `'link'` with `forward_back` qualifier: also records a `navigate` browser event

## Tab Tracking

`onCreatedTab` override: when a new tab is opened from a tracked tab, **clears `tabIds` and replaces it with only the new tab**. The recorder follows the user into the new tab and stops tracking the previous one. `stopBlinkingTitle()` is
called before clearing.

## Event Upload Format

Each recorded action is wrapped and sent via `RECORDING_EVENTS` to the Loadster dashboard:

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
  keyboard: {
    alt, shift, ctrl, meta
  };
  textContent: string;
  href: string | null;
}
```

## Known Limitations and TODOs

- **Multiple content scripts complexity:** The MAIN↔ISOLATED↔background relay adds latency and messaging complexity. Note that CDP is not an option as it only works in Chrome, and the BrowserRecorder is already an alternative solution to PlaywrightRecorder (CDP, chrome only)

- **Cross-origin iframes:** `BrowserRecorder` drops the path with `framePath: []` for cross-origin frames (same limitation as PlaywrightRecorder).
