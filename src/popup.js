import browser from "webextension-polyfill";

function refreshUI (enabled = false) {
  const containerEl = document.getElementById('status-panel');

  if (containerEl) {
    if (enabled) {
      containerEl.className = 'panel enabled';
    } else {
      containerEl.className = 'panel disabled';
    }
  }
}

async function refreshState() {
  const storageKey = 'loadster.recording.enabled';
  const storage = await browser.storage.local.get([storageKey]);
  refreshUI(storage[storageKey]);
}



document.addEventListener('DOMContentLoaded', refreshState);


