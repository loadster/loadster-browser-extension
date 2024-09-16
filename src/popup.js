import { onMessage, sendMessage } from 'webext-bridge/popup';
import { RECORDING_STATUS } from './constants.js';

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

onMessage(RECORDING_STATUS, (message) => {
  refreshUI(message.data.enabled);
});
