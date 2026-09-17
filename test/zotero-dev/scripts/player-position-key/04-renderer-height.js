return (async () => {
  const run = Zotero.ZoteroTTSRun, state = run.state, params = run.params || {}, h = state.helpers, slots = state.fixtures;
  if (!h || !slots?.pdf || !slots?.epub) throw new Error('fixture helpers are missing');
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const wait = async (test, ms = 8000) => { const end = Date.now() + ms; while (Date.now() < end) { const value = test(); if (value) return value; await sleep(50); } return test(); };
  const readPref = name => {
    const p = Services.prefs, type = p.getPrefType(name), branch = Components.interfaces.nsIPrefBranch;
    let value = null;
    if (type === branch.PREF_STRING) value = p.getStringPref(name, '');
    else if (type === branch.PREF_INT) value = p.getIntPref(name, 0);
    else if (type === branch.PREF_BOOL) value = p.getBoolPref(name, false);
    return { type, user: p.prefHasUserValue(name), present: type !== branch.PREF_INVALID, value };
  };
  const fullSnapshotNames = [
    'extensions.zotero.zotero-tts.readAloud.volume',
    'extensions.zotero.zotero-tts.readAloud.memory',
    'extensions.zotero.zotero-tts.readAloud.favoriteVoices',
    'extensions.zotero.zotero-tts.readAloud.favoritesOnly',
    'extensions.zotero.zotero-tts.readAloud.usePluginPlayer',
    'extensions.zotero.zotero-tts.readAloud.playerLayout',
    'extensions.zotero.zotero-tts.readAloud.openExpanded',
    'extensions.zotero.zotero-tts.readAloud.globalSpeed',
    'extensions.zotero.zotero-tts.webdav.syncPositions',
    'extensions.zotero.zotero-tts.webdav.autoUploadSettings',
    'extensions.zotero.zotero-tts.webdav.syncSettings',
    'extensions.zotero.reader.readAloudVoices',
  ];
  state.positionShortcut = state.positionShortcut || {};
  const priorSnapshot = state.positionShortcut.fullSnapshot || {}, baselinePrefs = state.baseline?.prefs || {}, fullSnapshot = { ...priorSnapshot };
  // The player-controls fixture setup runs after baseline has muted Zotero.
  // Prefer the pre-mute baseline for every overlapping preference so cleanup
  // cannot mistake the temporary mute for the user's original state.
  for (const name of fullSnapshotNames) fullSnapshot[name] = baselinePrefs[name] || priorSnapshot[name] || readPref(name);
  state.positionShortcut.fullSnapshot = fullSnapshot;
  state.positionShortcut.snapshotSource = 'baseline';
  const ensureMounted = async slot => {
    h.select(slot);
    const frame = h.frame(slot), doc = h.doc(slot), child = h.child(slot);
    if (!frame || !doc || !child) throw new Error('fixture frame is missing for ' + slot.itemID);
    if (frame.hidden) {
      const toggle = doc.getElementById('ztts-player-toggle');
      if (!toggle) throw new Error('plugin player toggle is missing for ' + slot.itemID);
      toggle.click();
    }
    const mounted = await wait(() => frame.hidden === false && h.child(slot)?.document?.querySelector('.player') ? true : null);
    if (!mounted) throw new Error('plugin player did not mount for ' + slot.itemID);
    const active = await wait(() => h.manager(slot)?.active ? true : null, 10000);
    if (!active) throw new Error('Read Aloud manager did not activate for ' + slot.itemID);
    if (!h.manager(slot)?.paused) {
      h.internal(slot)?.toggleReadAloudPaused();
      const paused = await wait(() => h.manager(slot)?.paused ? true : null, 5000);
      if (!paused) throw new Error('fixture manager did not pause for ' + slot.itemID);
    }
    await wait(() => h.frame(slot)?.contentDocument?.querySelector('.player') ? true : null);
    return { frame: h.frame(slot), child: h.child(slot) };
  };
  await ensureMounted(slots.epub);
  const slot = slots.epub, original = h.frame(slot);
  if (!original?.src) throw new Error('selected fixture player frame has no resource URL');
  const hostDoc = h.doc(slot), probe = hostDoc.createElement('iframe');
  probe.id = 'ztts-issue-124-renderer-probe';
  probe.style.cssText = 'position:fixed;left:10px;top:100px;width:300px;height:34px;z-index:20000;border:0';
  probe.src = original.src.replace(/variant=[^&]+/, 'variant=A');
  const trace = [];
  const snapshot = { expanded: true, provider: '', locale: '', voice: '', speed: 1, volume: 0, automatic: true, playing: false, active: false, providers: [], locales: [], voices: [], favorites: [] };
  const rows = [];
  try {
    hostDoc.body.append(probe);
    const ready = await wait(() => Components.utils.waiveXrays(probe.contentWindow)?.zttsSetLayout ? true : null, 5000);
    if (!ready) throw new Error('isolated player-controls renderer did not load');
    const win = Components.utils.waiveXrays(probe.contentWindow), childDoc = probe.contentDocument;
    Components.utils.exportFunction(height => {
      const player = probe.contentDocument?.querySelector('.player'), rect = player?.getBoundingClientRect();
      trace.push({ height, domClass: player?.className || null, domHeight: rect?.height ?? null });
      probe.style.height = height + 'px';
    }, win, { defineAs: 'zttsResizePreview' });
    Reflect.apply(win.zttsUpdate, win, [JSON.stringify(snapshot)]);
    await sleep(80);
    for (const origin of ['A', 'top']) {
      for (let cycle = 1; cycle <= 3; cycle++) {
        Reflect.apply(win.zttsSetLayout, win, [origin]);
        probe.style.height = '34px';
        trace.length = 0;
        Reflect.apply(win.zttsSetLayout, win, ['B']);
        await sleep(100);
        const player = childDoc.querySelector('.player'), frameRect = probe.getBoundingClientRect(), playerRect = player?.getBoundingClientRect();
        const callbacks = trace.slice();
        const stale = callbacks.filter(x => x.height === 34 || String(x.domClass || '').trim() !== 'player layout-B' || x.domHeight !== 202);
        rows.push({ case: origin + ' → B expanded #' + cycle, frameHeight: frameRect.height, contentHeight: playerRect?.height ?? null, callbacks, staleCallbacks: stale.length, verdict: frameRect.height === 202 && playerRect?.height === 202 && stale.length === 0 ? 'PASS' : 'FAIL' });
      }
    }
    Reflect.apply(win.zttsUpdate, win, [JSON.stringify(snapshot)]);
    await sleep(80);
    rows.push({ case: 'unchanged expanded snapshot', frameHeight: probe.getBoundingClientRect().height, contentHeight: childDoc.querySelector('.player')?.getBoundingClientRect().height ?? null, callbacks: trace.slice(), verdict: probe.getBoundingClientRect().height === 202 && childDoc.querySelector('.player')?.getBoundingClientRect().height === 202 ? 'PASS' : 'FAIL' });
    const beforeCollapsed = trace.slice();
    snapshot.expanded = false;
    Reflect.apply(win.zttsSetLayout, win, ['A']);
    probe.style.height = '34px';
    Reflect.apply(win.zttsUpdate, win, [JSON.stringify(snapshot)]);
    trace.length = 0;
    Reflect.apply(win.zttsSetLayout, win, ['B']);
    await sleep(100);
    const collapsedPlayer = childDoc.querySelector('.player'), collapsedFrame = probe.getBoundingClientRect(), collapsedContent = collapsedPlayer?.getBoundingClientRect();
    rows.push({ case: 'collapsed A → B', frameHeight: collapsedFrame.height, contentHeight: collapsedContent?.height ?? null, callbacks: trace.slice(), priorExpandedCallbacks: beforeCollapsed.length, verdict: collapsedFrame.height === 108 && collapsedContent?.height === 108 ? 'PASS' : 'FAIL' });
    const originalFrame = original.getBoundingClientRect(), originalPlayer = original.contentDocument?.querySelector('.player')?.getBoundingClientRect();
    const fixtureUntouched = { frameHeight: originalFrame.height, contentHeight: originalPlayer?.height ?? null, dataLayout: original.getAttribute('data-layout') };
    const failures = rows.filter(row => row.verdict !== 'PASS');
    if (failures.length) throw new Error('isolated renderer geometry failed: ' + JSON.stringify({ failures, rows, fixtureUntouched }));
    state.positionShortcut.renderer = { paramsRootChars: String(params.root || '').length, rows, fixtureUntouched };
    return JSON.stringify({ rows, fixtureUntouched }, null, 1);
  } finally { probe.remove(); }
})()
