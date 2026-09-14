return (async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const h = state.helpers;
  const fixtures = state.fixtures || {};
  if (!h) return JSON.stringify({ error: 'helpers missing' });
  if (!state.safeToOpen) return JSON.stringify({ skipped: true, reason: 'readAloud.memory did not name a plugin voice' });
  const out = [];
  for (const kind of ['pdf', 'epubScrolled', 'epubPaginated']) {
    const slot = fixtures[kind];
    const reader = h.select(slot);
    const internal = h.internal(slot);
    const manager = h.manager(slot);
    if (!reader || !internal || !manager) { out.push({ kind, error: 'reader, internal reader or manager missing' }); continue; }
    let popupError = null, pauseError = null;
    try { internal.toggleReadAloudPopup(true); } catch (e) { popupError = String(e); }
    for (let i = 0; i < 220; i++) {
      if (manager._allVoices?.length && manager._segments?.length && manager._controller) break;
      await h.sleep(50);
    }
    try { if (manager.active && !manager.paused) manager.pause(); } catch (e) { pauseError = String(e); }
    await h.sleep(250);
    out.push({ kind, tabID: reader.tabID, popupOpen: !!internal._state?.readAloudState?.popupOpen,
      active: !!manager.active, paused: !!manager.paused, position: Number.isFinite(manager._controller?._position) ? manager._controller._position : null,
      segments: manager._segments?.length || 0, voices: manager._allVoices?.length || 0, selectedVoice: manager.selectedVoiceID || null,
      tier: manager._selectedTier || null, popupError, pauseError, snapshot: h.snap(slot, 'opened-paused') });
  }
  return JSON.stringify({ memoryVoice: state.prepare?.memoryVoice || null, out });
})()
