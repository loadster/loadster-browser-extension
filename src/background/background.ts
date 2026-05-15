import browser from 'webextension-polyfill';
import { parseRecorderConfig } from '../utils/messagingUtils.js';
import { RecorderType } from '../../index';
import BrowserRecorder from './BrowserRecorder.js';
import HttpRecorder from './HttpRecorder.js';
import PlaywrightRecorder from './PlaywrightRecorder.js';
import LocatorBrowserRecorder from './LocatorBrowserRecorder.js';

let activeRecorder = null;

// Clean up any stale content script registrations from previous sessions.
BrowserRecorder.cleanupStaleScripts().then();
LocatorBrowserRecorder.cleanupStaleScripts().then();

browser.runtime.onConnect.addListener((port) => {
  const config = parseRecorderConfig(port.name);

  if (config === null) return; // Unknown application

  if (RecorderType.BROWSER === config.recorderType) {
    activeRecorder = new BrowserRecorder(port);
  } else if (RecorderType.BROWSER_LOCATOR === config.recorderType) {
    activeRecorder = new LocatorBrowserRecorder(port);
  } else if (RecorderType.HTTP === config.recorderType) {
    activeRecorder = new HttpRecorder(port);
  } else if (RecorderType.PLAYWRIGHT === config.recorderType) {
    activeRecorder = new PlaywrightRecorder(port);
  }
  console.log({ activeRecorder });

  port.onDisconnect.addListener(() => {
    activeRecorder = null;
  });
});

browser.runtime.onInstalled.addListener(async () => {
  const manifest = browser.runtime.getManifest();

  console.log('browser.runtime.onInstalled >> inject loadster bridge', manifest);

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

