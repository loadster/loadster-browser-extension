var WORKBENCH_URL = "http://localhost:1999/recording/events?type=chrome";
var INTERVAL = 1000;

const IGNORED_PREFIXES = [
    "https://loadster.app",
    "https://speedway.app"
]

let requests = {}; // Requests are stored here until they are uploaded
let ports = []; // Listeners from the Loadster website that want to receive recording events
let titles = {};

function handleFirstRun(details) {
    if (details.reason === 'install') {
        localStorage["loadster.recording.enabled"] = "true";
    }
}

//
// Stores a request if we haven't seen it before; otherwise updates it.
//
async function requestUpdated(info) {
    if (Math.sign(info.tabId) >= 0) {
        try {
            const tab = await browser.tabs.get(info.tabId);
            if (tab.url) {
                for (var i = 0; i < IGNORED_PREFIXES.length; i++) {
                    if (tab.url.indexOf(IGNORED_PREFIXES[i]) === 0) {
                        return;
                    }
                }
            } else if (info.url === WORKBENCH_URL) {
                return;
            }

            // Track the request start time if it's a new request
            if (!requests[info.requestId]) {
                requests[info.requestId] = {
                    timeStarted: new Date().getTime()
                };
            }

            // Base64 encode the body parts if necessary
            // TODO recording file uploads. consider to use FileReader here
            if (info.requestBody && info.requestBody.raw) {
                for (var i = 0; i < info.requestBody.raw.length; i++) {
                    var part = info.requestBody.raw[i];
                    
                    if (part.bytes) {
                        part.base64 = toBase64(part.bytes);
                    } else if (part.file) {
                    }
                }
            }

            // Copy properties
            for (var prop in info) {
                if (info.hasOwnProperty(prop)) {
                    requests[info.requestId][prop] = info[prop];
                }
            }
        } catch (err) {
            console.error(err);
        }
    }
};

//
// Updates a request and checks if it's being redirected.
// 
function headersReceived(info) {
    requestUpdated(info);

    if (info.statusCode == 301 || info.statusCode == 302) {
        requestRedirected(info);
    }
};

//
// Clones a request when it is redirected, marking the redirected one as complete and
// keeping the original for further updates.
//
function requestRedirected(info) {
    var request = requests[info.requestId];

    if (request) {
        var redirected = {};

        for (var prop in request) {
            if (request.hasOwnProperty(prop)) {
                redirected[prop] = request[prop];
            }
        }

        request.timeStarted = new Date().getTime();

        redirected.requestId = request.requestId + '_' + Math.round(Math.random() * 1000000);
        redirected.completed = true;
        redirected.timeCompleted = new Date().getTime();

        requests[redirected.requestId] = redirected;
    }
};

//
// Finishes a normal request, marking it completed.
//
function finishRequest(info) {
    info.completed = true;
    info.timeCompleted = new Date().getTime();

    requestUpdated(info);
};

//
// Checks if recording is enabled
//
function isEnabled() {
    return localStorage["loadster.recording.enabled"] == "true";
}

//
// Reads an array buffer into a Base64 string
//
function toBase64(buffer) {
    var binary = '';
    var bytes = new Uint8Array(buffer);
    var length = bytes.byteLength;

    for (var i = 0; i < length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }

    return window.btoa(binary);
}

function indicateRecording(tick) {
    // black circle large  2B24
    // black circle medium 25CF
    // 🔴 1F534
    const iconA = String.fromCodePoint(parseInt('25CF', 16));
    // white circle
    const iconB = String.fromCodePoint(parseInt('25CB', 16));
    const tabs = [].concat(...ports.map(port => port.tabIds));

    tabs.forEach(id => {
        browser.tabs.get(id).then(tab => {
            if (tab.status === 'complete' && titles[tab.id]) {
                const title = `${((tick % 2 === 0) ? iconA : iconB)} ${titles[tab.id]}`;
                const escaped = title.replace('\'', '\\\'');
                const code = `document.title = '${escaped}'`;

                browser.tabs.executeScript(id, { code });
            }
        });
    });
}

function saveTitle(tabId, changeInfo, tab) {
    if (changeInfo.status === 'complete') {
        titles[tabId] = tab.title;
    }
}

