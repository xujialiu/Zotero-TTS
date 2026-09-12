(async () => {
  const win = Services.wm.getMostRecentWindow('zotero:pref');
  await win.Zotero_Preferences.navigateToPane('zotero-tts-pane');
  let cb = null;
  for (let i = 0; i < 80; i++) {
    cb = win.document.getElementById('ztts-strip-angle-brackets');
    if (cb) break;
    await new Promise(resolve => win.setTimeout(resolve, 100));
  }
  const row = cb.closest('hbox, vbox, row, group') || cb.parentElement;
  const help = row.querySelector('[help], [tooltiptext], tooltip');
  return JSON.stringify({
    id: cb.id, checked: !!cb.checked,
    preference: cb.getAttribute('preference'),
    rowText: (row.textContent || '').replace(/\\s+/g, ' ').trim(),
    help: help && help.getAttribute('help')
  }, null, 1);
})()
