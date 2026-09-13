return (async () => {
  const state = Zotero.__ztts95NativeState;
  const itemID = Zotero.__ztts95Fixture?.itemID;
  const reader = (Zotero.Reader._readers || []).find(r => r?.itemID === itemID);
  const internal = reader?._internalReader;
  const manager = internal?._readAloudManager;
  if (!state || !reader || !manager) throw new Error('fixture manager is missing');
  const mw = Components.utils.waiveXrays(manager);
  mw._activeSegment = null;
  mw._activeTimestampIndex = null;
  mw._backwardStopIndex = 0;
  mw._paused = false;
  manager._createController();
  for (let i = 0; i < 30 && (!manager.active || !manager._controller?._sourceNode || manager._controller._currentIndex !== 0); i++) {
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  const old = manager._controller;
  if (!old || old._currentIndex !== 0) throw new Error('old fixture controller did not reach segment zero');
  const rw = reader._iframeWindow;
  const readerIndex = (Zotero.Reader._readers || []).indexOf(reader);
  const beforeVoice = manager.selectedVoiceID;
  const targetID = 'native95-d';
  state.calls.length = 0;
  state.noTimestamps = true;
  state.delayMs = 350;
  const diag = () => {
    const d = JSON.parse(Zotero.ZoteroTTS.diagnostics.voiceSwitch());
    return d.readers?.[readerIndex]?.handoff ?? null;
  };
  const read = () => ({
    active: !!manager.active,
    paused: !!manager.paused,
    selected: manager.selectedVoiceID ?? null,
    position: manager._controller?._position ?? null,
    currentIndex: manager._controller?._currentIndex ?? null,
    oldAlive: !old._destroyed,
  });
  const tip = Components.classes['@mozilla.org/text-input-processor;1'].createInstance(Components.interfaces.nsITextInputProcessor);
  const K = rw.KeyboardEvent;
  const ev = (key, code, keyCode, shiftKey = false) => new K('', { key, code, keyCode, bubbles: true, cancelable: true, shiftKey });
  Zotero_Tabs.select(reader.tabID);
  reader.focus?.();
  rw.focus?.();
  tip.beginInputTransactionForTests(rw);
  const keyRet = [
    tip.keydown(ev('Shift', 'ShiftLeft', 16)),
    tip.keydown(ev('.', 'Period', 190, true)),
    tip.keyup(ev('.', 'Period', 190, true)),
    tip.keyup(ev('Shift', 'ShiftLeft', 16)),
  ];
  const trace = [];
  for (let i = 0; i < 45; i++) {
    trace.push({ ms: i * 100, state: read(), handoff: diag() });
    const stage = diag()?.stage;
    if (stage === 'committed' || stage === 'failed' || stage === 'cancelled') break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const last = diag();
  const final = read();
  if (manager.active && !manager.paused) { try { manager.pause(); } catch (e) {} }
  state.delayMs = 0;
  state.noTimestamps = false;
  return JSON.stringify({
    beforeVoice,
    targetID,
    keyRet,
    trace,
    final,
    handoff: last,
    oldController: { destroyed: !!old._destroyed, position: old._position ?? null, currentIndex: old._currentIndex ?? null },
    targetCalls: state.calls.filter(c => c.voiceID === targetID).map(c => ({ kind: c.kind, text: c.text })),
    allCalls: state.calls.map(c => ({ kind: c.kind, voiceID: c.voiceID, text: c.text })),
  }, null, 1);
})()
