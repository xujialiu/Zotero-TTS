return (async () => {
  const state = Zotero.__ztts95NativeState;
  const itemID = Zotero.__ztts95Fixture?.itemID;
  const reader = (Zotero.Reader._readers || []).find(r => r?.itemID === itemID);
  const internal = reader?._internalReader;
  const manager = internal?._readAloudManager;
  if (!state?.nativeStub || !reader || !manager) throw new Error('fixture transport or manager is missing');
  const rw = reader._iframeWindow;
  const mw = Components.utils.waiveXrays(manager);
  // Reset only this isolated fixture to segment zero and keep it playing.
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
  let target = null;
  const menu = manager.voicesForLanguage || [];
  for (let i = 0; i < menu.length; i++) if (menu[i]?.id === 'native95-b') { target = menu[i]; break; }
  if (!target) throw new Error('target fixture voice is missing from the filtered menu');
  const targetWaived = Components.utils.waiveXrays(target);
  const targetDescriptor = Object.getOwnPropertyDescriptor(targetWaived, 'getController');
  const targetGetController = targetWaived.getController;
  const node = old._sourceNode;
  const nodeWaived = Components.utils.waiveXrays(node);
  const nodeDescriptor = Object.getOwnPropertyDescriptor(nodeWaived, 'stop');
  const nativeStop = nodeWaived.stop;
  state.calls.length = 0;
  state.stopCalls = [];
  state.preparedPlays = [];
  state.prepared = null;
  state.delayMs = 700;
  targetWaived.getController = function (...args) {
    const prepared = Reflect.apply(targetGetController, this, args);
    state.prepared = prepared;
    const preparedWaived = Components.utils.waiveXrays(prepared);
    const nativePlay = preparedWaived._playAudioBuffer;
    preparedWaived._playAudioBuffer = function (...playArgs) {
      state.preparedPlays.push({ index: prepared._position, offset: playArgs[1] ?? null });
      return Reflect.apply(nativePlay, this, playArgs);
    };
    return prepared;
  };
  nodeWaived.stop = function (when) {
    state.stopCalls.push({ when: Number.isFinite(when) ? when : null, clock: old._audioContext?.currentTime ?? null });
    return Reflect.apply(nativeStop, this, arguments);
  };
  const readerIndex = (Zotero.Reader._readers || []).indexOf(reader);
  const diag = () => {
    const d = JSON.parse(Zotero.ZoteroTTS.diagnostics.voiceSwitch());
    return d.readers?.[readerIndex]?.handoff ?? null;
  };
  const stateOf = () => ({
    active: !!manager.active,
    paused: !!manager.paused,
    selected: manager.selectedVoiceID ?? null,
    position: Number.isFinite(manager._controller?._position) ? manager._controller._position : null,
    currentIndex: Number.isFinite(manager._controller?._currentIndex) ? manager._controller._currentIndex : null,
    progress: manager._controller?._currentPlaybackTime ?? null,
    oldAlive: !old._destroyed,
    controllerIsOld: manager._controller === old,
  });
  const before = stateOf();
  const targetInfo = {
    id: target.id,
    label: target.label,
    granularity: target.segmentGranularity,
    oldText: String(old._segments?.[0]?.text ?? ''),
  };
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
  for (let i = 0; i < 36; i++) {
    trace.push({ ms: i * 100, state: stateOf(), handoff: diag() });
    if (diag()?.stage === 'committed' || diag()?.stage === 'failed' || diag()?.stage === 'cancelled') break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const final = stateOf();
  const last = diag();
  const prepared = state.prepared;
  const preparedTimes = prepared?._segmentTimestamps?.get?.(last?.index ?? -1) ?? null;
  const current = manager._controller;
  const activeSegment = manager.activeSegment;
  const activeTimestamp = manager.activeTimestamp;
  if (manager.active && !manager.paused) { try { manager.pause(); } catch (e) {} }
  state.delayMs = 0;
  if (targetDescriptor) Object.defineProperty(targetWaived, 'getController', targetDescriptor); else delete targetWaived.getController;
  if (nodeDescriptor) Object.defineProperty(nodeWaived, 'stop', nodeDescriptor); else delete nodeWaived.stop;
  return JSON.stringify({
    keyRet,
    readerIndex,
    before,
    target: targetInfo,
    trace,
    final,
    handoff: last,
    oldController: {
      destroyed: !!old._destroyed,
      position: old._position ?? null,
      currentIndex: old._currentIndex ?? null,
      progress: old._currentPlaybackTime ?? null,
      context: old._audioContext?.state ?? null,
    },
    stopCalls: state.stopCalls,
    prepared: {
      captured: !!prepared,
      voice: prepared?._voice?.id ?? null,
      position: prepared?._position ?? null,
      timestampCount: preparedTimes?.length ?? null,
    },
    preparedPlays: state.preparedPlays,
    nativeAfter: {
      voice: current?._voice?.id ?? null,
      position: current?._position ?? null,
      currentIndex: current?._currentIndex ?? null,
      activeSegmentMatches: activeSegment === manager._segments?.[last?.index ?? -1],
      activeSegmentText: activeSegment?.text ?? null,
      activeTimestamp: activeTimestamp ? { start: activeTimestamp.start, end: activeTimestamp.end, charStart: activeTimestamp.charStart, charEnd: activeTimestamp.charEnd } : null,
      sourcePositionPresent: !!manager._segments?.[last?.index ?? -1]?.sourcePosition,
      context: current?._audioContext?.state ?? null,
    },
    calls: state.calls.map(c => ({ kind: c.kind, voiceID: c.voiceID, text: c.text })),
    targetCalls: state.calls.filter(c => c.voiceID === target.id).map(c => ({ kind: c.kind, voiceID: c.voiceID, text: c.text })),
  }, null, 1);
})()
