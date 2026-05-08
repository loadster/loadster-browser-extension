import { RecorderMessageType, type LoadsterRecorderStatus } from '../index';
import browser from 'webextension-polyfill';

const { RECORDING_STATUS } = RecorderMessageType;

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

browser.runtime.sendMessage({ type: RECORDING_STATUS }).then((status: LoadsterRecorderStatus) => {
  refreshUI(status?.enabled);
}).catch((err) => {
  console.warn(err);
});

