import { RecorderMessageType } from '../../index.ts';
import { createMessage } from '../utils/messagingUtils.js';
import browser from 'webextension-polyfill';

const { RECORDING_STATUS, USER_ACTION, ENDPOINT_PAGE_CONNECT } = RecorderMessageType;

let port;

function connect () {
  if (port) {
    window.removeEventListener(USER_ACTION, onUserAction); // clean up old connection
    window.removeEventListener('pageshow', onPageShow);
    port.disconnect();
  }

  port = browser.runtime.connect({
    name: JSON.stringify({ endpointName: ENDPOINT_PAGE_CONNECT })
  });
  port.onMessage.addListener(forwardPortMessageToPage);

  window.addEventListener(USER_ACTION, onUserAction);
  window.addEventListener('pageshow', onPageShow);
}

function onUserAction (event) {
  port.postMessage({ type: USER_ACTION, data: event.detail }); // to background
}

function forwardPortMessageToPage (message) {
  if (message.type === RECORDING_STATUS) {
    window.dispatchEvent(new CustomEvent(RECORDING_STATUS, {
      'detail': createMessage(message.data)
    }));
  }
}

function onPageShow (event) {
  if (event.persisted) {
    // The page is restored from BFCache, the old connection is lost, set up a new connection.
    connect();
  }
}

if (window.loadsterContentLoaded !== true) {
  window.loadsterContentLoaded = true;
  connect();
}
