(async () => {
  const win = Services.wm.getMostRecentWindow('zotero:pref');
  const doc = win?.document;
  const box = doc?.getElementById('ztts-strip-angle-brackets');
  const input = doc?.getElementById('ztts-bracket-pairs');
  if (!win || !box || !input) return JSON.stringify({ error: 'bracket controls missing' });
  const wait = ms => new Promise(resolve => win.setTimeout(resolve, ms));
  const state = label => ({
    label,
    prefEnabled: Zotero.Prefs.get('zotero-tts.readAloud.stripAngleBrackets'),
    prefPairs: Zotero.Prefs.get('zotero-tts.readAloud.bracketPairs'),
    checked: !!box.checked,
    inputValue: input.value,
    inputDisabled: !!input.disabled,
  });
  const before = state('before');
  if (box.checked) {
    box.checked = false;
    box.dispatchEvent(new win.Event('command', { bubbles: true }));
    await wait(20);
  }
  input.value = '【】 ()';
  input.dispatchEvent(new win.Event('input', { bubbles: true }));
  const draft = state('draft-off');
  box.checked = true;
  box.dispatchEvent(new win.Event('command', { bubbles: true }));
  await wait(40);
  const enabled = state('enabled');
  const settings = JSON.parse(await Zotero.ZoteroTTS.diagnostics.textSettings());
  return JSON.stringify({ before, draft, enabled, settings }, null, 1);
})()
