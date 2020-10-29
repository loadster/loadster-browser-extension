/*
 *
 * Add an event listener to activate the toggle switch in the UI
 *
 */
document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.querySelector('#toggle');

  if (toggle) {
    refreshToggle(isEnabled());

    toggle.onmousedown = function (event) {
      if (isEnabled()) {
        setEnabled(false);
        refreshToggle(false);
      } else {
        setEnabled(true);
        refreshToggle(true);
      }

      event.preventDefault();
      return false;
    };
  }
});

/*
 *
 * Checks local storage to see if recording is enabled
 *
 */
function isEnabled() {
  return localStorage['loadster.recording.enabled'] == 'true';
}

/*
 *
 * Updates local storage when recording is enabled/disabled
 *
 */
function setEnabled(enabled) {
  if (enabled) {
    localStorage['loadster.recording.enabled'] = 'true';
  } else {
    localStorage['loadster.recording.enabled'] = 'false';
  }
}

/*
 *
 * Refreshes the toggle switch in the UI
 *
 */
function refreshToggle(enabled) {
  const toggle = document.querySelector('#toggle'),
    status = document.querySelector('#status');

  if (enabled) {
    toggle.className = 'toggle on';
    status.className = 'status on';
  } else {
    toggle.className = 'toggle off';
    status.className = 'status off';
  }
}