function handleCreatedTab(created, port) {
    if (port.tabIds.some(id => (id === created.openerTabId && id !== created.id))) {
        port.tabIds.push(created.id);
    }
}

function handleRemovedTab(tabId, port) {
    const index = port.tabIds.indexOf(tabId);
    if (index !== -1) {
        port.tabIds.splice(index, 1);
    }
    if (!port.tabIds.length) {
        port.postMessage({ type: 'RecordingStop', data: 'No pages open' });
    }
}

function handleCreatedRootTab(tab, port) {
    port.tabIds.push(tab.id);

    browser.tabs.onUpdated.addListener(saveTitle);
    browser.tabs.onCreated.addListener((created) => handleCreatedTab(created, port));
    browser.tabs.onRemoved.addListener((tabId, info) => handleRemovedTab(tabId, port));
}

//
// Create a catch-all filter so we see all types of content
//
const filter = {
    urls: ["*://*/*"],
    types: ["main_frame", "sub_frame", "stylesheet", "script", "image", "object", "xmlhttprequest", "other"]
};
browser.webRequest.onBeforeRequest.addListener(requestUpdated, filter, ['blocking', 'requestBody']);
browser.webRequest.onBeforeSendHeaders.addListener(requestUpdated, filter, ['requestHeaders']);
browser.webRequest.onSendHeaders.addListener(requestUpdated, filter, ['requestHeaders']);
browser.webRequest.onHeadersReceived.addListener(headersReceived, filter, ['blocking', 'responseHeaders']);
browser.webRequest.onResponseStarted.addListener(requestUpdated, filter, ['responseHeaders']);
browser.webRequest.onCompleted.addListener(finishRequest, filter, ['responseHeaders']);

browser.runtime.onInstalled.addListener(handleFirstRun);

//
// Listen for messages from the Loadster dashboard
//
browser.runtime.onConnect.addListener(function (port) {
    console.assert(port.name === 'loadster-recorder', 'Only accepting incoming messages from loadster-recorder')

    console.log('Adding port ', port);
    port.tabIds = [];
    ports.push(port);
    let tick = 0;

    port.onMessage.addListener(async function (msg) {
        if (msg.type === 'Ping') {
            indicateRecording(tick);
            port.postMessage({ type: 'Pong', enabled: isEnabled() });
            tick++;
        } else if (msg.type === 'Url') {
            const tab = await browser.tabs.create({
                url: msg.value,
                active: true,
            });
            handleCreatedRootTab(tab, port);
        } else {
            console.log('got unexpected message: ', msg);
        }
    })

    port.onDisconnect.addListener(function () {
        console.log('Removing port ', port);

        // restore document.title...
        port.tabIds.forEach(id => {

            if (titles[id]) {
                let code = `document.title = "${titles[id]}";`;
                browser.tabs.executeScript(id, { code });
                delete titles[id];
            }
        });
        ports.splice(ports.indexOf(port), 1);

        tick = 0;
    })
})

//
// Upload events to Loadster at set intervals
//
setInterval(function () {
    var upload = {};

    for (var requestId in requests) {
        if (requests.hasOwnProperty(requestId)) {
            if (requests[requestId].completed) {
                upload[requestId] = requests[requestId];

                delete requests[requestId];
            }
        }
    }

    if (Object.keys(upload).length && isEnabled()) {
        var xhr = new XMLHttpRequest();

        xhr.onreadystatechange = function () {
            if (xhr.readyState === 4) {
                var status = xhr.status;

                if (status === 200 || status === 201) {
                    console.log("Uploaded " + Object.keys(upload).length + " recording events to " + WORKBENCH_URL);
                } else {
                    console.warn("Failed to upload " + Object.keys(upload).length + " recording events to " + WORKBENCH_URL);
                }
            }
        };

        xhr.open("POST", WORKBENCH_URL, true);
        xhr.setRequestHeader("Content-Type", "application/json");
        xhr.send(JSON.stringify(upload));

        console.log('Sending recording events to ' + ports.length + ' port(s)')

        ports.forEach(function (port) {
            const filtered = Object.keys(upload)
                .filter(key => port.tabIds.includes(upload[key].tabId))
                .reduce((obj, key) => ({
                    ...obj,
                    [key]: upload[key]
                }), {});

            port.postMessage({ type: "RecordingEvents", data: filtered });
        });
    }
}, INTERVAL);

