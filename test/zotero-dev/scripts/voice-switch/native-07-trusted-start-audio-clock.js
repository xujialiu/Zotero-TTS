return (async () => {
  const state = Zotero.__ztts95NativeState;
  const itemID = Zotero.__ztts95Fixture?.itemID;
  if (!state?.nativeStub || !itemID) throw new Error('fixture transport is missing');
  let current = (Zotero.Reader._readers || []).find(r => r?.itemID === itemID);
  if (current) {
    try { current._internalReader?.toggleReadAloudPopup(false); } catch (e) {}
    try { current.close?.(); } catch (e) {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  Zotero.Reader.open(itemID);
  for (let i = 0; i < 60; i++) {
    current = (Zotero.Reader._readers || []).find(r => r?.itemID === itemID);
    if (current?._internalReader?._readAloudManager) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const reader = current;
  const internal = reader?._internalReader;
  const manager = internal?._readAloudManager;
  if (!reader || !manager) throw new Error('fresh fixture manager is missing');
  state.readerWindow = reader._iframeWindow;
  const options = Components.utils.waiveXrays(manager._options);
  const internalWaived = Components.utils.waiveXrays(internal);
  state.originalRemoteInterface = options.remoteInterface;
  state.originalInternalRemoteInterface = internalWaived._readAloudRemoteInterface;
  const cloned = Components.utils.cloneInto(state.nativeStub, reader._iframeWindow, { cloneFunctions: true });
  options.remoteInterface = cloned;
  internalWaived._readAloudRemoteInterface = cloned;
  const rw = reader._iframeWindow;
  // This is an isolated fixture. Do not let a prior fixture run's saved
  // position start the fresh transport at the end of the document.
  try { internal._state.readAloudState.savedPosition = null; } catch (e) {}
  Zotero_Tabs.select(reader.tabID);
  reader.focus?.();
  rw.focus?.();
  const tip = Components.classes['@mozilla.org/text-input-processor;1'].createInstance(Components.interfaces.nsITextInputProcessor);
  const K = rw.KeyboardEvent;
  const ev = (key, code, keyCode, shiftKey = false) => new K('', { key, code, keyCode, bubbles: true, cancelable: true, shiftKey });
  tip.beginInputTransactionForTests(rw);
  const ret = [
    tip.keydown(ev('Shift', 'ShiftLeft', 16)),
    tip.keydown(ev(' ', 'Space', 32, true)),
  tip.keyup(ev(' ', 'Space', 32, true)),
  tip.keyup(ev('Shift', 'ShiftLeft', 16)),
  ];
  // Zotero restores the fixture's prior saved PDF position during the
  // trusted start. Reposition the isolated session to segment zero before
  // collecting the clock probe.
  for (let i = 0; i < 40 && (!manager.active || !manager._segments?.length); i++) {
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  if (manager.active && manager._segments?.length) {
    try {
      const mw = Components.utils.waiveXrays(manager);
      mw._activeSegment = null;
      mw._activeTimestampIndex = null;
      mw._backwardStopIndex = 0;
      manager._createController();
    } catch (e) {}
  }
  const samples = [];
  for (let i = 0; i < 12; i++) {
    const c = manager._controller;
    samples.push({
      ms: i * 250,
      active: !!manager.active,
      paused: !!manager.paused,
      selectedVoice: manager.selectedVoiceID ?? null,
      position: Number.isFinite(c?._position) ? c._position : null,
      currentIndex: Number.isFinite(c?._currentIndex) ? c._currentIndex : null,
      context: c?._audioContext?.state ?? null,
      audioTime: Number.isFinite(c?._audioContext?.currentTime) ? c._audioContext.currentTime : null,
    });
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  return JSON.stringify({
    ret,
    readerReady: !!manager,
    final: samples[samples.length - 1] ?? null,
    samples,
    calls: state.calls.map(c => ({ kind: c.kind, voiceID: c.voiceID, text: c.text })),
  }, null, 1);
})()
