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
            type: 'loadster_browser_event',
            value: msg
        })
    } catch (err) {
        console.debug('caught error', err)
    }
}

const recordEvent = (e) => {
    // we explicitly catch any errors and swallow them, as none node-type events are also ingested.
    // for these events we cannot generate selectors, which is OK
    try {
        const optimizedMinLength = (e.target.id) ? 2 : 10 // if the target has an id, use that instead of multiple other selectors
        const selector = finder(e.target, { seedMinLength: 5, optimizedMinLength: optimizedMinLength })
        const msg = {
            selector: selector,
            value: e.target.value,
            tagName: e.target.tagName,
            action: e.type,
            keyboard: {
                shift: e.shiftKey,
                ctrl: e.ctrlKey,
                meta: e.metaKey
            },
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
    if (msg.type === 'loadster_recording' && msg.value && !enabled) {
        startRecording()
    } else if (msg.type === 'loadster_recording' && !msg.value && enabled) {
        stopRecording(null)
    }
})

