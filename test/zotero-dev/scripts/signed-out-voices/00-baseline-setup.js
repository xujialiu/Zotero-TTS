// Baseline for issue #130 (signed-out-voices): Zotero/reader state before
// any change, the debug store turned on (restored last, in 06), a
// byte-for-byte snapshot of every pref this case may touch (readAloud
// .volume, readAloud.usePluginPlayer, both Zotero switches and every
// provider's .enabled -- recorded only, never written -- plus
// readAloud.memory, recorded only). Mutes readAloud.volume to 0 for the
// run once the snapshot is safely captured (rulebook: mute by default).
// Imports test/fixtures/fixture-a.pdf as a standalone attachment titled
// "ZTTS signed-out-voices A", opens it with Zotero.Reader.open, polls for
// _internalReader/_readAloudManager, and confirms the plugin's own
// readAloud.memory names a listed (non-metered, "::") voice -- required
// before any popup ever opens (driving notes Sec3) -- WITHOUT opening the
// popup itself: item 1 needs the "before the open" liveVoiceList()/applied
// count, so 00 only opens the reader tab, never the popup.
// params: none (fixturesDir is the runner's own). state: writes baseline
// (snapshot), fixtureItemID, fixtureTitle, fixtureTabID.
(async () => {
  const out = { step: 'baseline-setup' };
  const S = Zotero.ZoteroTTSRun.state;
  const P = Zotero.ZoteroTTSRun.params;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function readPref(fullName) {
    const type = Services.prefs.getPrefType(fullName);
    const hasUserValue = Services.prefs.prefHasUserValue(fullName);
    let value = null;
    try {
      if (type === Services.prefs.PREF_STRING) value = Services.prefs.getStringPref(fullName, '');
      else if (type === Services.prefs.PREF_INT) value = Services.prefs.getIntPref(fullName, 0);
      else if (type === Services.prefs.PREF_BOOL) value = Services.prefs.getBoolPref(fullName, false);
    } catch (e) { value = 'ERR:' + e; }
    return { key: fullName, type, hasUserValue, value };
  }
  function writePref(fullName, type, value) {
    if (type === Services.prefs.PREF_STRING) Services.prefs.setStringPref(fullName, String(value));
    else if (type === Services.prefs.PREF_INT) Services.prefs.setIntPref(fullName, value);
    else if (type === Services.prefs.PREF_BOOL) Services.prefs.setBoolPref(fullName, !!value);
    else throw new Error('cannot write pref of type ' + type + ' at ' + fullName);
  }
  const PROVIDER_IDS = ['openai-official', 'mimo', 'compatible', 'azure', 'cloudflare', 'speechify', 'fish', 'fishspeech', 'local', 'system'];

  try {
    out.zoteroVersion = Zotero.version;
    const readers = Zotero.Reader._readers || [];
    out.readersBefore = readers.map((r) => {
      let title = null;
      try {
        const item = Zotero.Items.get(r.itemID);
        const parent = item && item.parentItem ? item.parentItem : item;
        title = parent ? parent.getField('title') : null;
      } catch (e) { title = 'ERR:' + e; }
      const ir = r._internalReader;
      const m = ir && ir._readAloudManager;
      return { itemID: r.itemID, title, active: !!(m && m.active), paused: m ? !!m.paused : null, loggedIn: ir && ir._state ? ir._state.loggedIn : null };
    });
    out.settingsWindowOpenBefore = !!Services.wm.getMostRecentWindow('zotero:pref');
    try {
      const errs = Zotero.getErrors(true) || [];
      out.errorsBefore = { count: errs.length, lastTwo: errs.slice(-2).map(String) };
    } catch (e) { out.errorsBeforeError = String(e); }
    out.debugStoringBefore = Zotero.Debug.storing;
    S.debugStoringBefore = out.debugStoringBefore;
    Zotero.Debug.setStore(true);
    out.debugStoringNow = Zotero.Debug.storing;

    const baseline = {
      volume: readPref('extensions.zotero.zotero-tts.readAloud.volume'),
      usePluginPlayer: readPref('extensions.zotero.zotero-tts.readAloud.usePluginPlayer'),
      zoteroStandardEnabled: readPref('extensions.zotero.zotero-tts.zotero-standard.enabled'),
      zoteroPremiumEnabled: readPref('extensions.zotero.zotero-tts.zotero-premium.enabled'),
      readAloudMemory: readPref('extensions.zotero.zotero-tts.readAloud.memory'),
      providers: {},
    };
    for (const id of PROVIDER_IDS) baseline.providers[id] = readPref('extensions.zotero.zotero-tts.' + id + '.enabled');
    out.baseline = baseline;
    S.baseline = baseline; // items 4-6 restore usePluginPlayer/volume/memory from this -- missing on the first run of this kit (found live, see this README's Limits)
    out.enabledProvidersBefore = PROVIDER_IDS.filter((id) => baseline.providers[id].value === true);
    out.zoteroSwitchesBothOnBefore = baseline.zoteroStandardEnabled.value === true && baseline.zoteroPremiumEnabled.value === true;

    // Apply the run's own state now that the snapshot is safely captured.
    writePref(baseline.volume.key, baseline.volume.type, 0);
    out.appliedVolume = readPref(baseline.volume.key).value;

    // --- Import and open the fixture tab (never its popup). ---
    const fixtureTitle = 'ZTTS signed-out-voices A';
    const file = PathUtils.join(P.fixturesDir, 'fixture-a.pdf');
    const item = await Zotero.Attachments.importFromFile({ file, libraryID: Zotero.Libraries.userLibraryID, title: fixtureTitle });
    const itemID = item.id;
    S.fixtureItemID = itemID;
    S.fixtureTitle = fixtureTitle;
    out.fixtureItemID = itemID;
    out.fixtureTitle = fixtureTitle;

    await Zotero.Reader.open(itemID);
    let r = null;
    const t0 = Date.now();
    while (Date.now() - t0 < 60000) {
      r = null;
      const rs = Zotero.Reader._readers || [];
      for (let i = 0; i < rs.length; i++) if (rs[i].itemID === itemID) r = rs[i];
      if (r && r._internalReader && r._internalReader._readAloudManager) break;
      await sleep(300);
    }
    if (!r) throw new Error('fixture reader never appeared for item ' + itemID);
    S.fixtureTabID = r.tabID;
    out.fixtureTabID = r.tabID;
    out.fixtureOpenedMs = Date.now() - t0;

    // --- Confirm the memory voice is one of ours (has "::"), before any popup ever opens. ---
    let memoryVoiceID = null;
    try {
      const parsed = JSON.parse(baseline.readAloudMemory.value || '{}');
      memoryVoiceID = parsed && parsed.voice && parsed.voice.id ? String(parsed.voice.id) : null;
    } catch (e) { out.memoryParseError = String(e); }
    out.memoryVoiceID = memoryVoiceID;
    out.memoryVoiceIsOurs = memoryVoiceID ? memoryVoiceID.includes('::') : null;
    if (!memoryVoiceID || !memoryVoiceID.includes('::')) {
      throw new Error('readAloud.memory does not name one of the plugin\'s own voices (id lacks "::"): ' + memoryVoiceID + ' -- refusing to open a popup that would play a metered Zotero voice');
    }

    // --- liveVoiceList() / pluginPlayer() before any popup: for items 1-2's "before the open" baseline. ---
    const lvlBefore = JSON.parse(Zotero.ZoteroTTS.diagnostics.liveVoiceList ? await Zotero.ZoteroTTS.diagnostics.liveVoiceList() : '[]');
    out.liveVoiceListEntriesBefore = lvlBefore.length;
    const ppBefore = JSON.parse(await Zotero.ZoteroTTS.diagnostics.pluginPlayer());
    out.pluginPlayerReadersBefore = ppBefore.readers.map((x) => ({ open: x.open }));
    S.pluginPlayerReadersBeforeCount = ppBefore.readers.length;
  } catch (e) {
    out.error = String(e);
    out.stack = e && e.stack ? String(e.stack).split('\n').slice(0, 4).join(' | ') : null;
  }
  if (out.error) throw new Error(out.error);
  return JSON.stringify(out, null, 1);
})();
