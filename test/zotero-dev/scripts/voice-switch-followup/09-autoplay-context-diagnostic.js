return (async () => {
  const pluginPrefix = 'extensions.zotero.zotero-tts.';
  const transportKeys = ['readAloud.volume', 'webdav.syncPositions', 'webdav.autoUploadSettings', 'webdav.syncSettings'];
  const restoreEntry = (name, entry) => {
    if (!entry.user) {
      if (Services.prefs.prefHasUserValue(name)) Services.prefs.clearUserPref(name);
      return;
    }
    if (typeof entry.value === 'boolean') Services.prefs.setBoolPref(name, entry.value);
    else if (Number.isInteger(entry.value)) Services.prefs.setIntPref(name, entry.value);
    else if (typeof entry.value === 'string') Services.prefs.setStringPref(name, entry.value);
  };
  const snapshot = {};
  for (const suffix of transportKeys) {
    const name = pluginPrefix + suffix;
    let value = null;
    try {
      const type = Services.prefs.getPrefType(name);
      value = type === Services.prefs.PREF_BOOL ? Services.prefs.getBoolPref(name) : type === Services.prefs.PREF_INT ? Services.prefs.getIntPref(name) : Services.prefs.getStringPref(name);
    } catch (e) {}
    snapshot[suffix] = { value, user: Services.prefs.prefHasUserValue(name) };
  }
  const out = {
    build: { zotero: Zotero.version, platform: Services.appinfo.OS },
    autoplayPrefs: [],
    context: {},
    cleanup: {},
    errors: [],
  };
  const autoplayNames = [
    'media.autoplay.default',
    'media.autoplay.blocking_policy',
    'media.autoplay.block-webaudio',
    'media.autoplay.enabled.user-gestures-needed',
    'media.autoplay.allow-extension-background-pages',
    'media.autoplay.block-event.enabled',
  ];
  for (const name of autoplayNames) {
    const type = Services.prefs.getPrefType(name);
    let value = null;
    if (type === Services.prefs.PREF_BOOL) value = Services.prefs.getBoolPref(name);
    else if (type === Services.prefs.PREF_INT) value = Services.prefs.getIntPref(name);
    out.autoplayPrefs.push({ name, type: type === Services.prefs.PREF_BOOL ? 'bool' : type === Services.prefs.PREF_INT ? 'int' : type === Services.prefs.PREF_STRING ? 'string' : 'none', value, user: Services.prefs.prefHasUserValue(name) });
  }
  let reader = null;
  let itemID = null;
  let item = null;
  let syncContext = null;
  let delayedContext = null;
  let syncListener = null;
  let selectedBefore = null;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const bounded = async (promise, ms) => {
    try { return await Promise.race([Promise.resolve(promise).then(() => 'resolved'), sleep(ms).then(() => 'timeout')]); }
    catch (e) { return 'rejected: ' + String(e); }
  };
  const describeContext = context => context ? { state: context.state, time: context.currentTime, sampleRate: context.sampleRate } : null;
  try {
    // Keep the live user's WebDAV transport quiet while the disposable reader
    // is opened. These exact values and user flags are restored in finally.
    Services.prefs.setBoolPref(pluginPrefix + 'webdav.syncPositions', false);
    Services.prefs.setBoolPref(pluginPrefix + 'webdav.autoUploadSettings', false);
    Services.prefs.setBoolPref(pluginPrefix + 'webdav.syncSettings', false);
    Services.prefs.setIntPref(pluginPrefix + 'readAloud.volume', 0);
    const file = 'C:\\Users\\xujia\\orca\\workspaces\\zotero_plugin_tts\\shortcut_swtich_voice\\test\\fixtures\\fixture-a.pdf';
    const title = 'Zotero-TTS issue 95 autoplay context diagnostic ' + Date.now();
    const imported = await Zotero.Attachments.importFromFile({ file, libraryID: Zotero.Libraries.userLibraryID, title });
    item = typeof imported === 'number' ? Zotero.Items.get(imported) : imported;
    itemID = item?.id ?? null;
    if (!itemID) throw new Error('diagnostic fixture import returned no item');
    const opening = Zotero.Reader.open(itemID, null, { openInBackground: true, allowDuplicate: false });
    Promise.resolve(opening).catch(e => out.errors.push('open: ' + String(e)));
    for (let i = 0; i < 60; i++) {
      reader = (Zotero.Reader._readers || []).find(r => r?.itemID === itemID) ?? null;
      if (reader?._iframeWindow?.document) break;
      await sleep(50);
    }
    if (!reader?._iframeWindow?.document) throw new Error('diagnostic fixture reader did not become ready');
    const rw = reader._iframeWindow;
    const mainWindow = reader._window;
    selectedBefore = mainWindow?.Zotero_Tabs?.selectedID ?? null;
    try { mainWindow?.Zotero_Tabs?.select(reader.tabID); } catch (e) {}
    try { reader.focus?.(); rw.focus?.(); } catch (e) {}

    const sync = { handlerRan: false, createdAt: null, created: false, initial: null, resumeCall: null, resumeSettled: false, resumeResult: null, error: null };
    syncListener = Components.utils.exportFunction(event => {
      if (event?.key !== 'F24') return;
      sync.handlerRan = true;
      sync.createdAt = Date.now();
      try {
        syncContext = new rw.AudioContext();
        sync.created = true;
        sync.initial = describeContext(syncContext);
        const pending = syncContext.resume();
        sync.resumeCall = 'called';
        Promise.resolve(pending).then(() => { sync.resumeSettled = true; sync.resumeResult = 'resolved'; }).catch(e => { sync.resumeSettled = true; sync.resumeResult = 'rejected: ' + String(e); });
      } catch (e) { sync.error = String(e); }
    }, rw.document);
    rw.document.addEventListener('keydown', syncListener, true);
    const input = Components.classes['@mozilla.org/text-input-processor;1'].createInstance(Components.interfaces.nsITextInputProcessor);
    const K = rw.KeyboardEvent;
    const event = new K('', { key: 'F24', code: 'F24', keyCode: 135, bubbles: true, cancelable: true });
    input.beginInputTransactionForTests(rw);
    const keyResult = { keydown: input.keydown(event), keyup: input.keyup(event) };
    if (typeof input.endInputTransaction === 'function') input.endInputTransaction();
    rw.setTimeout(() => {
      try {
        delayedContext = new rw.AudioContext();
        out.context.delayedCreated = true;
        out.context.delayedInitial = describeContext(delayedContext);
        const pending = delayedContext.resume();
        out.context.delayedResumeCall = 'called';
        Promise.resolve(pending).then(() => { out.context.delayedResumeSettled = true; out.context.delayedResumeResult = 'resolved'; }).catch(e => { out.context.delayedResumeSettled = true; out.context.delayedResumeResult = 'rejected: ' + String(e); });
      } catch (e) { out.context.delayedError = String(e); }
    }, 120);
    const samples = [];
    for (let i = 0; i < 18; i++) {
      samples.push({ ms: i * 100, sync: describeContext(syncContext), delayed: describeContext(delayedContext) });
      await sleep(100);
    }
    out.context = {
      keyResult,
      sync,
      syncFinal: describeContext(syncContext),
      delayedCreated: out.context.delayedCreated ?? false,
      delayedInitial: out.context.delayedInitial ?? null,
      delayedResumeCall: out.context.delayedResumeCall ?? null,
      delayedResumeSettled: out.context.delayedResumeSettled ?? false,
      delayedResumeResult: out.context.delayedResumeResult ?? null,
      delayedFinal: describeContext(delayedContext),
      samples: { first: samples[0] ?? null, last: samples.at(-1) ?? null, count: samples.length },
      syncClockAdvanced: Number(samples.at(-1)?.sync?.time) > Number(samples[0]?.sync?.time) + 0.05,
      delayedClockAdvanced: Number(samples.at(-1)?.delayed?.time) > Number(samples[0]?.delayed?.time) + 0.05,
    };
  } catch (e) {
    out.errors.push(String(e));
  } finally {
    try { if (syncListener && reader?._iframeWindow?.document) reader._iframeWindow.document.removeEventListener('keydown', syncListener, true); } catch (e) { out.errors.push('remove listener: ' + String(e)); }
    if (syncContext) out.context.syncClose = await bounded(syncContext.close(), 700);
    if (delayedContext) out.context.delayedClose = await bounded(delayedContext.close(), 700);
    if (reader) {
      try { await Promise.resolve(reader.close?.()); } catch (e) { out.errors.push('reader close: ' + String(e)); }
      for (let i = 0; i < 40; i++) {
        if (!(Zotero.Reader._readers || []).some(r => r?.itemID === itemID)) break;
        await sleep(50);
      }
    }
    if (selectedBefore && mainWindow?.Zotero_Tabs) {
      try { mainWindow.Zotero_Tabs.select(selectedBefore); } catch (e) { out.errors.push('restore tab: ' + String(e)); }
    }
    try {
      if (itemID) {
        const current = Zotero.Items.get(itemID);
        if (current) await current.eraseTx();
      }
    } catch (e) { out.errors.push('erase: ' + String(e)); }
    for (const suffix of transportKeys) restoreEntry(pluginPrefix + suffix, snapshot[suffix]);
    await sleep(250);
    out.cleanup = {
      itemID,
      fixtureReaderRemaining: (Zotero.Reader._readers || []).filter(r => r?.itemID === itemID).length,
      fixtureItemRemaining: !!Zotero.Items.get(itemID),
      selectedTabRestored: !selectedBefore || mainWindow?.Zotero_Tabs?.selectedID === selectedBefore,
      transportRestored: transportKeys.every(suffix => {
        const name = pluginPrefix + suffix;
        let value = null;
        try { const type = Services.prefs.getPrefType(name); value = type === Services.prefs.PREF_BOOL ? Services.prefs.getBoolPref(name) : type === Services.prefs.PREF_INT ? Services.prefs.getIntPref(name) : Services.prefs.getStringPref(name); } catch (e) {}
        return value === snapshot[suffix].value && Services.prefs.prefHasUserValue(name) === snapshot[suffix].user;
      }),
    };
  }
  out.context.cause = out.context.syncClockAdvanced && !out.context.delayedClockAdvanced
    ? 'gesture-sensitive: synchronous context ran, delayed context did not'
    : out.context.syncClockAdvanced && out.context.delayedClockAdvanced
      ? 'both contexts ran: autoplay gesture was not the limiting factor'
      : 'both contexts blocked: this probe cannot distinguish gesture from output/device blocking';
  return JSON.stringify(out, null, 1);
})()
