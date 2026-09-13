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
  const trace = [state('before')];
  Zotero.Prefs.set('zotero-tts.readAloud.bracketPairs', '() 【】');
  await wait(30);
  trace.push(state('pairs-external-write'));
  Zotero.Prefs.set('zotero-tts.readAloud.stripAngleBrackets', false);
  await wait(30);
  trace.push(state('enabled-external-off'));
  Zotero.Prefs.set('zotero-tts.readAloud.bracketPairs', '<> []');
  await wait(30);
  trace.push(state('pairs-external-default'));
  Zotero.Prefs.set('zotero-tts.readAloud.stripAngleBrackets', true);
  await wait(30);
  trace.push(state('enabled-external-on'));
  return JSON.stringify({ trace }, null, 1);
})()
