// Baseline (issues #135, #137): startup identity already checked by the
// caller; here the named prefs this kit may touch (value + user-value
// flag), the position-row count, the owner's reader tabs (left alone),
// mute, and a deterministic starting layout ('top', the default). Window
// state briefly minimized for this bridge-only step, then restored and
// focused for the geometry work every later script needs.
(async () => {
  const PREFIX = 'zotero-tts.';
  const FULL = (k) => 'extensions.zotero.' + PREFIX + k;
  const get = (k) => Zotero.Prefs.get(PREFIX + k);
  const hasUser = (k) => { try { return Services.prefs.prefHasUserValue(FULL(k)); } catch (e) { return null; } };
  const snap = (k) => ({ value: get(k), hasUser: hasUser(k) });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const startup = JSON.parse(Zotero.ZoteroTTS.diagnostics.startup());

  const host = Zotero.getMainWindow();
  const windowBaseline = { windowState: host.windowState, sizeMode: host.document?.documentElement?.getAttribute('sizemode'), outerWidth: host.outerWidth, outerHeight: host.outerHeight, screenX: host.screenX, screenY: host.screenY };
  const selectedTabBaseline = host.Zotero_Tabs ? host.Zotero_Tabs.selectedID : null;

  const readers = (Zotero.Reader._readers || []).map((r) => {
    let title = null;
    try { const it = Zotero.Items.get(r.itemID); title = (it.parentItem || it).getField('title'); } catch (e) {}
    return { itemID: r.itemID, title, active: !!r._internalReader?._readAloudManager?.active, paused: !!r._internalReader?._readAloudManager?.paused };
  });

  const posBefore = JSON.parse(await Zotero.ZoteroTTS.diagnostics.position());

  // Bridge-only step: minimize while reading prefs/position rows.
  const wasMinimized = host.windowState === 2;
  if (!wasMinimized) { try { host.minimize(); } catch (e) {} await sleep(200); }
  const minimizedNow = host.windowState === 2;

  const baseline = {
    'readAloud.volume': snap('readAloud.volume'),
    'readAloud.playerLayout': snap('readAloud.playerLayout'),
    'readAloud.usePluginPlayer': snap('readAloud.usePluginPlayer'),
    'readAloud.autoScrollMode': snap('readAloud.autoScrollMode'),
    'readAloud.keepFollowingWhileVisible': snap('readAloud.keepFollowingWhileVisible'),
  };
  const memoryRaw = get('readAloud.memory');
  baseline['readAloud.memory'] = { hasUser: hasUser('readAloud.memory'), len: typeof memoryRaw === 'string' ? memoryRaw.length : memoryRaw };

  // Mute, force a deterministic starting layout ('top', already the default
  // here unless the owner set otherwise), and override the stale
  // local::af_fake memory (issue #133's second run, local provider off)
  // with a listed Fish voice before any player opens -- all restored in
  // cleanup, memory last.
  Zotero.Prefs.set(PREFIX + 'readAloud.volume', 0);
  Zotero.Prefs.set(PREFIX + 'readAloud.playerLayout', 'top');
  const overrideVoiceID = 'fish::en/933563129e564b19a115bedd57b7406a';
  Zotero.Prefs.set(PREFIX + 'readAloud.memory', JSON.stringify({ speed: 1, voice: { id: overrideVoiceID, lang: 'en' } }));

  // Restore and focus the window: everything from here on measures geometry.
  // `.restore()` left a maximized window at a DIFFERENT, smaller size here
  // (1406x909 vs the baseline's 1458x949) -- `.maximize()` is what actually
  // reproduces the original bounds when windowState was 1 (2026-09-24).
  if (!wasMinimized) {
    try { if (windowBaseline.windowState === 1) host.maximize(); else if (windowBaseline.windowState === 4) host.fullScreen = true; else host.restore(); } catch (e) {}
    await sleep(250);
    try { host.focus(); } catch (e) {}
    await sleep(150);
  }

  Zotero.ZoteroTTSRun.state.baseline = baseline;
  Zotero.ZoteroTTSRun.state.readAloudMemoryFullValue = memoryRaw;
  Zotero.ZoteroTTSRun.state.windowBaseline = windowBaseline;
  Zotero.ZoteroTTSRun.state.selectedTabBaseline = selectedTabBaseline;
  Zotero.ZoteroTTSRun.state.posBeforeRows = posBefore && posBefore.database ? posBefore.database.rows : null;
  Zotero.ZoteroTTSRun.state.overrideVoiceID = overrideVoiceID;

  return JSON.stringify({
    version: startup.version,
    failed: startup.failed,
    zoteroVersion: Zotero.version,
    windowBaseline,
    selectedTabBaseline,
    settingsWindowOpen: !!Services.wm.getMostRecentWindow('zotero:pref'),
    readers,
    minimizedDuringSnapshot: minimizedNow,
    restoredAfter: host.windowState,
    baseline,
    volumeNow: get('readAloud.volume'),
    layoutNow: get('readAloud.playerLayout'),
    overrideVoiceID,
    posBeforeRows: Zotero.ZoteroTTSRun.state.posBeforeRows,
  }, null, 1);
})();
