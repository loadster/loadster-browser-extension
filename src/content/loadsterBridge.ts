/**
 *
 * Content script injected into the Loadster dashboard.
 *
 * Acts as a message bridge between the Loadster dashboard and the browser
 * extension's background script.
 * TODO summarize what events are sent and received
 */

import browser from 'webextension-polyfill';
import { createMessage } from '../utils/messagingUtils.js';
import { RecorderMessageType, BridgeEvent, RecorderType, type LoadsterPortMessage } from '../../index';

const { RECORDING_EVENTS, RECORDING_STOP, RECORDING_TRACKING } = RecorderMessageType;
const { PONG } = BridgeEvent;

console.log('loadsterBridge.js injected');

function sendMessageToClient(type: string, data: unknown, version: string, app: RecorderType) {
  window.dispatchEvent(new CustomEvent(type, {
    detail: createMessage({ app, version, type, data })
  }));
}

function configurePort(recorderType: RecorderType) {
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
    port.onMessage.addListener((message: LoadsterPortMessage) => {
      if (message.type === type) {
        callback(message);
      }
    });
  }

  // From Loadster script to background
  function onBridgeMessage(event: CustomEvent<{ type: string; [key: string]: unknown }>) {
    sendMessageToBackground(event.detail.type, event.detail);
  }

  function onBridgeStop() {
    sendMessageToBackground(RECORDING_STOP, {});

    clearListeners();
  }

  function clearListeners() {
    window.removeEventListener(BridgeEvent.STOP, onBridgeStop);
    window.removeEventListener(BridgeEvent.SEND, onBridgeMessage);
  }

  window.addEventListener(BridgeEvent.STOP, onBridgeStop);
  window.addEventListener(BridgeEvent.SEND, onBridgeMessage);

  console.log('configure port', port);

  window.dispatchEvent(new CustomEvent(BridgeEvent.CONNECTED, { 'detail': createMessage({ version: manifest.version }) }));

  port.onDisconnect.addListener(() => window.dispatchEvent(new CustomEvent(BridgeEvent.DISCONNECTED)));
}

window.addEventListener(BridgeEvent.CONNECT, (event: Event) => configurePort((event as CustomEvent<{ name: RecorderType }>).detail.name));

window.dispatchEvent(new CustomEvent(BridgeEvent.READY));
