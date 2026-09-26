(async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const prefix = 'extensions.zotero.zotero-tts.';
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const waitFor = async (test, ms = 30000, step = 100) => {
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
  await waitFor(() => {
    const status = doc.getElementById('ztts-voices-status')?.textContent || '';
    return !/listing voices/i.test(status) && doc.getElementById('ztts-voices-list')?.children?.length ? true : null;
  });
  const records = JSON.parse(await Zotero.ZoteroTTS.diagnostics.documentVoices());
  state.backupPane = { settingsWindow: true, recordsBefore: records.records, defaultBefore: records.defaultVoice };
  return JSON.stringify({ status: 'PASS', backupButton: !!doc.getElementById('ztts-backup'), restoreButton: !!doc.getElementById('ztts-restore'), records: records.records, defaultVoice: records.defaultVoice, windowType: 'zotero:pref' }, null, 1);
})();
