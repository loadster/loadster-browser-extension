# Loadster Recorder Browser Extension

This is the source code for the Loadster Recorder extension in the
[Chrome Web Store](https://chrome.google.com/webstore/detail/loadster-recorder/bkhfnmahbfjemfpgehoolkhhdhbidaan)
and [Firefox Add-ons Directory](https://addons.mozilla.org/en-US/firefox/addon/loadster-recorder/).

Its purpose is to assist you with creating [Loadster](https://loadster.app) and [Speedway](https://speedway.app)
test scripts by recording your browser activity (only when recording is enabled).

It then collates the browser events into a test script that you can then edit and play back.
Once you're satisfied with your script, launch a load test with hundreds or thousands
of bots running your script simultaneously in Loadster, or use it for site monitoring in Speedway.

To learn more about Loadster and load testing in general, check out [Loadster](https://loadster.app).
To see how you can use the same scripts for site monitoring, have a look at [Speedway](https://speedway.app).

## About this project

While Loadster is a commercial product, our browser extension is open source under the
[Apache License](LICENSE). We've put the source code on GitHub because we want you to be able to
freely inspect the extension's source code and understand how it works.

If you have any questions about the extension or its licensing, please contact [help@loadster.app](mailto:help@loadster.app).

## Libraries

* [@medv/finder](https://www.npmjs.com/package/@medv/finder) - The CSS Selector Generator
* [webext-bridge](https://www.npmjs.com/package/webext-bridge) - Messaging in WebExtensions made super easy. Out of the box.
* [webextension-polyfill](https://www.npmjs.com/package/webextension-polyfill) - WebExtension browser API Polyfill
