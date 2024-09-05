import browser from 'webextension-polyfill';
import { sendMessage, onMessage, allowWindowMessaging } from 'webext-bridge/content-script';
import { PONG, RECORDER_NAMESPACE, RECORDING_EVENTS, RECORDING_STOP } from './constants.js';
import { createMessage } from './utils/windowUtils.js';

// eslint-disable-next-line no-undef
console.log('content.js', __BROWSER__);

allowWindowMessaging(RECORDER_NAMESPACE);

const bridgeEvents = {
  'CONNECT': 'loadster_connect_extension',
  'CONNECTED': 'loadster_connected_extension',
  'DISCONNECTED': 'loadster_disconnected_extension',
  'SEND': 'loadster_post_message',
  'STOP': 'loadster_stop_recording',
  'READY': 'loadster_recorder_ready'
};

function sendMessageToClient(type, data, version, app) {
  console.log('sendMessageToClient', { type, data });
  window.dispatchEvent(new CustomEvent(type, {
    detail: createMessage({ app, version, type, data })
  }));
}

function configurePort(recorderType) {
  const manifest = browser.runtime.getManifest();
  const port = browser.runtime.connect({ name: JSON.stringify({ recorderType }) }); // see service-worker.js => browser.runtime.onConnect

  // No tabs open
  onMessage(RECORDING_STOP, message => sendMessageToClient(RECORDING_STOP, message.data, manifest.version, recorderType));
  onMessage(RECORDING_EVENTS, message => sendMessageToClient(RECORDING_EVENTS, message.data, manifest.version, recorderType));
  onMessage(PONG, message => sendMessageToClient(PONG, message.data, manifest.version, recorderType));

  // From Loadster script to background
  function onBridgeMessage(event) {
    sendMessage(event.detail.type, event.detail, 'background');
  }

  function onBridgeStop() {
    sendMessage(RECORDING_STOP, {}, 'background');

    clearListeners();
  }

  function clearListeners() {
    window.removeEventListener(bridgeEvents.STOP, onBridgeStop);
    window.removeEventListener(bridgeEvents.SEND, onBridgeMessage);
  }

  window.addEventListener(bridgeEvents.STOP, onBridgeStop);
  window.addEventListener(bridgeEvents.SEND, onBridgeMessage);

  window.dispatchEvent(new CustomEvent(bridgeEvents.CONNECTED, { 'detail': createMessage({ version: manifest.version }) }));

  port.onDisconnect.addListener(() => window.dispatchEvent(new CustomEvent(bridgeEvents.DISCONNECTED)));
}

window.addEventListener(bridgeEvents.CONNECT, (event) => configurePort(event.detail.name));

window.dispatchEvent(new CustomEvent(bridgeEvents.READY));

