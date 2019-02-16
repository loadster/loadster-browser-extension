var WORKBENCH_URL = "http://localhost:1999/recording/events?type=chrome";
var INTERVAL = 1000;

var IGNORED_PREFIXES = [
    "https://loadster.app",
    "https://speedway.app"
]

var requests = {}; // Requests are stored here until they are uploaded
var ports = []; // Listeners from the Loadster website that want to receive recording events

//
// Stores a request if we haven't seen it before; otherwise updates it.
//
function requestUpdated (info) {
    chrome.tabs.get(info.tabId, function (tab) {
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
    })
};

//
// Updates a request and checks if it's being redirected.
// 
function headersReceived (info) {
    requestUpdated(info);

    if (info.statusCode == 301 || info.statusCode == 302) {
        requestRedirected(info);
    }
};

//
// Clones a request when it is redirected, marking the redirected one as complete and
// keeping the original for further updates.
//
function requestRedirected (info) {
    var request = requests[info.requestId];
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
};

//
// Finishes a normal request, marking it completed.
//
function finishRequest (info) {
    info.completed = true;
    info.timeCompleted = new Date().getTime();

    requestUpdated(info);
};

//
// Checks if recording is enabled
//
function isEnabled () {
    return localStorage["loadster.recording.enabled"] == "true";
}

//
// Reads an array buffer into a Base64 string
//
function toBase64 (buffer) {
    var binary = '';
    var bytes = new Uint8Array(buffer);
    var length = bytes.byteLength;

    for (var i = 0; i < length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }

    return window.btoa(binary);
}

//
// Create a catch-all filter so we see all types of content
//
var filter = {
    urls: ["*://*/*"],
    types: ["main_frame", "sub_frame", "stylesheet", "script", "image", "object", "xmlhttprequest", "other"]
};

//
// Listen to all types of events
//
chrome.webRequest.onBeforeRequest.addListener(requestUpdated, filter, ['blocking', 'requestBody']);
chrome.webRequest.onBeforeSendHeaders.addListener(requestUpdated, filter, ['requestHeaders', 'extraHeaders']);
chrome.webRequest.onSendHeaders.addListener(requestUpdated, filter, ['requestHeaders', 'extraHeaders']);
chrome.webRequest.onHeadersReceived.addListener(headersReceived, filter, ['blocking', 'responseHeaders']);
chrome.webRequest.onResponseStarted.addListener(requestUpdated, filter, ['responseHeaders']);
chrome.webRequest.onCompleted.addListener(finishRequest, filter, ['responseHeaders']);

//
// Listen for messages from the Loadster dashboard
//
chrome.runtime.onConnectExternal.addListener(function (port) {
    console.assert(port.name === 'loadster-recorder', 'Only accepting incoming messages from loadster-recorder')

    console.log('Adding port ', port);
    ports.push(port);

    port.onMessage.addListener(function (msg) {
        if (msg.type === 'Ping') {
            port.postMessage({type: 'Pong', enabled: isEnabled()})
        } else {
            console.log('got unexpected message: ', msg);
        }
    })

    port.onDisconnect.addListener(function () {
        console.log('Removing port ', port);

        ports.splice(ports.indexOf(port, 1));
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
            port.postMessage({type: "RecordingEvents", data: upload});
        });
    }
}, INTERVAL);

