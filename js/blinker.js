const iconA = String.fromCodePoint(parseInt('25CF', 16));
const iconB = String.fromCodePoint(parseInt('25CB', 16));

let i = 0;

window.loadsterOriginalTitle = window.document.title;

setInterval(() => {
    if (window['loadster_blink_title']) {
        window.document.title = ((++i % 2) ? iconA : iconB) + ' ' + window.loadsterOriginalTitle;
    } else {
        window.document.title = window.loadsterOriginalTitle;
    }
}, 1000);