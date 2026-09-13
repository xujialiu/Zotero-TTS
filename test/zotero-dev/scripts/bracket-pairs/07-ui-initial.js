(async () => {
  const win = Services.wm.getMostRecentWindow('zotero:pref');
  if (!win) return JSON.stringify({ error: 'preferences window missing' });
  await win.Zotero_Preferences.navigateToPane('zotero-tts-pane');
  let box = null;
  let input = null;
  for (let i = 0; i < 60; i++) {
    box = win.document.getElementById('ztts-strip-angle-brackets');
    input = win.document.getElementById('ztts-bracket-pairs');
    if (box && input) break;
    await new Promise(resolve => win.setTimeout(resolve, 100));
  }
  if (!box || !input) return JSON.stringify({ error: 'bracket controls missing' });
  const row = box.closest('hbox, vbox, row, group') || box.parentElement;
  return JSON.stringify({
    checkbox: {
      id: box.id,
      checked: !!box.checked,
      disabled: !!box.disabled,
      preference: box.getAttribute('preference'),
      label: box.getAttribute('label'),
      l10nID: box.getAttribute('data-l10n-id'),
    },
    input: {
      id: input.id,
      value: input.value,
      disabled: !!input.disabled,
      ariaLabel: input.getAttribute('aria-label'),
      l10nID: input.getAttribute('data-l10n-id'),
    },
    rowText: (row?.textContent || '').replace(/\\s+/g, ' ').trim(),
    help: (() => {
      const node = row?.querySelector?.('[help], [tooltiptext], tooltip');
      return node ? { help: node.getAttribute('help'), value: node.getAttribute('value'), l10nID: node.getAttribute('data-l10n-id') } : null;
    })(),
  }, null, 1);
})()
