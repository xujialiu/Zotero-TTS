(async () => {
  const run = Zotero.ZoteroTTSRun;
  const state = run.state;
  const params = run.params || {};
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
  const join = (...parts) => {
    const path = parts.map(String).join('/');
    return Zotero.isWin ? path.replace(/\//g, '\\') : path;
  };
  const pref = name => Services.prefs.getPrefType(name) === Ci.nsIPrefBranch.PREF_STRING
    ? Services.prefs.getStringPref(name)
    : Services.prefs.getPrefType(name) === Ci.nsIPrefBranch.PREF_BOOL
      ? Services.prefs.getBoolPref(name)
      : Services.prefs.getPrefType(name) === Ci.nsIPrefBranch.PREF_INT
        ? Services.prefs.getIntPref(name)
        : null;
  const closePrefs = async () => {
    const win = Services.wm.getMostRecentWindow('zotero:pref');
    if (win?.close) win.close();
    await waitFor(() => !Services.wm.getMostRecentWindow('zotero:pref'), 7000);
  };
  const pane = async () => {
    await closePrefs();
    Zotero.Utilities.Internal.openPreferences('zotero-tts@xujialiu.top');
    const win = await waitFor(() => Services.wm.getMostRecentWindow('zotero:pref'), 7000);
    if (!win) throw new Error('settings window did not open');
    if (win.Zotero_Preferences?.navigateToPane) await win.Zotero_Preferences.navigateToPane('zotero-tts-pane');
    const doc = await waitFor(() => {
      const d = win.document;
      return d?.getElementById('ztts-provider-openai-official') ? d : null;
    }, 10000);
    if (!doc) throw new Error('Zotero-TTS settings pane did not load');
    const ready = await waitFor(() => {
      const status = doc.getElementById('ztts-voices-status')?.textContent || '';
      const rows = doc.getElementById('ztts-voices-list')?.children || [];
      return !/listing voices/i.test(status) && rows.length ? { status, rows } : null;
    }, 30000);
    if (!ready) throw new Error('settings voice browser did not finish listing');
    return { win, doc };
  };
  const rowInfo = doc => [...(doc.getElementById('ztts-voices-list')?.children || [])].map((row, index) => {
    const buttons = [...row.querySelectorAll('button')];
    return { index, label: buttons[2]?.textContent?.trim() || '', title: buttons[2]?.getAttribute('title') || '', row, labelButton: buttons[2] };
  }).filter(entry => entry.label && entry.labelButton);
  const chooseRow = async (doc, label) => {
    const found = await waitFor(() => rowInfo(doc).find(entry => entry.label === label), 5000);
    if (!found) throw new Error(`voice row disappeared: ${label}`);
    const titleBefore = found.labelButton.getAttribute('title') || '';
    found.labelButton.click();
    const choice = await waitFor(() => {
      const value = pref(prefix + 'readAloud.defaultVoice');
      try { return value ? JSON.parse(value) : null; } catch (_) { return null; }
    }, 5000);
    if (!choice?.id) throw new Error(`settings pick did not commit: ${label}`);
    return { ...choice, label, clickedTitle: titleBefore };
  };
  try {
    const session = globalThis.__zttsDocumentVoicesSession;
    if (!session?.prefs || !session.webdavMatched) throw new Error('private baseline/WebDAV isolation is missing');
    const existingReaders = Zotero.Reader?._readers || [];
    if (existingReaders.length) throw new Error(`owner readers present before fixtures: ${existingReaders.length}`);
    const oldVolume = session.prefs[prefix + 'readAloud.volume']?.value;
    const oldDebug = !!Zotero.Debug.storing;
    session.run = String(params.runId || Date.now());
    session.volumeBefore = oldVolume;
    session.debugBefore = oldDebug;
    Services.prefs.setIntPref(prefix + 'readAloud.volume', 0);
    if (!oldDebug) Zotero.Debug.setStore(true);

    const { doc } = await pane();
    const rowsBefore = rowInfo(doc);
    if (rowsBefore.length < 2) throw new Error(`voice browser exposed only ${rowsBefore.length} selectable rows`);
    const voiceA = await chooseRow(doc, rowsBefore[0].label);
    if (!doc.getElementById('ztts-provider-openai-official')) throw new Error('settings pane disappeared after default pick');
    state.voices = { A: voiceA, labels: rowsBefore.map(entry => entry.label) };
    await closePrefs();

    const dir = Zotero.isWin ? String(params.fixturesDir || '').replace(/\//g, '\\') : String(params.fixturesDir || '');
    const specs = [
      { name: 'A', kind: 'pdf', file: join(dir, 'fixture-a.pdf') },
      { name: 'B', kind: 'epub', file: join(dir, 'return-key', 'return-key.epub') },
    ];
    const fixtures = {};
    for (const spec of specs) {
      const title = `Zotero-TTS issue 146 ${spec.kind} ${session.run}`;
      const imported = await Zotero.Attachments.importFromFile({ file: spec.file, libraryID: Zotero.Libraries.userLibraryID, title });
      const item = typeof imported === 'number' ? Zotero.Items.get(imported) : imported;
      if (!item?.id) throw new Error(`${spec.kind} fixture import returned no item`);
      fixtures[spec.name] = { itemID: item.id, key: item.key, title, kind: spec.kind, file: spec.file };
    }
    state.fixtures = fixtures;
    return JSON.stringify({
      status: 'PASS', build: Zotero.ZoteroTTS?.version || null, volume: pref(prefix + 'readAloud.volume'),
      webdavIsolated: session.webdavMatched, openReaderPositionPlugin: false,
      settings: { rows: rowsBefore.length, voiceA, retiredSharedVoiceSwitch: !doc.querySelector('[preference="extensions.zotero.zotero-tts.readAloud.sameForAllDocuments"]') },
      fixtures: Object.fromEntries(Object.entries(fixtures).map(([k, v]) => [k, { itemID: v.itemID, key: v.key, kind: v.kind }])),
      debugStoring: !!Zotero.Debug.storing, settingsClosed: !Services.wm.getMostRecentWindow('zotero:pref'), windowState: Zotero.getMainWindow?.()?.windowState ?? null,
    }, null, 1);
  } catch (e) {
    throw new Error(String(e));
  }
})();
