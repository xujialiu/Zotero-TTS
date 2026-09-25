// Opens fixture-a.pdf in a tab of its own, selects it, opens its Read Aloud
// player through the native toggle (workflow section 3), and pauses it in
// the SAME script. Confirms the memory-selected voice is one of ours (has
// "::") before opening at all, per the rulebook -- this profile's memory
// already named a listed fish:: voice at 00-baseline.js, so no pref write
// happens here. Keeps this tab open for the whole case (items 1-4 run on
// it without closing or reopening it, until item 4 explicitly does).
// params: root, fixturesDir. state: fixture (itemID/key/tabID), reads baseline.
(async () => {
  const out = { step: 'open-fixture-and-player' };
  const p = Zotero.ZoteroTTSRun.params || {};
  const S = Zotero.ZoteroTTSRun.state;
  const join = (a, b) => String(a).replace(/[\\/]$/, '') + (Zotero.isWin ? '\\' : '/') + String(b).split('/').join(Zotero.isWin ? '\\' : '/');
  const rawDir = p.fixturesDir || join(p.root || '', 'test/fixtures');
  const dir = Zotero.isWin ? String(rawDir).split('/').join('\\') : rawDir;
  const run = String(p.runId || Date.now()).replace(/[^A-Za-z0-9_-]/g, '_');
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const waitFor = async (test, ms = 7000, step = 100) => {
    const end = Date.now() + ms;
    while (Date.now() < end) { const v = test(); if (v) return v; await sleep(step); }
    return test();
  };
  try {
    if (S.baseline.memory && S.baseline.memory.value) {
      const id = JSON.parse(S.baseline.memory.value).voice.id;
      out.memoryVoiceId = id;
      out.memoryIsListed = String(id).includes('::');
      if (!out.memoryIsListed) throw new Error('readAloud.memory does not name a listed (::) voice -- refusing to open (would fall back to a metered Zotero voice)');
    } else throw new Error('state.baseline.memory missing -- 00-baseline.js did not complete');

    const imported = await Zotero.Attachments.importFromFile({ file: join(dir, 'fixture-a.pdf'), libraryID: Zotero.Libraries.userLibraryID, title: 'Zotero-TTS issue-131 fixture ' + run });
    const item = typeof imported === 'number' ? Zotero.Items.get(imported) : imported;
    const fixture = { id: item.id, key: item.key, title: item.getField('title') };
    out.fixture = fixture;

    const opened = Zotero.Reader.open(fixture.id);
    if (opened && typeof opened.then === 'function') await opened;

    // Poll ~24s ceiling in ~7s polls for _internalReader/_readAloudManager (workflow rule 2).
    let reader = null;
    for (let round = 0; round < 4 && !reader; round++) {
      reader = await waitFor(() => {
        const list = Zotero.Reader._readers || [];
        for (let i = 0; i < list.length; i++) {
          const r = list[i];
          if (r?.itemID === fixture.id && r._internalReader?._readAloudManager) return r;
        }
        return null;
      }, 7000);
    }
    if (!reader) throw new Error('fixture reader did not expose _internalReader/_readAloudManager within the ceiling');
    out.tabID = reader.tabID || null;

    const win = Zotero.getMainWindow();
    if (win && win.Zotero_Tabs && reader.tabID && win.Zotero_Tabs.selectedID !== reader.tabID) win.Zotero_Tabs.select(reader.tabID);
    out.selectedAfter = win && win.Zotero_Tabs ? win.Zotero_Tabs.selectedID : null;

    const m = () => reader._internalReader?._readAloudManager;
    out.beforeOpen = { active: !!m()?.active, paused: m() ? !!m().paused : null, popupOpen: !!reader._internalReader?._state?.readAloudState?.popupOpen };

    reader._internalReader.toggleReadAloudPopup(true);
    await waitFor(() => !!m()?.active);
    reader._internalReader.toggleReadAloudPaused();
    await waitFor(() => m()?.paused === true);
    await sleep(200);

    out.afterOpen = { active: !!m()?.active, paused: m() ? !!m().paused : null, popupOpen: !!reader._internalReader?._state?.readAloudState?.popupOpen, selectedVoiceID: m()?.selectedVoiceID ?? null };
    out.selectedVoiceIsListed = String(out.afterOpen.selectedVoiceID || '').includes('::');

    const lvl = JSON.parse(await Zotero.ZoteroTTS.diagnostics.liveVoiceList());
    const readers = Zotero.Reader._readers || [];
    let idx = -1;
    for (let i = 0; i < readers.length; i++) if (readers[i] === reader) { idx = i; break; }
    out.readerIndex = idx;
    out.liveVoiceListEntry = idx >= 0 ? lvl[idx] : null;

    const pp = JSON.parse(await Zotero.ZoteroTTS.diagnostics.pluginPlayer());
    out.pluginPlayerReaderCount = pp?.readers?.length ?? null;

    S.fixture = { id: fixture.id, key: fixture.key, tabID: reader.tabID || null };
  } catch (e) {
    out.error = String(e);
    out.stack = e && e.stack ? String(e.stack).split('\n').slice(0, 4).join(' | ') : null;
  }
  if (out.error) throw new Error(out.error);
  return JSON.stringify(out, null, 1);
})();
