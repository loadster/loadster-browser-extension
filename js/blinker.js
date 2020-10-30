const iconA = String.fromCodePoint(0x25CF),
  iconB = String.fromCodePoint(0x25CB);

window.loadsterOriginalTitle = window.document.title;

browser.runtime.onMessage.addListener((msg) => {
  if (msg.type === BLINK_TITLE) {
    if (msg.value !== null) {
      window.document.title = `${++msg.value % 2 ? iconA : iconB} ${window.loadsterOriginalTitle}`;
    } else {
      window.document.title = window.loadsterOriginalTitle;
    }
  }
});
