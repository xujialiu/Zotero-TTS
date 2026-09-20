// secret-fields teardown: closes the settings window, confirms every
// provider's .enabled pref still matches 00-baseline.js's snapshot (never
// a value -- only booleans), restores the debug store to what it was
// before this run, and reports the reader sessions unchanged. Leaves the
// host minimized either way (the workflow's own exception), whatever its
// state was at the start of this run.
// params: none. state: reads state.baseline from 00-baseline.js.
(async () => {
  const run = Zotero.ZoteroTTSRun;
  const baseline = run.state.baseline;
  if (!baseline) throw new Error('no baseline in state -- run 00-baseline.js first');

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const win = Services.wm.getMostRecentWindow('zotero:pref');
  if (win) {
    win.close();
    const t0 = Date.now();
    while (Services.wm.getMostRecentWindow('zotero:pref') && Date.now() - t0 < 10000) await sleep(200);
  }

  const p = Services.prefs;
  const prefix = 'extensions.zotero.zotero-tts.';
  const ids = ['openai-official', 'mimo', 'compatible', 'azure', 'cloudflare', 'speechify', 'fish', 'fishspeech', 'local', 'system'];
  const enabledNow = {};
  const mismatches = [];
  for (const id of ids) {
    enabledNow[id] = p.getBoolPref(prefix + id + '.enabled', false);
    if (enabledNow[id] !== baseline.enabled[id]) mismatches.push({ id, was: baseline.enabled[id], now: enabledNow[id] });
  }
  for (const { id, was } of mismatches) p.setBoolPref(prefix + id + '.enabled', was);

  if (!baseline.debugStoring) {
    try {
      Zotero.Debug.setStore(false);
    } catch {
      // Reported, not fatal
    }
  }

  const readersNow = (Zotero.Reader._readers || []).map((r) => {
    const m = r?._internalReader?._readAloudManager;
    return { itemID: r.itemID, tabID: r.tabID, active: !!m?.active, paused: !!m?.paused, voice: m?.selectedVoiceID || null };
  });

  const host = Services.wm.getMostRecentWindow('navigator:browser');
  if (host && host.windowState !== 2) {
    try {
      host.minimize();
    } catch {
      // Reported via hostFinal below
    }
  }

  return JSON.stringify(
    {
      settingsWindowClosed: !Services.wm.getMostRecentWindow('zotero:pref'),
      enabledBefore: baseline.enabled,
      enabledNow,
      mismatchesFoundAndFixed: mismatches,
      debugStoringRestoredTo: baseline.debugStoring,
      readersBefore: baseline.readers,
      readersNow,
      // baseline.readers carries a title readersNow does not bother resolving again; compare the fields both share
      readersUnchanged:
        JSON.stringify(baseline.readers.map(({ itemID, tabID, active, paused, voice }) => ({ itemID, tabID, active, paused, voice }))) ===
        JSON.stringify(readersNow),
      hostFinalWindowState: host ? host.windowState : null,
      hostMinimized: host ? host.windowState === 2 : null,
    },
    null,
    1,
  );
})();
