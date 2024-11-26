import browser from 'webextension-polyfill';
import { RECORDING_TRACKING, PONG, RECORDING_EVENTS, RECORDING_STOP, bridgeEvents } from './constants.js';
import { createMessage } from './utils/windowUtils.js';

function sendMessageToClient(type, data, version, app) {
  window.dispatchEvent(new CustomEvent(type, {
    detail: createMessage({ app, version, type, data })
  }));
}

function configurePort(recorderType) {
  const manifest = browser.runtime.getManifest();
  const port = browser.runtime.connect({ name: JSON.stringify({ recorderType }) }); // see background.js => browser.runtime.onConnect

  // No tabs open
  onMessage(RECORDING_STOP, message => sendMessageToClient(RECORDING_STOP, message.data, manifest.version, recorderType));
  onMessage(RECORDING_EVENTS, message => sendMessageToClient(RECORDING_EVENTS, message.data, manifest.version, recorderType));
  onMessage(PONG, message => sendMessageToClient(PONG, message.data, manifest.version, recorderType));
  onMessage(RECORDING_TRACKING, message => sendMessageToClient(RECORDING_TRACKING, message.data, manifest.version, recorderType));

  function sendMessageToBackground (type, data) {
    port.postMessage({ type, data });
  }

  function onMessage(type, callback) {
    port.onMessage.addListener((message) => {
      if (message.type === type) {
        callback(message);
      }
    });
  }

  // From Loadster script to background
  function onBridgeMessage(event) {
    sendMessageToBackground(event.detail.type, event.detail);
  }

  function onBridgeStop() {
    sendMessageToBackground(RECORDING_STOP, {});

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

