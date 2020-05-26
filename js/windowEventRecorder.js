const windowEventsToRecord = {
    CLICK: 'click',
    DBLCLICK: 'dblclick',
    CHANGE: 'change',
    SELECT: 'select',
    SUBMIT: 'submit'
}

let enabled = false;

const sendMessage = (msg) => {
    try {
        browser.runtime.sendMessage({
            type: USER_ACTION,
            value: msg
        })
    } catch (err) {
        console.debug('caught error', err)
    }
}

const recordEvent = (e) => {
    const attrFilter = ['class']
    // we explicitly catch any errors and swallow them, as none node-type events are also ingested.
    // for these events we cannot generate selectors, which is OK
    try {
        const selector = finder(e.target, {
            className: (name) => true, // !name.startsWith('is-') etc.
            tagName: (name) => true,
            attr: (name, value) => !attrFilter.includes(name),
            seedMinLength: (e.target.id) ? 1 : 5,  // if the target has an id, use that instead of multiple other selectors
            optimizedMinLength: 5
        })
        const msg = {
            selector: selector,
            value: e.target.value,
            tagName: e.target.tagName,
            action: e.type,
            keyboard: {
                alt: e.altKey,
                shift: e.shiftKey,
                ctrl: e.ctrlKey,
                meta: e.metaKey
            },
            textContent: e.target.textContent,
            href: e.target.href ? e.target.href : null
        }
        sendMessage(msg)
    } catch (e) {
        console.log(e.message);
    }
}

const startRecording = () => {
    const events = Object.values(windowEventsToRecord)

    events.forEach(type => {
        window.addEventListener(type, recordEvent, true)
    })
    enabled = true;
}

const stopRecording = () => {
    const events = Object.values(windowEventsToRecord)

    events.forEach(type => {
        window.removeEventListener(type, recordEvent)
    })
    enabled = false
}


browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === RECORDING_START && !enabled) {
        startRecording()
    } else if (msg.type === RECORDING_STOP) {
        stopRecording()
    }
})

