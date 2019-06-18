const bridgeEvents = {
    CONNECT: 'loadster_connect_extension',
    CONNECTED: 'loadster_connected_extension',
    DISCONNECTED: 'loadster_disconnected_extension',
    SEND: 'loadster_post_message',
    STOP: 'loadster_stop_recording',
    GET_VERSION: 'loadster_get_extension_version'
};
let port = null;

// expose version to the webpage scope
const script = document.createElement('script');
script.textContent = `var loadster_extension_version = ${ browser.runtime.getManifest().version };`;
(document.head || document.documentElement).appendChild(script);
script.remove();

const createMessage = (msg) => {
    // firefox security issue
    const output = typeof cloneInto !== 'undefined' ? cloneInto(msg, window, { cloneFunctions: true }) : msg;
    return output;
};

window.addEventListener(bridgeEvents.CONNECT, (event) => {
    port = browser.runtime.connect({ name: 'loadster-recorder' });

    const version = browser.runtime.getManifest().version;

    port.onMessage.addListener(msg => {
        // add namespace and version
        Object.assign(msg, { app: port.name, version });

        const responseEvent = new CustomEvent(msg.type, { detail: createMessage(msg) });

        window.dispatchEvent(responseEvent);
    });

    port.onDisconnect.addListener(() => {
        window.dispatchEvent(new CustomEvent(bridgeEvents.DISCONNECTED));
    });

    window.dispatchEvent(new CustomEvent(bridgeEvents.CONNECTED, { detail: createMessage({ version }) }));
});

window.addEventListener(bridgeEvents.STOP, (event) => port.disconnect());

window.addEventListener(bridgeEvents.SEND, (event) => port.postMessage(event.detail));