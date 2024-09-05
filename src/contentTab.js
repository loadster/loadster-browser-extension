import { onMessage, sendMessage } from 'webext-bridge/content-script';
import { RECORDING_STATUS, USER_ACTION } from './constants.js';
import { createMessage } from './utils/windowUtils.js';

onMessage(RECORDING_STATUS, (message) => {
  console.log('contentTab RECORDING_STATUS');
  window.dispatchEvent(new CustomEvent(RECORDING_STATUS, {
    'detail': createMessage(message.data)
  }));
});

if (window.loadsterContentLoaded !== true) {
  window.loadsterContentLoaded = true;

  window.addEventListener(USER_ACTION, (event) => {
    console.log('content native USER_ACTION forwarding to background...', event, window === event.target);
    sendMessage(USER_ACTION, event.detail, 'background');
  });
}
