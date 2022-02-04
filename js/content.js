const bridgeEvents = {
  'CONNECT': 'loadster_connect_extension',
  'CONNECTED': 'loadster_connected_extension',
  'DISCONNECTED': 'loadster_disconnected_extension',
  'SEND': 'loadster_post_message',
  'STOP': 'loadster_stop_recording',
};

console.log('content script!');

function createMessage(msg) {
  // Firefox security issue
  const output = typeof cloneInto !== 'undefined' ? cloneInto(msg, window, { 'cloneFunctions': true }) : msg;

  return output;
}

window.addEventListener(bridgeEvents.CONNECT, (event) => {
  const portName = event.detail.name;
  const { version } = browser.runtime.getManifest();
  const port = browser.runtime.connect({ name: portName }); // see service-worker.js => browser.runtime.onConnect

  console.log(bridgeEvents.CONNECTED, port, portName);

  function onPortMessage(msg) {
    const app = portName;
    const responseEvent = new CustomEvent(msg.type, {
      'detail': createMessage({ ...msg, app, version })
    });

    window.dispatchEvent(responseEvent);
  }
  function onPortDisconnect() {
    window.dispatchEvent(new CustomEvent(bridgeEvents.DISCONNECTED));
  }

  port.onMessage.addListener(onPortMessage);
  port.onDisconnect.addListener(onPortDisconnect);

  function onBridgeStop () {
    console.log(bridgeEvents.STOP);
    port.disconnect();
    clearListeners();
  }

  function onBridgeMessage(event) {
    try {
      port.postMessage(event.detail);
    } catch (err) {
      console.log(err);
    }
  }

  function clearListeners() {
    window.removeEventListener(bridgeEvents.STOP, onBridgeStop);
    window.removeEventListener(bridgeEvents.SEND, onBridgeMessage);
  }

  window.addEventListener(bridgeEvents.STOP, onBridgeStop);
  window.addEventListener(bridgeEvents.SEND, onBridgeMessage);

  window.dispatchEvent(new CustomEvent(bridgeEvents.CONNECTED, { 'detail': createMessage({ version }) }));
});
