# Loadster Browser Extension

Loadster is a cloud-based load testing platform, which contains backend, frontend, and runtime components.
This browser extension is part of the Loadster ecosystem. A browser extension that records user interactions and generates Loadster test scripts. Built with **Vite** + **`vite-plugin-web-extension`** targeting two browsers from a single
codebase:

| Target  | Manifest |
|---------|----------|
| Chrome  | MV3      |
| Firefox | MV2      |

Each target has its own manifest (`src/manifest.chrome.json`, `src/manifest.firefox.json`). `vite-plugin-web-extension` selects the right one based on the `TARGET` env var and outputs to `dist/chrome/` or `dist/firefox/`.

The compile-time constant `__BROWSER__` (`'chrome'` or `'firefox'`) is available everywhere for conditional logic. `webextension-polyfill` bridges MV2/MV3 API differences at runtime.

**Chrome-only features:** The PlaywrightRecorder requires `debugger` permission and works only in on Chrome.

## Architecture

The extension has three alternative recording modes that coexist. The active mode is determined by the `recorderType` sent from the Loadster web app when it connects.

### Recording flow in general

1. User installs the extension from Chrome Web Store or Firefox Add-ons
2. Content script (`loadsterBridge.ts`) injects to the Loasdter dashboard web app, so that Loadster could send `CustomEvent`s to the background recorder. This is how the extension knows which recorder to use and when to start recording.
3. User initializes recorder via `CustomEvent(bridgeEvents.CONNECT)`. At this time the background script creates a `Recorder` instance of a desired type.
4. User sends the command to start recording. This includes a URL for the extension to open a new browser tab at and start recording.
5. The recorder injects another type of content script to that page. All 3 types of recorders start working differently from this step. BrowserRecorder and PlaywirghtRecorder inject specific scripts into the page, while HttpRecorder uses
   the webRequest API.
6. The recorder starts recording events and sends them to the Loadster dashboard.
7. Recording stops either after the user sends a command from the Loadster dashboard. This also can be done via the extension UI or if the recording tab is closed.
8. Extension destroys the recorder instance and cleans up.

### Entry Points

| File                            | Role                                                                                                                                                  |
|---------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------|
| `src/background/background.ts`  | Background service worker (MV3) / persistent script (MV2) — instantiates BrowserRecorder, PlaywrightRecorder, or HttpRecorder based on `recorderType` |
| `src/content/loadsterBridge.ts` | Content script on `localhost/*` and `loadster.com/*` — bridges the Loadster web app to the background via `CustomEvent`/`port` messaging              |
| `src/index.ts`                  | Popup content, indicates whether recording is active or not                                                                                           |


### Recorder Class Hierarchy

```
Recorder (src/background/Recorder.ts)
├── BrowserRecorder    — records click/form events → Loadster browser steps
├── PlaywrightRecorder — records user actions and genererates playwrihgt-test code
└── HttpRecorder       — records network requests via webRequest API
```

### BrowserRecorder Implementation

See dedicated instructions in `.claude/skills/browser-recorder.md`

### PlaywrightRecorder Implementation

See dedicated instructions in `.claude/skills/playwright-recorder.md`

### TODO

- Introduce testing engine [vitest](https://vitest.dev/guide/) (or similar)
- Migrate to https://wxt.dev once it's stable ([vite-plugin-web-extension](https://github.com/aklinker1/vite-plugin-web-extension?tab=readme-ov-file) will soon be deprecated)
