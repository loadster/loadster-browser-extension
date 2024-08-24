import browser from 'webextension-polyfill';
import { sendMessage } from 'webext-bridge/background';
import { RECORDER_TYPE, RECORDING_STATUS } from './constants.js';
import BrowserRecorder from './background/BrowserRecorder.js';
import HttpRecorder from './background/HttpRecorder.js';

let activeRecorder = null;

browser.runtime.onConnect.addListener(async (port) => {
  const config = parseConfig(port.name);

  console.log('browser.runtime.onConnect', config, activeRecorder, port);

  if ([RECORDER_TYPE.HTTP, RECORDER_TYPE.BROWSER].includes(config.recorderType)) {
    const channel = `content-script@${port.sender.tab.id}`;

    if (RECORDER_TYPE.BROWSER === config.recorderType) {
      activeRecorder = new BrowserRecorder(port, channel);
    } else if (RECORDER_TYPE.HTTP === config.recorderType) {
      activeRecorder = new HttpRecorder(port, channel);
    }
  }

  if (config.endpointName === 'popup') {
    if (activeRecorder) {
      console.log('Sending recording status to popup context');
      sendMessage(RECORDING_STATUS, { enabled: activeRecorder.recording }, 'popup');
    }
  }
});

browser.runtime.onInstalled.addListener(async () => {
  const manifest = browser.runtime.getManifest();

  console.log('browser.runtime.onInstalled >> inject content scripts');

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

function parseConfig(json) {
  try {
    return JSON.parse(json);
  } catch (err) {
    console.log(err);
    return {};
  }
}
