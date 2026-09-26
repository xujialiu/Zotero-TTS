(async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const prefix = 'extensions.zotero.zotero-tts.';
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const waitFor = async (test, ms = 15000, step = 100) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const value = test();
      if (value) return value;
      await sleep(step);
    }
    return test();
  };
  const closePrefs = async () => {
    const win = Services.wm.getMostRecentWindow('zotero:pref');
    if (win?.close) win.close();
    await waitFor(() => !Services.wm.getMostRecentWindow('zotero:pref'), 7000);
  };
  const openPane = async () => {
    await closePrefs();
    Zotero.Utilities.Internal.openPreferences('zotero-tts@xujialiu.top');
    const win = await waitFor(() => {
      const candidate = Services.wm.getMostRecentWindow('zotero:pref');
      return candidate?.Zotero_Preferences?.navigation ? candidate : null;
    }, 10000);
    if (!win) throw new Error('settings window did not open');
    await win.Zotero_Preferences.navigateToPane('zotero-tts-pane');
    const doc = await waitFor(() => win.document.getElementById('ztts-provider-openai-official') ? win.document : null, 10000);
    if (!doc) throw new Error('Zotero-TTS settings pane did not load');
    const listed = await waitFor(() => {
      const status = doc.getElementById('ztts-voices-status')?.textContent || '';
      const rows = doc.getElementById('ztts-voices-list')?.children || [];
      return !/listing voices/i.test(status) && rows.length ? rows : null;
    }, 30000);
    if (!listed) throw new Error('settings voice browser did not finish listing');
    return { win, doc };
  };
  const rows = doc => [...(doc.getElementById('ztts-voices-list')?.children || [])].map(row => {
    const buttons = [...row.querySelectorAll('button')];
    return { row, label: buttons[2]?.textContent?.trim() || '', button: buttons[2], title: buttons[2]?.getAttribute('title') || '' };
  }).filter(entry => entry.label && entry.button);
  const readChoice = () => {
    try { return JSON.parse(Services.prefs.getStringPref(prefix + 'readAloud.defaultVoice')); } catch (_) { return null; }
  };
  const openReader = async fixture => {
    const result = Zotero.Reader.open(fixture.itemID);
    if (result && typeof result.then === 'function') await result;
    return waitFor(() => (Zotero.Reader._readers || []).find(reader => reader?.itemID === fixture.itemID && reader?._internalReader?._readAloudManager), 24000, 150);
  };
  const report = async () => JSON.parse(await Zotero.ZoteroTTS.diagnostics.documentVoices());
  if (!state.voices?.A || !state.voices.labels?.[1] || !state.fixtures?.A || !state.fixtures?.B) throw new Error('initial-copy state missing');
  const before = await report();
  const labelB = state.voices.labels[1];
  const { doc } = await openPane();
  const candidate = await waitFor(() => rows(doc).find(entry => entry.label === labelB), 5000);
  if (!candidate) throw new Error(`second voice row missing: ${labelB}`);
  candidate.button.click();
  const voiceB = await waitFor(() => {
    const value = readChoice();
    return value && value.id !== state.voices.A.id ? value : null;
  }, 5000);
  if (!voiceB) throw new Error('settings pick B did not commit a distinct default');
  const rowAfter = await waitFor(() => rows(doc).find(entry => entry.label === labelB), 5000);
  const settingsHighlight = !!rowAfter && rowAfter.title && !/make it the default/i.test(rowAfter.title);
  const retiredSharedVoiceSwitch = !doc.querySelector('[preference="extensions.zotero.zotero-tts.readAloud.sameForAllDocuments"]');
  await closePrefs();
  state.voices.B = { ...voiceB, label: labelB };
  const unchangedOld = before.readers.filter(entry => entry.key === state.readers.A.diagnostic.key || entry.key === state.readers.B.diagnostic.key)
    .every(entry => entry.saved?.voice?.id === state.voices.A.id && entry.saved?.manual === false);

  const dir = Zotero.isWin ? String(Zotero.ZoteroTTSRun.params.fixturesDir).replace(/\//g, '\\') : String(Zotero.ZoteroTTSRun.params.fixturesDir);
  const file = dir.replace(/[\\/]$/, '') + (Zotero.isWin ? '\\' : '/') + 'fixture-a.pdf';
  const title = `Zotero-TTS issue 146 new ${Date.now()}`;
  const imported = await Zotero.Attachments.importFromFile({ file, libraryID: Zotero.Libraries.userLibraryID, title });
  const item = typeof imported === 'number' ? Zotero.Items.get(imported) : imported;
  if (!item?.id) throw new Error('new fixture import failed');
  const reader = await openReader({ itemID: item.id });
  if (!reader) throw new Error('new fixture reader did not initialize');
  await sleep(300);
  const after = await report();
  const newEntry = after.readers.find(entry => entry.key?.endsWith('/' + item.key));
  if (!newEntry || newEntry.saved?.voice?.id !== voiceB.id || newEntry.saved.manual !== false) throw new Error(`new document did not inherit B: ${JSON.stringify(newEntry)}`);
  const oldEntries = after.readers.filter(entry => entry.key === state.readers.A.diagnostic.key || entry.key === state.readers.B.diagnostic.key);
  const oldStillA = oldEntries.length === 2 && oldEntries.every(entry => entry.saved?.voice?.id === state.voices.A.id && entry.saved.manual === false);
  if (!unchangedOld || !oldStillA || !settingsHighlight || !retiredSharedVoiceSwitch) throw new Error(`default independence mismatch: ${JSON.stringify({unchangedOld, oldStillA, settingsHighlight, retiredSharedVoiceSwitch, before, after})}`);
  state.fixtureC = { itemID: item.id, key: item.key, title, kind: 'pdf', file };
  return JSON.stringify({ status: 'PASS', defaultBefore: before.defaultVoice, defaultAfter: after.defaultVoice, voiceA: state.voices.A, voiceB: state.voices.B, oldStillA, newDocument: { key: newEntry.key, saved: newEntry.saved }, settingsHighlight, retiredSharedVoiceSwitch }, null, 1);
})();
