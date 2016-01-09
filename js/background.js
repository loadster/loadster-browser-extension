var LOADSTER_URL = "http://localhost:1999/recording/events?type=chrome";

// A place to store the events until we upload them to Loadster
var requests = {
};

// Create an all-purpose listener callback
var listener = function (info) {
    if (info.url == LOADSTER_URL) {
        return;
    } else if (!requests[info.requestId]) {
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
};

// Create a special callback for when a request is redirected
var redirected = function (info) {
    var request = requests[info.requestId];
    var duplicate = {};

    for (var prop in request) {
        if (request.hasOwnProperty(prop)) {
            duplicate[prop] = request[prop];
        }
    }

    request.timeStarted = new Date().getTime();

    duplicate.completed = true;
    duplicate.timeCompleted = new Date().getTime();
    duplicate.requestId = request.requestId + "_" + Math.round(Math.random() * 100000);

    requests[duplicate.requestId] = duplicate;
};

// Create a special callback for when a request is completed
var completed = function (info) {
    info.completed = true;
    info.timeCompleted = new Date().getTime();

    listener(info);
};

// Create a catch-all filter so we see all types of content
var filter = {
    urls: [ "*://*/*" ],
    types: ["main_frame", "sub_frame", "stylesheet", "script", "image", "object", "xmlhttprequest", "other"]
};

// Listen to all types of events
chrome.webRequest.onBeforeRequest.addListener(listener, filter, ['blocking', 'requestBody']);
chrome.webRequest.onBeforeSendHeaders.addListener(listener, filter, ['requestHeaders']);
chrome.webRequest.onSendHeaders.addListener(listener, filter, ['requestHeaders']);
chrome.webRequest.onHeadersReceived.addListener(function (info) {
    listener(info);

    if (info.statusCode == 301 || info.statusCode == 302) {
        redirected(info);
    }
}, filter, ['blocking']);
chrome.webRequest.onResponseStarted.addListener(listener, filter, ['responseHeaders']);
chrome.webRequest.onCompleted.addListener(completed, filter, ['responseHeaders']);

// Upload events to Loadster at set intervals
setInterval(function() {
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

        xhr.onreadystatechange = function() {
            if (xhr.readyState == 4) {
                var status = xhr.status;

                if (status == 200 || status == 201) {
                    console.log("Uploaded " + Object.keys(upload).length + " recording events to " + LOADSTER_URL);
                } else {
                    throw new Error("HTTP POST failed with status " + status);
                }
            }
        };

        xhr.open("POST", LOADSTER_URL, true);
        xhr.setRequestHeader("Content-Type", "application/json");
        xhr.send(JSON.stringify(upload));
    }
}, 1000);

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
