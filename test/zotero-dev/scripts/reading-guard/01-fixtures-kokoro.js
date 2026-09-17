return (async () => {
  const run = Zotero.ZoteroTTSRun, state = run.state, P = run.params;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const fixtureDir = String(P.fixturesDir || '').replace(/\\/g, '/');
  const path = (...parts) => PathUtils.join(String(P.fixturesDir || ''), ...parts);
  const findReader = itemID => {
    for (const r of Zotero.Reader._readers || []) if (r?.itemID === itemID) return r;
    return null;
  };
  const titleOf = itemID => {
    try { const item = Zotero.Items.get(itemID); return item?.parentItem?.title || item?.getField?.('title') || String(itemID); } catch { return String(itemID); }
  };
  const pref = (name, value) => {
    const key = 'extensions.zotero.zotero-tts.' + name;
    const type = Services.prefs.getPrefType(key);
    if (type === Services.prefs.PREF_BOOL) Services.prefs.setBoolPref(key, !!value);
    else if (type === Services.prefs.PREF_INT) Services.prefs.setIntPref(key, Number(value));
    else Services.prefs.setStringPref(key, String(value));
  };
  const getPane = async () => {
    let win = Services.wm.getMostRecentWindow('zotero:pref');
    if (!win) {
      Zotero.Utilities.Internal.openPreferences('zotero-tts@xujialiu.top');
      for (let i = 0; i < 80 && !win; i++) { await sleep(100); win = Services.wm.getMostRecentWindow('zotero:pref'); }
    }
    if (!win) throw new Error('settings window did not open');
    try { await win.Zotero_Preferences.navigateToPane('zotero-tts-pane'); } catch {}
    for (let i = 0; i < 100; i++) {
      if (win.document.getElementById('ztts-enable-local')) return win;
      await sleep(100);
    }
    throw new Error('Zotero-TTS settings pane did not initialize');
  };
  const waitNoListing = async doc => {
    for (let i = 0; i < 160; i++) {
      const text = doc.getElementById('ztts-voices-status')?.textContent || '';
      if (!/listing voices/i.test(text)) return text;
      await sleep(100);
    }
    return doc.getElementById('ztts-voices-status')?.textContent || '';
  };
  const pane = await getPane();
  try { pane.focus(); } catch {}
  const doc = pane.document;
  const localButton = doc.getElementById('ztts-enable-local');
  const before = { enabled: Services.prefs.getBoolPref('extensions.zotero.zotero-tts.local.enabled'), label: localButton?.getAttribute('label') || null };
  if (!before.enabled) {
    localButton.click();
    let sawChecking = false;
    const t0 = Date.now();
    while (Date.now() - t0 < 30000) {
      const label = localButton.getAttribute('label') || '';
      const result = doc.getElementById('ztts-test-result-local')?.textContent || '';
      if (/checking|testing/i.test(label + ' ' + result)) sawChecking = true;
      if (Services.prefs.getBoolPref('extensions.zotero.zotero-tts.local.enabled') === true && !/checking|testing/i.test(label)) break;
      if (sawChecking && !/checking|testing/i.test(label) && !Services.prefs.getBoolPref('extensions.zotero.zotero-tts.local.enabled')) break;
      await sleep(200);
    }
  }
  const enableResult = {
    enabled: Services.prefs.getBoolPref('extensions.zotero.zotero-tts.local.enabled'),
    label: localButton.getAttribute('label'),
    result: doc.getElementById('ztts-test-result-local')?.textContent || '',
  };
  if (!enableResult.enabled) throw new Error('configured Kokoro could not be enabled: ' + JSON.stringify(enableResult));
  await waitNoListing(doc);

  // Keep the two disposable sessions on independent choices. The owner's
  // setting is restored after the fixtures close; doing this before opening
  // them avoids memory-sync spreading B's Fish choice back onto A.
  const sameVoiceKey = 'extensions.zotero.zotero-tts.readAloud.sameForAllDocuments';
  const sameVoiceBefore = Services.prefs.getBoolPref(sameVoiceKey);
  state.sameVoiceBefore = sameVoiceBefore;
  if (sameVoiceBefore) Services.prefs.setBoolPref(sameVoiceKey, false);

  const stamp = Date.now();
  const specs = [
    { kind: 'pdf', file: path('fixture-a.pdf'), title: `Zotero-TTS #121 PDF ${stamp}` },
    { kind: 'epub', file: path('return-key', 'return-key.epub'), title: `Zotero-TTS #121 EPUB ${stamp}` },
  ];
  const fixtures = [];
  for (const spec of specs) {
    const imported = await Zotero.Attachments.importFromFile({ file: spec.file, libraryID: Zotero.Libraries.userLibraryID, title: spec.title });
    const item = typeof imported === 'number' ? Zotero.Items.get(imported) : imported;
    if (!item?.id) throw new Error('fixture import returned no item for ' + spec.kind);
    fixtures.push({ kind: spec.kind, itemID: item.id, key: item.key, title: spec.title, fileChars: String(spec.file).length });
  }
  state.fixtures = fixtures;

  // Use a listed local voice for the fixtures. Kokoro's configured default is
  // af_bella; the reader list confirms the encoded id before it is remembered.
  let localVoice = null;
  const listRows = doc.querySelectorAll('#ztts-voices-list [data-voice-id], #ztts-voices-list [data-id]');
  for (const row of listRows) {
    const encoded = row.getAttribute('data-voice-id') || row.getAttribute('data-id') || '';
    if (/^local::/.test(encoded)) { localVoice = encoded; break; }
  }
  if (!localVoice) localVoice = 'local::af_bella';
  const memoryKey = 'extensions.zotero.zotero-tts.readAloud.memory';
  let memory = {};
  try { memory = JSON.parse(Services.prefs.getStringPref(memoryKey)); } catch {}
  memory.voice = { id: localVoice, lang: 'en' };
  Services.prefs.setStringPref(memoryKey, JSON.stringify(memory));
  state.fixtureVoice = localVoice;

  const openPaused = async fixture => {
    let reader = findReader(fixture.itemID);
    if (!reader) Zotero.Reader.open(fixture.itemID);
    const t0 = Date.now();
    while (Date.now() - t0 < 24000) {
      reader = findReader(fixture.itemID);
      if (reader?._internalReader?._readAloudManager) break;
      await sleep(150);
    }
    if (!reader?._internalReader?._readAloudManager) throw new Error('reader manager not ready for ' + fixture.kind);
    const main = Zotero.getMainWindow?.();
    try { main?.Zotero_Tabs?.select(reader.tabID); reader.focus?.(); reader._iframeWindow?.focus?.(); } catch {}
    const ir = reader._internalReader, manager = ir._readAloudManager;
    try { ir.toggleReadAloudPopup(true); } catch (e) { throw new Error('popup open failed for ' + fixture.kind + ': ' + String(e)); }
    const t1 = Date.now();
    while (Date.now() - t1 < 30000) {
      if (manager.active && !manager.paused) { try { manager.pause(); } catch {} }
      if (manager.active && manager._allVoices?.length && manager._controller) break;
      await sleep(100);
    }
    if (manager.selectedVoiceID !== localVoice) {
      try { manager.selectTier('kokoro'); manager.selectVoice(localVoice); } catch (e) { throw new Error('could not select Kokoro voice for ' + fixture.kind + ': ' + String(e)); }
      const t2 = Date.now();
      while (Date.now() - t2 < 15000) {
        if (manager.active && !manager.paused) { try { manager.pause(); } catch {} }
        if (manager.active && manager.paused && manager.selectedVoiceID === localVoice) break;
        await sleep(100);
      }
    }
    if (!manager.active || !manager.paused) throw new Error('fixture did not reach paused active state: ' + fixture.kind);
    return { itemID: fixture.itemID, tabID: reader.tabID, title: titleOf(fixture.itemID), reader, manager, internal: ir,
      popupOpen: !!ir._state?.readAloudState?.popupOpen, selectedVoice: manager.selectedVoiceID || null,
      controller: manager._controller, catalog: manager._allVoices, position: manager._controller?._position ?? null,
      voices: manager._allVoices?.length ?? 0 };
  };
  const opened = [];
  for (const fixture of fixtures) opened.push(await openPaused(fixture));
  state.opened = opened;
  // Native memory resolution may retain another listed Kokoro voice even
  // after the staged choice; use the actual selected id as the reusable
  // starting voice for the guard scripts.
  if (opened[0]?.selectedVoice) state.fixtureVoice = opened[0].selectedVoice;
  const selected = opened.map(x => x.selectedVoice);
  const localSelected = selected.every(id => typeof id === 'string' && id.startsWith('local::'));
  if (!localSelected) throw new Error('fixture did not select local voices: ' + JSON.stringify(selected));
  try { pane.minimize?.(); } catch {}
  const lists = JSON.parse(await Zotero.ZoteroTTS.diagnostics.liveVoiceList());
  return JSON.stringify({ status: 'PASS', before, enableResult, fixtures: opened.map(x => ({ kind: fixtures.find(f => f.itemID === x.itemID)?.kind, itemID: x.itemID, tabID: x.tabID, title: x.title, active: !!x.manager.active, paused: !!x.manager.paused, popupOpen: x.popupOpen, selectedVoice: x.selectedVoice, voices: x.voices, position: x.position })), fixtureVoice: localVoice, liveVoiceList: lists }, null, 1);
})()
