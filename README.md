# Loadster Recorder Browser Extension

This is the source code for the Loadster Recorder extension in the
[Chrome Web Store](https://chrome.google.com/webstore/detail/loadster-recorder/bkhfnmahbfjemfpgehoolkhhdhbidaan)
and [Firefox Add-ons Directory](https://addons.mozilla.org/en-US/firefox/addon/loadster-recorder/).

Its purpose is to assist you with creating [Loadster](https://loadster.com) test scripts by recording your browser
activity (only when recording is enabled).

It then collates the browser events into a test script that you can then edit and play back.
Once you're satisfied with your script, use it in Loadster for load testing or site monitoring.

To learn more about Loadster, check out [Loadster](https://loadster.com).

## About this project

While Loadster is a commercial product, our browser extension is open source under the
[Apache License](LICENSE). We've put the source code on GitHub because we want you to be able to
freely inspect the extension's source code and understand how it works.

If you have any questions about the extension or its licensing, please
contact [help@loadster.com](mailto:help@loadster.com).

## Libraries

* [@medv/finder](https://www.npmjs.com/package/@medv/finder) - The CSS Selector Generator
* [webextension-polyfill](https://www.npmjs.com/package/webextension-polyfill) - WebExtension browser API Polyfill

## Releases

The repository ships two artifacts that share a single version (the one in `package.json`):

1. The browser extension itself, distributed via the Chrome Web Store and Firefox Add-ons.
2. A pre-built ESM library tarball, attached to a GitHub Release and consumable as an npm dependency by other Loadster repos. The `release.yml` workflow automates this.

### Cutting a stable release

```bash
npm version patch        # or minor / major — bumps package.json and creates a vX.Y.Z tag
git push --follow-tags   # pushes the commit and the tag
```

Pushing a `v*` tag triggers `.github/workflows/release.yml`, which:

1. Verifies the tag's base version matches `package.json` (fails fast on mismatch).
2. Runs `npm ci` and `npm run build:lib`.
3. Runs `npm pack` to produce `loadster-browser-extension-<version>.tgz`.
4. Creates a GitHub Release for the tag and attaches the tarball with auto-generated notes.

The Chrome/Firefox extension zips are submitted to the WebStore separately. Keep their version in lockstep with the lib by always cutting both from the same `package.json` bump.

Stable releases should always be tagged from `master` after the PR is merged.

### Pre-release testing

To share a test build with a consumer repo without changing `package.json` or polluting the PR, build and upload manually from your local machine:

```bash
npm run build:lib
npm pack
gh release create v28.0.0-test.1 --prerelease loadster-browser-extension-28.0.0.tgz
```

The tarball filename always reflects `package.json` version (`loadster-browser-extension-28.0.0.tgz`); the tag and release URL distinguish test builds. The consumer references the full download URL, so this is unambiguous.

CI does not handle test builds — `release.yml` only accepts tags whose version exactly matches `package.json`, keeping stable-release verification strict.

Once testing is done, clean up:

```bash
gh release delete v28.0.0-test.1 --yes --cleanup-tag
```

### Consuming the lib in another repo

Reference the release URL directly in the dependent repo's `package.json` — no registry needed:

```json
{
  "dependencies": {
    "loadster-browser-extension": "https://github.com/loadster/loadster-browser-extension/releases/download/v28.0.1/loadster-browser-extension-28.0.1.tgz"
  }
}
```
