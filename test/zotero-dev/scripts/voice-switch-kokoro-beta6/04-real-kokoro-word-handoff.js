return (async () => {
  const root = Zotero.__ztts95Kokoro;
  const fixture = root?.fixtureA;
  const reader = fixture?.reader;
  const internal = reader?._internalReader;
  const manager = internal?._readAloudManager;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const now = () => Date.now();
  const copyTimes = list => {
    const out = [];
    for (let i = 0; i < (list?.length ?? 0); i++) {
      const t = list[i];
      if (!t) continue;
      out.push({ start: Number(t.start), end: Number(t.end), charStart: Number(t.charStart), charEnd: Number(t.charEnd) });
    }
    return out;
  };
  const state = () => {
    const c = manager?._controller;
    const segment = Number.isFinite(c?._position) ? manager?._segments?.[c._position] : null;
    const context = c?._audioContext;
    return {
      active: !!manager?.active, paused: !!manager?.paused, selected: manager?.selectedVoiceID ?? null,
      position: Number.isFinite(c?._position) ? c._position : null,
      currentIndex: Number.isFinite(c?._currentIndex) ? c._currentIndex : null,
      progress: Number.isFinite(c?._currentPlaybackTime) ? c._currentPlaybackTime : null,
      segmentChars: segment ? String(segment.text ?? '').length : null,
      sourcePosition: segment?.sourcePosition ? { pageIndex: segment.sourcePosition.pageIndex ?? null, rects: segment.sourcePosition.rects?.length ?? null } : null,
      controller: !!c, destroyed: !!c?._destroyed, source: !!c?._sourceNode, playing: !!c?._isPlaying,
      audio: { state: context?.state ?? null, time: Number.isFinite(context?.currentTime) ? context.currentTime : null,
        duration: Number.isFinite(c?._currentBuffer?.duration) ? c._currentBuffer.duration : null },
    };
  };
  const diagnostic = () => {
    try {
      const all = JSON.parse(Zotero.ZoteroTTS.diagnostics.voiceSwitch());
      const index = (Zotero.Reader._readers || []).indexOf(reader);
      return { all, fixture: all.readers?.[index] ?? null };
    } catch (e) { return { error: String(e), all: null, fixture: null }; }
  };
  const press = (key, code, keyCode) => {
    const rw = reader?._iframeWindow;
    const tip = Components.classes['@mozilla.org/text-input-processor;1'].createInstance(Components.interfaces.nsITextInputProcessor);
    const K = rw.KeyboardEvent;
    const ev = (value, valueCode, valueKeyCode) => new K('', { key: value, code: valueCode, keyCode: valueKeyCode, bubbles: true, cancelable: true });
    tip.beginInputTransactionForTests(rw);
    const ret = [tip.keydown(ev('Shift', 'ShiftLeft', 16)), tip.keydown(ev(key, code, keyCode)),
      tip.keyup(ev(key, code, keyCode)), tip.keyup(ev('Shift', 'ShiftLeft', 16))];
    if (typeof tip.endInputTransaction === 'function') tip.endInputTransaction();
    return ret;
  };
  const menu = [];
  const menuSource = manager?.voicesForLanguage || [];
  for (let i = 0; i < menuSource.length; i++) {
    const voice = menuSource[i];
    if (voice?.id) menu.push({ voice, id: String(voice.id), label: String(voice.label ?? ''), credits: voice.creditsPerMinute ?? null });
  }
  menu.sort((a, b) => (a.credits ?? -1) - (b.credits ?? -1));
  const selectedBefore = String(manager?.selectedVoiceID ?? '');
  const oldIndex = menu.findIndex(row => row.id === selectedBefore);
  const targetRow = oldIndex >= 0 && menu.length > 1 ? menu[(oldIndex + 1) % menu.length] : null;
  const out = {
    status: 'FAIL', direction: 'next', readerIndex: (Zotero.Reader._readers || []).indexOf(reader),
    selectedBefore, target: targetRow ? { id: targetRow.id, label: targetRow.label } : null,
    menuCount: menu.length, steps: [], traces: [], errors: [],
  };
  if (!reader || !manager || !targetRow || !targetRow.id.startsWith('local::')) {
    out.errors.push('fixture manager or two filtered local voices are missing');
    return JSON.stringify(out, null, 1);
  }

  // Choose a long sentence while paused; this leaves enough real Kokoro time
  // for the delayed target response to arrive during the same old segment.
  const lengths = [];
  for (let i = 0; i < (manager._segments || []).length; i++) lengths.push({ index: i, chars: String(manager._segments[i]?.text ?? '').length });
  lengths.sort((a, b) => b.chars - a.chars || a.index - b.index);
  const segmentIndex = lengths[0]?.index ?? 0;
  out.segment = { index: segmentIndex, chars: lengths[0]?.chars ?? null, granularity: manager._segmentGranularity ?? null };
  try { manager.repositionTo(segmentIndex); } catch (e) { out.errors.push('reposition: ' + String(e)); }
  // repositionTo may immediately resume an open popup; stop the fixture
  // before the trusted start so the following key is unambiguously a start.
  if (manager.active && !manager.paused) { try { manager.pause(); } catch (e) { out.errors.push('pause after reposition: ' + String(e)); } }
  await sleep(120);

  // Start only the fixture with a trusted key, then wait for a running native
  // clock and source before arming the voice switch.
  try { Zotero_Tabs.select(reader.tabID); reader.focus?.(); reader._iframeWindow?.focus?.(); } catch (e) { out.errors.push('focus: ' + String(e)); }
  let startKeys = null;
  try { startKeys = press(' ', 'Space', 32); } catch (e) { out.errors.push('start key: ' + String(e)); }
  let startAt = now(), triggerState = null;
  for (let i = 0; i < 100; i++) {
    const s = state();
    if (s.active && !s.paused && s.source && s.playing && s.audio.state === 'running' && s.position === segmentIndex) {
      triggerState = s; break;
    }
    await sleep(20);
  }
  out.steps.push({ action: 'trusted-start', key: startKeys, state: triggerState ?? state(), elapsedMs: now() - startAt });
  if (!triggerState) {
    out.status = 'NOT TESTABLE'; out.errors.push('old fixture source never reached a running audio clock at the selected segment');
    if (manager.active && !manager.paused) { try { manager.pause(); } catch (e) {} }
    return JSON.stringify(out, null, 1);
  }

  const old = manager._controller;
  const oldWaived = Components.utils.waiveXrays(old);
  const oldNode = oldWaived?._sourceNode;
  const oldNodeWaived = Components.utils.waiveXrays(oldNode);
  const oldContext = oldWaived?._audioContext;
  const oldTimes = copyTimes(oldWaived?._currentTimestamps);
  const oldDuration = Number(oldWaived?._currentBuffer?.duration);
  const oldPosition = Number(oldWaived?._position);
  const oldSegment = manager._segments?.[oldPosition];
  const instrumentation = {
    triggerAt: null, targetControllerAt: null, targetRequests: [], targetReadyAt: null,
    prepared: null, preparedPlays: [], targetTimes: [], targetDuration: null,
    stopCalls: [], patchErrors: [], commitAt: null,
  };
  const methodRestores = [];
  const restoreOwn = (object, name, descriptor) => {
    try {
      if (descriptor) Object.defineProperty(object, name, descriptor);
      else delete object[name];
    } catch (e) { instrumentation.patchErrors.push('restore ' + name + ': ' + String(e)); }
  };
  const instrumentPrepared = prepared => {
    instrumentation.prepared = prepared;
    const c = Components.utils.waiveXrays(prepared);
    try {
      instrumentation.targetRequests.push({ index: oldPosition, requestedAt: instrumentation.targetControllerAt ?? now() });
    } catch (e) { instrumentation.patchErrors.push('prepared readiness probe: ' + String(e)); }
    try {
      const original = c._playAudioBuffer;
      const descriptor = Object.getOwnPropertyDescriptor(c, '_playAudioBuffer');
      c._playAudioBuffer = function (...args) {
        instrumentation.preparedPlays.push({ at: now(), index: Number(c._position), offset: Number(args[1]), speed: Number(args[2]) });
        return Reflect.apply(original, this, args);
      };
      methodRestores.push(() => restoreOwn(c, '_playAudioBuffer', descriptor));
    } catch (e) { instrumentation.patchErrors.push('prepared playAudioBuffer: ' + String(e)); }
  };
  try {
    const target = Components.utils.waiveXrays(targetRow.voice);
    const original = target.getController;
    const descriptor = Object.getOwnPropertyDescriptor(target, 'getController');
    target.getController = function (...args) {
      instrumentation.targetControllerAt = now();
      const prepared = Reflect.apply(original, this, args);
      instrumentPrepared(prepared);
      return prepared;
    };
    methodRestores.push(() => restoreOwn(target, 'getController', descriptor));
  } catch (e) { instrumentation.patchErrors.push('target getController: ' + String(e)); }
  try {
    const original = oldNodeWaived.stop;
    const descriptor = Object.getOwnPropertyDescriptor(oldNodeWaived, 'stop');
    oldNodeWaived.stop = function (...args) {
      instrumentation.stopCalls.push({ at: now(), when: Number(args[0]), contextTime: Number(oldContext?.currentTime) });
      return Reflect.apply(original, this, args);
    };
    methodRestores.push(() => restoreOwn(oldNodeWaived, 'stop', descriptor));
  } catch (e) { instrumentation.patchErrors.push('old source stop: ' + String(e)); }

  out.old = {
    voice: selectedBefore, position: oldPosition, segmentChars: String(oldSegment?.text ?? '').length,
    duration: oldDuration, timestamps: oldTimes, before: triggerState,
    sourceIdentity: !!oldNode, controllerDestroyed: !!oldWaived?._destroyed,
    sourcePosition: oldSegment?.sourcePosition ? { pageIndex: oldSegment.sourcePosition.pageIndex ?? null, rects: oldSegment.sourcePosition.rects?.length ?? null } : null,
  };
  instrumentation.triggerAt = now();
  let switchKeys = null;
  try { switchKeys = press('.', 'Period', 190); } catch (e) { out.errors.push('switch key: ' + String(e)); }
  out.steps.push({ action: 'trusted-next', key: switchKeys, triggerAt: instrumentation.triggerAt });
  const trace = [];
  let finalDiagnostic = null;
  for (let i = 0; i < 55; i++) {
    const d = diagnostic();
    const s = state();
    const target = instrumentation.prepared;
    const tc = target ? Components.utils.waiveXrays(target) : null;
    if (tc && oldPosition >= 0 && instrumentation.targetReadyAt === null
      && tc._audioBuffers?.has(oldPosition) && tc._segmentTimestamps?.has(oldPosition)) {
      instrumentation.targetReadyAt = now();
      const t = tc._segmentTimestamps?.get(oldPosition);
      instrumentation.targetTimes = copyTimes(t);
      instrumentation.targetDuration = Number(tc._audioBuffers?.get(oldPosition)?.duration ?? NaN);
    }
    const handoff = d.fixture?.handoff ?? null;
    if (!instrumentation.commitAt && handoff?.stage === 'committed') instrumentation.commitAt = now();
    trace.push({ ms: now() - instrumentation.triggerAt, state: s,
      handoff: handoff ? { pending: handoff.pending, stage: handoff.stage, prepared: handoff.prepared,
        last: handoff.last, wordDecision: handoff.wordDecision, audioReady: handoff.audioReady } : null,
      oldAlive: !oldWaived?._destroyed, oldSource: !!oldWaived?._sourceNode,
      targetReady: !!instrumentation.prepared && instrumentation.targetReadyAt !== null,
      targetRequests: instrumentation.targetRequests.map(r => ({ index: r.index, requestedAt: r.requestedAt - instrumentation.triggerAt })),
    });
    finalDiagnostic = d;
    if (handoff?.stage === 'committed' || handoff?.stage === 'failed' || handoff?.stage === 'cancelled') break;
    await sleep(80);
  }
  if (instrumentation.prepared && !instrumentation.targetTimes.length) {
    const tc = Components.utils.waiveXrays(instrumentation.prepared);
    instrumentation.targetTimes = copyTimes(tc._segmentTimestamps?.get(oldPosition));
    instrumentation.targetDuration = Number(tc._audioBuffers?.get(oldPosition)?.duration ?? NaN);
  }
  const finalHandoff = finalDiagnostic?.fixture?.handoff ?? null;
  const readyEntry = finalHandoff?.audioReady?.at(-1) ?? null;
  const readyTrace = trace.find(row => row.targetReady) ?? null;
  out.trace = { count: trace.length, first: trace[0] ?? null, ready: readyTrace, last: trace.at(-1) ?? null };
  out.new = {
    voice: targetRow.id, duration: instrumentation.targetDuration,
    timestamps: instrumentation.targetTimes,
    requestAtMs: instrumentation.targetRequests[0] ? instrumentation.targetRequests[0].requestedAt - instrumentation.triggerAt : null,
    readyAtMs: instrumentation.targetReadyAt === null ? null : instrumentation.targetReadyAt - instrumentation.triggerAt,
    controllerAtMs: instrumentation.targetControllerAt === null ? null : instrumentation.targetControllerAt - instrumentation.triggerAt,
    preparedPlays: instrumentation.preparedPlays.map(row => ({ ...row, at: row.at - instrumentation.triggerAt })),
  };
  out.stopCalls = instrumentation.stopCalls.map(row => ({ ...row, at: row.at - instrumentation.triggerAt }));
  out.diagnostic = { mechanism: finalDiagnostic?.all?.mechanism ?? null, bindings: finalDiagnostic?.all?.bindings ?? null,
    handoff: finalHandoff, selectedAfter: finalDiagnostic?.fixture?.selected ?? manager.selectedVoiceID ?? null };
  out.audio = {
    oldAtTrigger: { state: oldContext?.state ?? null, time: Number(oldContext?.currentTime) },
    oldAtReady: readyEntry ? { state: trace.find(row => row.targetReady)?.state?.audio?.state ?? null,
      time: trace.find(row => row.targetReady)?.state?.audio?.time ?? null } : null,
    targetAtReady: instrumentation.prepared ? { state: Components.utils.waiveXrays(instrumentation.prepared)?._audioContext?.state ?? null,
      time: Number(Components.utils.waiveXrays(instrumentation.prepared)?._audioContext?.currentTime) } : null,
    audioReady: readyEntry,
  };
  out.identity = {
    sameSegment: finalHandoff?.last?.index === oldPosition,
    sourcePositionRetained: manager._activeSegment === oldSegment,
    sharedSegments: instrumentation.prepared ? Components.utils.waiveXrays(instrumentation.prepared)._segments === manager._segments : null,
    noSample: instrumentation.targetRequests.every(row => row.index === oldPosition),
    oneTargetSegmentRequest: instrumentation.targetRequests.filter(row => row.index === oldPosition).length === 1,
    targetVoice: targetRow.id.startsWith('local::'),
  };
  out.patchErrors = instrumentation.patchErrors;
  out.status = finalHandoff?.stage === 'committed' && finalHandoff?.last?.kind === 'word'
    && finalHandoff?.wordDecision === 'shared-word-boundary' && out.identity.sameSegment
    && out.identity.oneTargetSegmentRequest && out.new.timestamps.length > 0 && out.stopCalls.length > 0
    && out.new.preparedPlays.some(row => row.index === oldPosition && Number.isFinite(row.offset))
    ? 'PASS' : finalHandoff?.stage === 'committed' ? 'FAIL' : 'NOT TESTABLE';
  if (manager.active && !manager.paused) { try { manager.pause(); } catch (e) { out.errors.push('pause after handoff: ' + String(e)); } }
  for (let i = methodRestores.length - 1; i >= 0; i--) methodRestores[i]();
  out.cleanup = { fixturePaused: !!manager.paused, selected: manager.selectedVoiceID ?? null,
    pending: diagnostic().fixture?.handoff?.pending ?? null };
  return JSON.stringify(out, null, 1);
})()
