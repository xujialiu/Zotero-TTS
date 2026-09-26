(async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const params = Zotero.ZoteroTTSRun.params || {};
  const prefix = 'extensions.zotero.zotero-tts.';
  const prefs = Services.prefs;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const waitFor = async (test, timeout = 24000, step = 100) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      const value = await test();
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
    const doc = await waitFor(() => win.document.getElementById('ztts-provider-fish') ? win.document : null, 10000);
    if (!doc) throw new Error('Fish settings pane did not load');
    return { win, doc };
  };
  const readers = () => Zotero.Reader?._readers || [];
  const readerFor = itemID => {
    const list = readers();
    for (let i = 0; i < list.length; i++) if (list[i]?.itemID === itemID && !list[i]?._window?.closed) return list[i];
    return null;
  };
  const managerFor = reader => reader?._internalReader?._readAloudManager;
  const report = async () => JSON.parse(await Zotero.ZoteroTTS.diagnostics.documentVoices());
  const fishReport = async () => JSON.parse(await Zotero.ZoteroTTS.diagnostics.fishVoices(true));
  const closeReader = async reader => {
    if (!reader) return;
    const manager = managerFor(reader);
    if (manager?.active) reader._internalReader.toggleReadAloudPopup(false);
    await waitFor(() => !managerFor(reader)?.active, 7000);
    const main = Zotero.getMainWindow?.();
    if (reader.tabID && main?.Zotero_Tabs?.close) main.Zotero_Tabs.close(reader.tabID);
    await waitFor(() => !readerFor(reader.itemID), 10000);
  };
  const openReader = async fixture => {
    const main = Zotero.getMainWindow?.();
    if (main) { main.windowState = main.STATE_NORMAL; main.focus?.(); }
    const opened = Zotero.Reader.open(fixture.itemID);
    if (opened && typeof opened.then === 'function') await opened;
    const reader = await waitFor(() => {
      const candidate = readerFor(fixture.itemID);
      return candidate?._internalReader?._readAloudManager ? candidate : null;
    }, 24000, 150);
    if (!reader?._internalReader?._readAloudManager) throw new Error('fixture reader did not initialize');
    if (main?.Zotero_Tabs?.select && reader.tabID) main.Zotero_Tabs.select(reader.tabID);
    reader.focus?.(); reader._iframeWindow?.focus?.();
    return reader;
  };
  const playerDoc = reader => reader?._iframeWindow?.document?.querySelector('#ztts-player-frame')?.contentDocument || null;
  const noticeText = reader => {
    const r = reader;
    return playerDoc(r)?.getElementById('ztts-voice-notice')?.textContent
      || playerDoc(r)?.getElementById('ztts-speed-toast')?.textContent
      || r?._iframeWindow?.document?.getElementById('ztts-voice-notice')?.textContent
      || r?._iframeWindow?.document?.getElementById('ztts-speed-toast')?.textContent || null;
  };
  const fishLogCount = async () => String(await Zotero.Debug.get()).split('\n').filter(line => /\[zotero-tts\] (?:prefetch: )?fish: \d+ word timestamps/i.test(line)).length;
  const openPopup = async reader => {
    const main = Zotero.getMainWindow?.();
    if (main?.Zotero_Tabs?.select && reader.tabID) main.Zotero_Tabs.select(reader.tabID);
    reader.focus?.(); reader._iframeWindow?.focus?.();
    try { reader._iframeWindow?.document?.notifyUserGestureActivation?.(); } catch (_) {}
    reader._internalReader.toggleReadAloudPopup(true);
    const frame = await waitFor(() => playerDoc(reader), 10000);
    await sleep(900);
    return { frame: !!frame, notice: noticeText(reader) };
  };
  const fixturePath = () => {
    const root = String(params.fixturesDir || '').replace(/[\\/]$/, '');
    return root + (Zotero.isWin ? '\\' : '/') + 'fixture-a.pdf';
  };

  // Enable the tested provider through its settings commit point with both
  // Official and Your voices available. The free model is already configured.
  prefs.setBoolPref(prefix + 'fish.includeOfficial', true);
  prefs.setBoolPref(prefix + 'fish.includeOwn', true);
  prefs.setBoolPref(prefix + 'fish.includeManual', false);
  prefs.setBoolPref(prefix + 'fish.enabled', false);
  let enabledResult = null;
  try {
    const { doc } = await openPane();
    const button = doc.getElementById('ztts-enable-fish');
    const line = doc.getElementById('ztts-test-result-fish');
    if (!button || !line) throw new Error('Fish enable controls missing');
    button.click();
    await waitFor(() => prefs.getBoolPref(prefix + 'fish.enabled') && button.getAttribute('label') === 'Disable', 30000);
    enabledResult = { label: button.getAttribute('label'), line: String(line.textContent || '').trim(), enabled: prefs.getBoolPref(prefix + 'fish.enabled') };
    if (!enabledResult.enabled || enabledResult.label !== 'Disable' || !/Synthesis works\./i.test(enabledResult.line)) throw new Error(`Fish enable failed: ${JSON.stringify(enabledResult)}`);
  } finally {
    await closePrefs();
  }

  const imported = await Zotero.Attachments.importFromFile({ file: fixturePath(), libraryID: Zotero.Libraries.userLibraryID, title: `Zotero-TTS fish #147 ${Date.now()}` });
  const item = typeof imported === 'number' ? Zotero.Items.get(imported) : imported;
  if (!item?.id || !item.key) throw new Error('Fish #147 fixture import failed');
  const fixture = { itemID: item.id, key: item.key, title: item.getField('title'), kind: 'pdf', file: fixturePath() };
  state.fixture = fixture;

  let reader = await openReader(fixture);
  let initial = await report();
  let entry = initial.readers.find(value => value.key?.endsWith('/' + fixture.key));
  if (!entry?.key) throw new Error(`fixture omitted from document voice diagnostic: ${JSON.stringify(initial)}`);
  if (managerFor(reader)?.active) reader._internalReader.toggleReadAloudPopup(false);
  await waitFor(() => !managerFor(reader)?.active, 7000);
  const saved = { voice: { id: 'fish::mul/default', lang: 'mul' }, manual: true, ts: Date.now() };
  prefs.setStringPref(prefix + 'documentVoices.' + entry.key, JSON.stringify(saved));
  const pulseType = prefs.getPrefType(prefix + 'documentVoiceChanged');
  const pulse = pulseType === prefs.PREF_STRING ? Number(prefs.getStringPref(prefix + 'documentVoiceChanged') || 0) : 0;
  prefs.setStringPref(prefix + 'documentVoiceChanged', String(pulse + 1));
  await waitFor(async () => {
    const current = await report();
    const value = current.records?.['documentVoices.' + entry.key];
    return value && JSON.parse(value).voice.id === saved.voice.id ? value : null;
  }, 7000);
  await closeReader(reader);

  // Official-only: the saved record must remain Default while the catalog
  // no longer offers it. Reopen a fresh reader so no stale manager list can
  // satisfy this check.
  prefs.setBoolPref(prefix + 'fish.includeOfficial', true);
  prefs.setBoolPref(prefix + 'fish.includeOwn', false);
  prefs.setBoolPref(prefix + 'fish.includeManual', false);
  const officialOnly = await fishReport();
  if ((officialOnly.ids || []).includes('mul/default')) throw new Error(`Official-only catalog still contains Default: ${JSON.stringify({count:officialOnly.count})}`);
  reader = await openReader(fixture);
  entry = (await report()).readers.find(value => value.key?.endsWith('/' + fixture.key));
  const beforeUnavailableLines = await fishLogCount();
  const unavailableOpen = await openPopup(reader);
  const manager = managerFor(reader);
  const unavailableNotice = await waitFor(() => noticeText(reader), 5000) || unavailableOpen.notice;
  const unavailableAfterLines = await fishLogCount();
  const unavailable = {
    saved: entry?.saved || null,
    selected: manager?.selectedVoiceID || null,
    active: !!manager?.active,
    controller: !!manager?._controller,
    notice: unavailableNotice,
    fishTimestampLines: { before: beforeUnavailableLines, after: unavailableAfterLines },
    diagnosticSelected: entry?.selected || null,
  };
  const unavailablePass = unavailable.saved?.voice?.id === saved.voice.id
    && unavailable.saved.manual === true
    && !unavailable.controller
    && unavailableAfterLines === beforeUnavailableLines
    && /unavailable|saved voice/i.test(String(unavailable.notice || ''));
  await closeReader(reader);
  if (!unavailablePass) throw new Error(`unavailable Default mismatch: ${JSON.stringify(unavailable)}`);

  // Re-enable Your voices with the same cached lists and reopen the same
  // record. The document choice must be offered and selected again.
  prefs.setBoolPref(prefix + 'fish.includeOwn', true);
  const restoredCatalog = await fishReport();
  if (!(restoredCatalog.ids || []).includes('mul/default')) throw new Error(`Default did not return after re-enabling Your voices: ${JSON.stringify({count:restoredCatalog.count})}`);
  reader = await openReader(fixture);
  entry = (await report()).readers.find(value => value.key?.endsWith('/' + fixture.key));
  const restoredOpen = await openPopup(reader);
  const restoredManager = managerFor(reader);
  const restoredSelected = await waitFor(() => restoredManager?.selectedVoiceID === 'fish::mul/default' ? restoredManager.selectedVoiceID : null, 10000);
  const restored = {
    saved: entry?.saved || null,
    selected: restoredSelected || restoredManager?.selectedVoiceID || null,
    active: !!restoredManager?.active,
    controller: !!restoredManager?._controller,
    notice: restoredOpen.notice || noticeText(reader),
    diagnosticSelected: entry?.selected || null,
  };
  const restoredPass = restored.saved?.voice?.id === saved.voice.id && restored.saved.manual === true && restored.selected === 'fish::mul/default';
  await closeReader(reader);
  if (!restoredPass) throw new Error(`restored Default selection mismatch: ${JSON.stringify(restored)}`);

  return JSON.stringify({
    status: 'PASS', enabledResult, fixture: { itemID: fixture.itemID, key: fixture.key },
    initialRecord: { key: entry?.key || null, saved }, officialOnly: { sources: officialOnly.sources, count: officialOnly.count, defaultPresent: (officialOnly.ids || []).includes('mul/default') },
    unavailable, restoredCatalog: { sources: restoredCatalog.sources, count: restoredCatalog.count, defaultPresent: (restoredCatalog.ids || []).includes('mul/default') }, restored,
  }, null, 1);
})();
