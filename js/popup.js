function refreshUI (enabled = false) {
  const containerEl = document.getElementById('status-panel');
  const statusEl = document.getElementById('status');

  if (containerEl && statusEl) {
    if (enabled) {
      containerEl.className = 'panel enabled';
      statusEl.setAttribute('data-status-text', 'Recording Enabled');
    } else {
      containerEl.className = 'panel disabled';
      statusEl.setAttribute('data-status-text', 'Recording Disabled');
    }
  }
}

async function refreshState() {
  const storageKey = 'loadster.recording.enabled';
  const storage = await browser.storage.local.get([storageKey]);
  refreshUI(storage[storageKey]);
}

document.addEventListener('DOMContentLoaded', refreshState);


