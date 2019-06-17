let port = null;

window.addEventListener('connect_extension', function (event) {
    port = browser.runtime.connect({ name: 'loadster-recorder' });

    port.onMessage.addListener(msg => {
        // firefox security issue
        const detail = typeof cloneInto !== 'undefined' ? cloneInto(msg, window, { cloneFunctions: true }) : msg;
        const responseEvent = new CustomEvent(msg.type, { detail });

        window.dispatchEvent(responseEvent);
    });

    port.onDisconnect.addListener(() => {
        window.dispatchEvent(new CustomEvent('disconnected_extension'));
    });

    window.dispatchEvent(new CustomEvent('connected_extension'));
});

window.addEventListener('stop_recording', (event) => port.disconnect());

window.addEventListener('post_message', (event) => port.postMessage(event.detail));