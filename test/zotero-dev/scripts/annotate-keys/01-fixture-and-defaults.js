// Item 1 (defaults) plus setup: mutes before anything can play, reads the
// raw shortcut-key prefs (default-branch, no user value), reads the
// settings pane's Keyboard shortcuts rows, then imports+opens fixture A and
// polls for _internalReader/_readAloudManager (workflow rule 2 ceiling).
// Leaves the reader idle -- no Read Aloud session started yet.
// params: root, fixturesDir, fixtureTitle. state: fixture, helpers,
// volumeSnapshot, positionRowsBefore, annotationIDs, originalSelectedTabID.
return (async () => {
  const run = Zotero.ZoteroTTSRun, p = run.params || {}, state = run.state;
  const out = { step: '01-fixture-and-defaults' };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const waitFor = async (test, ms = 7000, step = 150) => {
    const end = Date.now() + ms;
    while (Date.now() < end) { const v = test(); if (v) return v; await sleep(step); }
    return test();
  };
  try {
    const mainWin = Zotero.getMainWindow();
    state.originalSelectedTabID = mainWin?.Zotero_Tabs?.selectedID ?? null;
    out.originalSelectedTabID = state.originalSelectedTabID;

    // Mute before anything can play (workflow: mute by default).
    const volPref = 'extensions.zotero.zotero-tts.readAloud.volume';
    state.volumeSnapshot = { value: Services.prefs.getIntPref(volPref, 100), hadUserValue: Services.prefs.prefHasUserValue(volPref) };
    Services.prefs.setIntPref(volPref, 0);
    out.volumeMuted = { before: state.volumeSnapshot.value, after: Services.prefs.getIntPref(volPref, 100) };

    // Position-store row count before the fixture is added (counted back out at cleanup).
    const posBefore = JSON.parse(await Zotero.ZoteroTTS.diagnostics.position());
    state.positionRowsBefore = posBefore.database?.rows ?? null;
    out.positionRowsBefore = state.positionRowsBefore;

    // Item 1a: the raw shortcut-key prefs (shipped default-branch values, addon/prefs.js).
    const hPref = 'extensions.zotero.zotero-tts.shortcuts.highlightSentence';
    const uPref = 'extensions.zotero.zotero-tts.shortcuts.underlineSentence';
    out.prefs = {
      highlightSentence: Services.prefs.getStringPref(hPref, '<unset>'),
      underlineSentence: Services.prefs.getStringPref(uPref, '<unset>'),
      highlightHasUserValue: Services.prefs.prefHasUserValue(hPref),
      underlineHasUserValue: Services.prefs.prefHasUserValue(uPref),
    };

    // Item 1b: the settings pane's Keyboard shortcuts rows.
    let prefWin = Services.wm.getMostRecentWindow('zotero:pref');
    if (prefWin) { prefWin.close(); await waitFor(() => !Services.wm.getMostRecentWindow('zotero:pref'), 4000); }
    Zotero.Utilities.Internal.openPreferences('zotero-tts@xujialiu.top');
    prefWin = await waitFor(() => Services.wm.getMostRecentWindow('zotero:pref'), 5000);
    if (!prefWin) throw new Error('settings window did not open');
    // Zotero_Preferences.navigation (a XUL element) is only set once its own
    // init() runs; navigateToPane() before that throws on this.navigation
    // being undefined (2026-09-26). waitForFirstPaneLoad() is the documented
    // wait, bounded here in case it never resolves.
    await Promise.race([
      prefWin.Zotero_Preferences.waitForFirstPaneLoad(),
      sleep(8000),
    ]);
    out.firstPaneLoadSeen = !!prefWin.Zotero_Preferences.navigation;
    await prefWin.Zotero_Preferences.navigateToPane('zotero-tts-pane');
    const doc = await waitFor(() => (prefWin.document.getElementById('ztts-provider-openai-official') ? prefWin.document : null), 5000);
    const pane = { paneReady: !!doc };
    if (doc) {
      await waitFor(() => doc.getElementById('ztts-key-highlightSentence')?.getAttribute('label'), 5000);
      const rowText = sel => { const el = doc.querySelector(sel); return el ? (el.getAttribute('value') ?? el.textContent ?? null) : null; };
      pane.highlightRowLabel = rowText('[data-l10n-id="ztts-key-highlight-sentence"]');
      pane.underlineRowLabel = rowText('[data-l10n-id="ztts-key-underline-sentence"]');
      pane.highlightButtonLabel = doc.getElementById('ztts-key-highlightSentence')?.getAttribute('label') ?? null;
      pane.underlineButtonLabel = doc.getElementById('ztts-key-underlineSentence')?.getAttribute('label') ?? null;
    }
    out.pane = pane;
    prefWin.close();
    await waitFor(() => !Services.wm.getMostRecentWindow('zotero:pref'), 4000);

    // Fixture: import fixture-a.pdf, open, poll ~24s ceiling in ~7s polls.
    const title = String(p.fixtureTitle || ('ztts ' + new Date().toISOString().slice(0, 10) + ' annotate-keys A'));
    const imported = await Zotero.Attachments.importFromFile({ file: PathUtils.join(p.fixturesDir, 'fixture-a.pdf'), libraryID: Zotero.Libraries.userLibraryID, title });
    const item = typeof imported === 'number' ? Zotero.Items.get(imported) : imported;
    if (!item?.id) throw new Error('fixture import returned no item');
    const opened = Zotero.Reader.open(item.id);
    if (opened && typeof opened.then === 'function') await opened;
    let reader = null;
    for (let round = 0; round < 4 && !reader; round++) {
      reader = await waitFor(() => {
        const list = Zotero.Reader._readers || [];
        for (let i = 0; i < list.length; i++) if (list[i]?.itemID === item.id && list[i]._internalReader?._readAloudManager) return list[i];
        return null;
      }, 7000);
    }
    if (!reader) throw new Error('fixture reader did not expose _internalReader/_readAloudManager within the ~24s ceiling');
    if (mainWin?.Zotero_Tabs && reader.tabID) mainWin.Zotero_Tabs.select(reader.tabID);

    state.fixture = { itemID: item.id, key: item.key, tabID: reader.tabID || null, title };
    state.helpers = {
      reader: () => (Zotero.Reader._readers || []).find(r => r.itemID === state.fixture.itemID) || null,
      internal: () => state.helpers.reader()?._internalReader || null,
      manager: () => state.helpers.internal()?._readAloudManager || null,
    };
    state.annotationIDs = [];
    out.fixture = { itemID: item.id, key: item.key, tabID: reader.tabID, title };
    const m = state.helpers.manager();
    out.idleBefore = { active: !!m?.active, paused: m ? !!m.paused : null };
    out.annotationsBefore = item.getAnnotations().length;
    out.ok = true;
  } catch (e) {
    out.error = String(e);
    out.stack = e?.stack ? String(e.stack).split('\n').slice(0, 6).join(' | ') : null;
  }
  if (out.error) throw new Error(out.error + (out.stack ? ' | ' + out.stack : ''));
  return JSON.stringify(out, null, 1);
})();
