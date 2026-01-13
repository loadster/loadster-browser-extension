import browser from 'webextension-polyfill';
import { ENDPOINT_PAGE_CONNECT, RECORDER_TYPE, RECORDING_STATUS } from './constants.js';
import BrowserRecorder from './background/BrowserRecorder.js';
import HttpRecorder from './background/HttpRecorder.js';
import { parseRecorderConfig } from './utils/messagingUtils.js';

let activeRecorder = null;

// Clean up any stale content script registrations from previous sessions.
// This handles cases where the service worker was killed mid-recording or the browser
// crashed without proper cleanup, leaving windowEventRecorder.js registered on all pages.
(async () => {
  if (browser.runtime.getManifest().manifest_version === 3) {
    try {
      await browser.scripting.unregisterContentScripts({
        ids: ['loadster-page-content-scripts']
      });
    } catch (e) {
      // Script wasn't registered, that's fine
    }
  }
})();

browser.runtime.onConnect.addListener(async (port) => {
  const config = parseRecorderConfig(port.name);

  if (RECORDER_TYPE.BROWSER === config.recorderType) {
    activeRecorder = new BrowserRecorder(port);
  } else if (RECORDER_TYPE.HTTP === config.recorderType) {
    activeRecorder = new HttpRecorder(port);
  }

  if (config.endpointName === ENDPOINT_PAGE_CONNECT) {
    if (activeRecorder instanceof BrowserRecorder) {
      activeRecorder.setupPageContentPort(port);
    }
  }
});

browser.runtime.onMessage.addListener((message, sender) => {
  if (!activeRecorder || sender.id !== activeRecorder.port.sender.id) return;

  if (message.type === RECORDING_STATUS) {
    return activeRecorder.getStatus();
  }
});

browser.runtime.onInstalled.addListener(async () => {
  const manifest = browser.runtime.getManifest();

  console.log('browser.runtime.onInstalled >> inject content scripts', manifest);

  for (const cs of manifest.content_scripts) {
    for (const tab of await browser.tabs.query({ url: cs.matches })) {
      if (manifest.manifest_version === 3) {
        await browser.scripting.executeScript({
          target: { tabId: tab.id },
          files: cs.js
        });
      } else {
        await Promise.all(cs.js.map(file => browser.tabs.executeScript(tab.id, { file })));
      }
    }
  }
});
