import { RECORDING_STATUS } from './constants.js';
import browser from 'webextension-polyfill';

function refreshUI(enabled = false) {
  const containerEl = document.getElementById('status-panel');

  if (containerEl) {
    if (enabled) {
      containerEl.className = 'panel enabled';
    } else {
      containerEl.className = 'panel disabled';
    }
  }
}

browser.runtime.sendMessage({ type: RECORDING_STATUS }).then((status) => {
  refreshUI(status.enabled);
}).catch((err) => {
  console.warn(err);
});
