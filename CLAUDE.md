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

## Implementation details

Use `/dev-context` [SKILL.md](.claude/skills/dev-context/SKILL.md) for more details.

### TODO

- Introduce testing engine [vitest](https://vitest.dev/guide/) (or similar)
- Migrate to https://wxt.dev once it's stable ([vite-plugin-web-extension](https://github.com/aklinker1/vite-plugin-web-extension?tab=readme-ov-file) will soon be deprecated)
