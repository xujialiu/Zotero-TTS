return (async () => {
  const fixturesDir = Zotero.ZoteroTTSRun.params.fixturesDir;
  const file = PathUtils.join(fixturesDir, 'fixture-a.pdf');
  const title = 'Zotero-TTS issue 95 Kokoro beta5 fixture A ' + Date.now();
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  let imported;
  try {
    imported = await Zotero.Attachments.importFromFile({
      file,
      libraryID: Zotero.Libraries.userLibraryID,
      title,
    });
  } catch (e) {
    return JSON.stringify({ status: 'FAIL', stage: 'import', error: String(e), stack: e?.stack ?? null }, null, 1);
  }
  const item = typeof imported === 'number' ? Zotero.Items.get(imported) : imported;
  if (!item?.id) return JSON.stringify({ status: 'FAIL', stage: 'import', error: 'no item returned' }, null, 1);
  const fixture = { itemID: item.id, key: item.key, title, reader: null, popupError: null };
  Zotero.__ztts95Kokoro.fixtureA = fixture;
  try {
    const result = Zotero.Reader.open(item.id, null, { openInBackground: true, allowDuplicate: false });
    if (result && typeof result.then === 'function') Promise.resolve(result).catch(e => { fixture.openError = String(e); });
  } catch (e) { fixture.openError = String(e); }
  for (let i = 0; i < 160; i++) {
    fixture.reader = (Zotero.Reader._readers || []).find(r => r?.itemID === item.id) ?? null;
    if (fixture.reader?._internalReader?._readAloudManager) break;
    await sleep(50);
  }
  const reader = fixture.reader;
  const internal = reader?._internalReader;
  const manager = internal?._readAloudManager;
  if (!reader || !internal || !manager) {
    return JSON.stringify({ status: 'FAIL', stage: 'open', itemID: item.id, key: item.key,
      openError: fixture.openError ?? null, reader: !!reader, manager: !!manager }, null, 1);
  }
  fixture.readerIndexBeforePopup = (Zotero.Reader._readers || []).indexOf(reader);
  // Ensure this isolated fixture opens on a listed Kokoro voice even when an
  // owner's paused reader remembers a different provider voice.
  try { Services.prefs.setStringPref('extensions.zotero.zotero-tts.readAloud.memory', JSON.stringify({ speed: 1, voice: { id: 'local::af_bella', lang: 'en' } })); } catch (e) {}
  try { internal.toggleReadAloudPopup(true); } catch (e) { fixture.popupError = String(e); }
  for (let i = 0; i < 100; i++) {
    if (manager._allVoices?.length && manager._segments?.length) break;
    await sleep(50);
  }
  if (manager.active && !manager.paused) {
    try { manager.pause(); } catch (e) { fixture.pauseError = String(e); }
  }
  const local = [];
  const all = manager._allVoices || [];
  for (let i = 0; i < all.length; i++) {
    const voice = all[i];
    const id = String(voice?.id ?? '');
    if (id.startsWith('local::')) local.push({ id, label: String(voice?.label ?? '') });
  }
  const current = manager._controller;
  const out = {
    status: manager._segments?.length && manager._allVoices?.length ? 'PASS' : 'FAIL',
    itemID: item.id, key: item.key, title, readerIndex: fixture.readerIndexBeforePopup,
    openError: fixture.openError ?? null, popupError: fixture.popupError ?? null,
    pauseError: fixture.pauseError ?? null,
    manager: { active: !!manager.active, paused: !!manager.paused, popupOpen: !!internal?._state?.readAloudState?.popupOpen,
      selectedVoice: manager.selectedVoiceID ?? null, selectedTier: manager._selectedTier ?? null,
      segmentGranularity: manager._segmentGranularity ?? null, segments: manager._segments?.length ?? 0,
      currentPosition: Number.isFinite(current?._position) ? current._position : null,
      currentIndex: Number.isFinite(current?._currentIndex) ? current._currentIndex : null,
      audio: { state: current?._audioContext?.state ?? null, time: current?._audioContext?.currentTime ?? null,
        playing: !!current?._isPlaying, source: !!current?._sourceNode } },
    localVoices: local,
  };
  return JSON.stringify(out, null, 1);
})()
