const state = {
  enabled: true
};

/*
 *
 * Add an event listener to activate the toggle switch in the UI
 *
 */
document.addEventListener('DOMContentLoaded', async () => {
  const toggle = document.querySelector('#toggle');

  if (toggle) {
    await updateState();

    toggle.addEventListener('click', async function (event) {
      event.preventDefault();

      if (state.enabled) {
        await setEnabled(false);
        refreshToggle(false);
      } else {
        await setEnabled(true);
        refreshToggle(true);
      }

      return false;
    });
  }
});

/*
 *
 * Checks browser storage to see if recording is enabled
 *
 */
async function updateState() {
  const storage = await browser.storage.local.get(['loadster.recording.enabled']);

  state.enabled = storage['loadster.recording.enabled'];

  if (state.enabled === undefined) {
    setEnabled(true);
  }

  refreshToggle(state.enabled);
}

/*
 *
 * Updates local storage when recording is enabled/disabled
 *
 */
async function setEnabled(enabled) {
  await browser.storage.local.set({ 'loadster.recording.enabled': enabled });

  state.enabled = enabled;
}

/*
 *
 * Refreshes the toggle switch in the UI
 *
 */
function refreshToggle(enabled) {
  const toggle = document.querySelector('#toggle');
  const status = document.querySelector('#status');

  if (enabled) {
    toggle.className = 'toggle on';
    status.className = 'status on';
  } else {
    toggle.className = 'toggle off';
    status.className = 'status off';
  }
}

