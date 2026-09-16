(async () => {
  const run = Zotero.ZoteroTTSRun;
  const state = run.state || (run.state = {});
  const p = run.params || {};
  const pluginPrefix = 'extensions.zotero.zotero-tts.';
  const nativeVoicePref = 'extensions.zotero.reader.readAloudVoices';
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const waitFor = async (test, ms = 10000) => { const end = Date.now() + ms; while (Date.now() < end) { const value = test(); if (value) return value; await sleep(100); } return test(); };
  const join = (a, b) => String(a).replace(/[\\/]$/, '') + (Zotero.isWin ? '\\' : '/') + String(b).split('/').join(Zotero.isWin ? '\\' : '/');
  const readerOf = itemID => { const list = Zotero.Reader?._readers || []; for (let i = 0; i < list.length; i++) if (list[i]?.itemID === itemID) return list[i]; return null; };
  const named = ['readAloud.volume', 'readAloud.memory', 'readAloud.favoriteVoices', 'readAloud.favoritesOnly', 'readAloud.usePluginPlayer', 'readAloud.playerLayout', 'readAloud.autoScrollEnabled', 'readAloud.autoScrollMode', 'readAloud.keepFollowingWhileVisible', 'readAloud.globalSpeed', 'webdav.syncPositions', 'webdav.autoUploadSettings', 'webdav.syncSettings', 'prefetchEnabled', 'cacheAudio'];
  const full = suffix => pluginPrefix + suffix;
  const readNamed = suffix => {
    const name = suffix === 'reader.readAloudVoices' ? nativeVoicePref : full(suffix), type = Services.prefs.getPrefType(name);
    let value = null;
    if (type === Services.prefs.PREF_STRING) value = Services.prefs.getStringPref(name);
    else if (type === Services.prefs.PREF_BOOL) value = Services.prefs.getBoolPref(name);
    else if (type === Services.prefs.PREF_INT) value = Services.prefs.getIntPref(name);
    return { value, user: Services.prefs.prefHasUserValue(name), type };
  };
  const baseline = { prefs: {}, nativeVoices: readNamed('reader.readAloudVoices'), debugStoring: !!Zotero.Debug?.storing, owner: [] };
  for (const suffix of named) baseline.prefs[suffix] = readNamed(suffix);
  const beforeReaders = Zotero.Reader?._readers || [];
  for (let i = 0; i < beforeReaders.length; i++) { const r = beforeReaders[i]; if (!r) continue; const m = r._internalReader?._readAloudManager; baseline.owner.push({ index: i, itemID: r.itemID, active: !!m?.active, paused: !!m?.paused, voice: m?.selectedVoiceID || null }); }
  state.voiceFollowupBaseline = baseline;
  const setNamed = (suffix, snap) => {
    const name = suffix === 'reader.readAloudVoices' ? nativeVoicePref : full(suffix);
    if (snap.type === Services.prefs.PREF_STRING) Services.prefs.setStringPref(name, String(snap.value));
    else if (snap.type === Services.prefs.PREF_BOOL) Services.prefs.setBoolPref(name, !!snap.value);
    else if (snap.type === Services.prefs.PREF_INT) Services.prefs.setIntPref(name, Math.round(Number(snap.value)));
    if (!snap.user && Services.prefs.prefHasUserValue(name)) Services.prefs.clearUserPref(name);
  };
  const errors = [], fixture = { id: null, item: null };
  let reader = null;
  const manager = () => reader?._internalReader?._readAloudManager;
  const frame = () => reader?._iframeWindow?.document?.getElementById('ztts-player-frame');
  const playerButton = () => reader?._iframeWindow?.document?.getElementById('ztts-player-toggle');
  const snapshot = () => { const m = manager(), c = m?._controller; return { active: !!m?.active, paused: !!m?.paused, selected: m?.selectedVoiceID || null, tier: m?.selectedTier || null, lang: m?.lang || null, region: m?.currentVoiceRegion || m?.region || null, speed: Number(m?.speed) || null, position: c?._position ?? null, timestamps: c?._currentTimestamps?.length ?? 0, bufferDuration: Number(c?._currentBuffer?.duration) || null, audio: c?._audioContext ? { state: c._audioContext.state, currentTime: c._audioContext.currentTime } : null }; };
  const pluginDiag = async () => { try { const raw = JSON.parse(await Zotero.ZoteroTTS.diagnostics.pluginPlayer()); let open = null; for (let i = 0; i < (raw.readers || []).length; i++) if (raw.readers[i]?.open) open = raw.readers[i]; return { raw, open: open?.state || null, actionError: open?.actionError || null }; } catch (e) { return { error: String(e) }; } };
  const switchDiag = () => { try { const raw = JSON.parse(Zotero.ZoteroTTS.diagnostics.voiceSwitch()); let index = -1; const list = Zotero.Reader?._readers || []; for (let i = 0; i < list.length; i++) if (list[i]?.itemID === fixture.id) index = i; let row = null; for (let i = 0; i < (raw.readers || []).length; i++) if (raw.readers[i]?.index === index) row = raw.readers[i]; return { mechanism: raw.mechanism, index, row }; } catch (e) { return { error: String(e) }; } };
  const press = (key, code, keyCode, shiftKey = false) => {
    try { const rw = reader._iframeWindow; reader.focus?.(); rw?.focus?.(); const tip = Components.classes['@mozilla.org/text-input-processor;1'].createInstance(Components.interfaces.nsITextInputProcessor); const K = rw.KeyboardEvent; const ev = (k, c, n, s = false) => new K('', { key: k, code: c, keyCode: n, bubbles: true, cancelable: true, shiftKey: s }); tip.beginInputTransactionForTests(rw); const out = { downShift: tip.keydown(ev('Shift', 'ShiftLeft', 16)), down: tip.keydown(ev(key, code, keyCode, shiftKey)), up: tip.keyup(ev(key, code, keyCode, shiftKey)), upShift: tip.keyup(ev('Shift', 'ShiftLeft', 16)) }; if (typeof tip.endInputTransaction === 'function') tip.endInputTransaction(); return out; } catch (e) { return { error: String(e) }; }
  };
  try {
    // Mute and stop WebDAV/backup writes before any fixture action.
    Services.prefs.setIntPref(full('readAloud.volume'), 0);
    Services.prefs.setBoolPref(full('webdav.syncPositions'), false);
    Services.prefs.setBoolPref(full('webdav.autoUploadSettings'), false);
    Services.prefs.setBoolPref(full('webdav.syncSettings'), false);
    Services.prefs.setBoolPref(full('readAloud.usePluginPlayer'), true);
    Services.prefs.setStringPref(full('readAloud.playerLayout'), 'A');
    const rawDir = p.fixturesDir || join(p.root || '', 'test/fixtures');
    const dir = Zotero.isWin ? String(rawDir).split('/').join('\\') : rawDir;
    const imported = await Zotero.Attachments.importFromFile({ file: join(dir, 'fixture-a.pdf'), libraryID: Zotero.Libraries.userLibraryID, title: 'Zotero-TTS voice-switch follow-up ' + String(p.runId || Date.now()) });
    fixture.item = typeof imported === 'number' ? Zotero.Items.get(imported) : imported;
    fixture.id = fixture.item?.id ?? null;
    if (!fixture.id) throw new Error('follow-up fixture import failed');
    const opened = Zotero.Reader.open(fixture.id); if (opened && typeof opened.then === 'function') await opened;
    reader = await waitFor(() => readerOf(fixture.id)?._internalReader?._readAloudManager ? readerOf(fixture.id) : null, 12000);
    if (!reader) throw new Error('follow-up reader did not expose manager');
    const trustedStart = press(' ', 'Space', 32, true); await waitFor(() => !!manager()?.active); await sleep(600);
    const button = playerButton(); if (frame()?.hidden) button?.click(); await waitFor(() => !frame()?.hidden && !!frame()?.contentDocument?.querySelector('.player')); await waitFor(() => !!manager()?.active);
    const initial = snapshot();
    // The player icon is an untrusted activation; a trusted Return key is the documented one-shot output probe.
    if (manager()?.paused) frame()?.contentDocument?.querySelector('.play')?.click();
    await waitFor(() => !!manager()?.active && !manager()?.paused);
    const beforeReturn = snapshot(); const returnKeys = press('Enter', 'Enter', 13, true); await sleep(900); const afterReturn = snapshot();
    const audioProbe = { trustedStart, before: beforeReturn, keys: returnKeys, after: afterReturn, running: afterReturn.audio?.state === 'running' && Number(afterReturn.audio?.currentTime) > Number(beforeReturn.audio?.currentTime) };
    const openBefore = await pluginDiag();
    let target = null; const voices = openBefore.open?.voices || []; for (let i = 0; i < voices.length; i++) if (voices[i].value !== beforeReturn.selected && String(voices[i].value).startsWith('fish::')) { target = voices[i]; break; }
    if (!target) throw new Error('no distinct Fish voice in the player');
    const beforeController = manager()?._controller || null;
    let commandError = null; let actionIssued = false;
    if (audioProbe.running) { try { const child = frame()?.contentWindow ? Components.utils.waiveXrays(frame().contentWindow) : null; if (typeof child?.zttsCommand !== 'function') throw new Error('zttsCommand export missing'); child.zttsCommand('voice', target.value); actionIssued = true; } catch (e) { commandError = String(e); } }
    const deadline = Date.now() + 12000; let selected = snapshot();
    while (actionIssued && Date.now() < deadline) { selected = snapshot(); if (selected.selected === target.value) break; await sleep(100); }
    const after = snapshot(); const memory = readNamed('readAloud.memory'); const nativeVoicesAfter = readNamed('reader.readAloudVoices'); const outcome = { target, actionIssued, commandError, initial, audioProbe, before: { selected: beforeReturn.selected, controller: !!beforeController }, after, selectedTarget: after.selected === target.value, controllerChanged: beforeController !== (manager()?._controller || null), memory, nativeVoicesAfter, plugin: await pluginDiag(), switch: switchDiag() };
    state.voiceFollowup = { fixture, ownerBefore: baseline.owner, outcome };
  } catch (e) { errors.push(String(e)); state.voiceFollowup = { fixture, ownerBefore: baseline.owner, errors }; }
  finally {
    if (fixture.id) {
      try { const r = readerOf(fixture.id); if (r) { const pending = r.close(); if (pending && typeof pending.then === 'function') await pending; } } catch (e) { errors.push('close fixture: ' + String(e)); }
      for (let i = 0; i < 40; i++) { if (!readerOf(fixture.id)) break; await sleep(100); }
      try { const item = Zotero.Items.get(fixture.id); if (item) await item.eraseTx(); } catch (e) { errors.push('erase fixture: ' + String(e)); }
    }
    for (const suffix of named) if (suffix !== 'readAloud.memory') setNamed(suffix, baseline.prefs[suffix]);
    setNamed('reader.readAloudVoices', baseline.nativeVoices);
    setNamed('readAloud.memory', baseline.prefs['readAloud.memory']);
    if (baseline.debugStoring !== undefined && !!Zotero.Debug?.storing !== !!baseline.debugStoring) Zotero.Debug.setStore(!!baseline.debugStoring);
    state.voiceFollowup.cleanup = { errors, fixtureId: fixture.id, ownerAfter: [], prefs: { volume: readNamed('readAloud.volume'), memory: readNamed('readAloud.memory'), readerVoices: readNamed('reader.readAloudVoices'), enabled: readNamed('readAloud.usePluginPlayer'), layout: readNamed('readAloud.playerLayout'), syncPositions: readNamed('webdav.syncPositions'), autoUpload: readNamed('webdav.autoUploadSettings'), syncSettings: readNamed('webdav.syncSettings') } };
    const list = Zotero.Reader?._readers || []; for (let i = 0; i < list.length; i++) { const r = list[i]; if (!r) continue; const m = r._internalReader?._readAloudManager; state.voiceFollowup.cleanup.ownerAfter.push({ itemID: r.itemID, active: !!m?.active, paused: !!m?.paused, voice: m?.selectedVoiceID || null }); }
  }
  return JSON.stringify(state.voiceFollowup, null, 1);
})()
