const iconA = String.fromCodePoint(parseInt('25CF', 16));
const iconB = String.fromCodePoint(parseInt('25CB', 16));

window.loadsterOriginalTitle = window.document.title;

browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'loadster_blink_title') {
        if (msg.value !== null) {
            window.document.title = ((++msg.value % 2) ? iconA : iconB) + ' ' + window.loadsterOriginalTitle;
        } else {
            window.document.title = window.loadsterOriginalTitle;
        }
    }
});