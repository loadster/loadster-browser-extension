import { onMessage, sendMessage } from 'webext-bridge/content-script';
import { RECORDING_STATUS, USER_ACTION } from './constants.js';
import { createMessage } from './utils/windowUtils.js';

onMessage(RECORDING_STATUS, (message) => {
  window.dispatchEvent(new CustomEvent(RECORDING_STATUS, {
    'detail': createMessage(message.data)
  }));
});

if (window.loadsterContentLoaded !== true) {
  window.loadsterContentLoaded = true;

  window.addEventListener(USER_ACTION, (event) => {
    sendMessage(USER_ACTION, event.detail, 'background');
  });
}
