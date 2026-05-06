---
name: dev-context
description: Provides context for AI agent when developing a new feature or looking for bugs within a specific area of application code. Used when a user asks for help in further developing a feature or fixing a bug in the codebase.
model: sonnet
---

# Codebase Onboarding

## Progressive Disclosure Levels

### Level 1: Recording Process Overview

The extension has three alternative recording modes that coexist. The active mode is determined by the `recorderType` sent from the Loadster web app when it connects.

1. User installs the extension from Chrome Web Store or Firefox Add-ons
2. Content script [loadsterBridge.ts](../../../src/content/loadsterBridge.ts) injects to the Loasdter dashboard web app, so that Loadster could send `CustomEvent`s to the background recorder. This is how the extension knows which recorder to use and when to start recording.
3. User initializes recorder via `CustomEvent(bridgeEvents.CONNECT)`. At this time the background script creates a `Recorder` instance of a desired type.
4. User sends the command to open a new browser tab with the provided URL, and the recording starts.
5. The recorder injects another type of content script to that page. All three types of recorders start working differently from this step. `BrowserRecorder` and `PlaywrightRecorder` inject specific scripts into the page, while `HttpRecorder` uses
   the `webRequest` API.
6. The recorder sends recorded events to the Loadster dashboard.
7. Recording stops after:
   - the user sends a stopping command from the Loadster dashboard.
   - the user stops the recording from the extension overlay.
   - the recording tab is closed.
8. Extension destroys the recorder instance and cleans up.

### Level 2: Entry Points By Recorder Type
**Only load reference files if the user requests context on a specific recording mode.**

- BrowserRecorder: [browser-recorder.md](references/browser-recorder.md)
- PlaywrightRecorder: [playwright-recorder.md](references/playwright-recorder.md)
- HttpRecorder: [http-recorder.md](references/http-recorder.md)
