import browser from 'webextension-polyfill';
import { ENDPOINT_PAGE_CONNECT, RECORDER_TYPE, RECORDING_STATUS } from './constants.js';
import BrowserRecorder from './background/BrowserRecorder.js';
import HttpRecorder from './background/HttpRecorder.js';
import { parseRecorderConfig } from './utils/messagingUtils.js';

let activeRecorder = null;

browser.runtime.onConnect.addListener(async (port) => {
  const config = parseRecorderConfig(port.name);

  if ([RECORDER_TYPE.HTTP, RECORDER_TYPE.BROWSER].includes(config.recorderType)) {
    const channel = `content-script@${port.sender.tab.id}`;

    console.log('browser.runtime.onConnect', config);

    if (RECORDER_TYPE.BROWSER === config.recorderType) {
      activeRecorder = new BrowserRecorder(port, channel);
    } else if (RECORDER_TYPE.HTTP === config.recorderType) {
      activeRecorder = new HttpRecorder(port, channel);
    }
  }

  if (config.endpointName === ENDPOINT_PAGE_CONNECT) {
    if (activeRecorder instanceof BrowserRecorder) {
      activeRecorder.setupPageContentPort(port);
    }
  }
});

browser.runtime.onMessage.addListener((message, sender) => {
  if (message.type === RECORDING_STATUS) {
    return activeRecorder?.getStatus();
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
