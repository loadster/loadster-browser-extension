import { RECORDING_STATUS, USER_ACTION, ENDPOINT_PAGE_CONNECT } from './constants.js';
import { createMessage } from './utils/windowUtils.js';
import browser from 'webextension-polyfill';

console.log('contentTab.js');

let port;

function connect () {
  if (port) {
    console.log('disconnect old port');
    window.removeEventListener(USER_ACTION, onUserAction); // clean up old connection
    window.removeEventListener('pageshow', onPageShow);
    port.disconnect();
  }
  console.log('new connection', port, location.href);

  port = browser.runtime.connect({
    name: JSON.stringify({ endpointName: ENDPOINT_PAGE_CONNECT })
  });

  port.onMessage.addListener(onPortMessage);

  window.addEventListener(USER_ACTION, onUserAction);
  window.addEventListener('pageshow', onPageShow);
}

function onUserAction (event) {
  console.log('page>>contentTab:forward:USER_ACTION>>NEW_PORT');
  port.postMessage({ type: USER_ACTION, data: event.detail }); // to background
}

function onPortMessage (message) {
  console.log('onPortMessage', message);

  if (message.type === RECORDING_STATUS) {
    console.log('contentTab:forward:RECORDING_STATUS>>', message.data);
    window.dispatchEvent(new CustomEvent(RECORDING_STATUS, {
      'detail': createMessage(message.data)
    }));
  }
}



function onPageShow (event) {
  if (event.persisted) {
    // The page is restored from BFCache, old connection is lost, set up a new connection.
    connect();
  }
}

if (window.loadsterContentLoaded !== true) {
  window.loadsterContentLoaded = true;
  connect();
}
