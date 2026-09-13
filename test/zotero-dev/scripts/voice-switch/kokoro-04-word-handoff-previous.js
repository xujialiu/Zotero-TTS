return (async () => {
  const root = Zotero.__ztts95Kokoro, fixture = root?.fixtureA, reader = fixture?.reader;
  const internal = reader?._internalReader, manager = internal?._readAloudManager;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const now = () => Date.now();
  const copyTimes = list => {
    const out = [];
    for (let i = 0; i < (list?.length ?? 0); i++) {
      const t = list[i]; if (!t) continue;
      out.push({ start: Number(t.start), end: Number(t.end), charStart: Number(t.charStart), charEnd: Number(t.charEnd) });
    }
    return out;
  };
  const state = () => {
    const c = manager?._controller, ctx = c?._audioContext, segment = Number.isFinite(c?._position) ? manager?._segments?.[c._position] : null;
    return { active: !!manager?.active, paused: !!manager?.paused, selected: manager?.selectedVoiceID ?? null,
      position: c?._position ?? null, currentIndex: c?._currentIndex ?? null,
      progress: Number.isFinite(c?._currentPlaybackTime) ? c._currentPlaybackTime : null,
      segmentChars: segment ? String(segment.text ?? '').length : null, source: !!c?._sourceNode, playing: !!c?._isPlaying,
      destroyed: !!c?._destroyed, audio: { state: ctx?.state ?? null, time: Number.isFinite(ctx?.currentTime) ? ctx.currentTime : null,
        duration: Number.isFinite(c?._currentBuffer?.duration) ? c._currentBuffer.duration : null } };
  };
  const diagnostic = () => {
    try { const all = JSON.parse(Zotero.ZoteroTTS.diagnostics.voiceSwitch()); const index = (Zotero.Reader._readers || []).indexOf(reader);
      return { all, fixture: all.readers?.[index] ?? null }; } catch (e) { return { all: null, fixture: null, error: String(e) }; }
  };
  const press = (key, code, keyCode) => {
    const rw = reader._iframeWindow, tip = Components.classes['@mozilla.org/text-input-processor;1'].createInstance(Components.interfaces.nsITextInputProcessor);
    const K = rw.KeyboardEvent, ev = (value, valueCode, valueKeyCode) => new K('', { key: value, code: valueCode, keyCode: valueKeyCode, bubbles: true, cancelable: true });
    tip.beginInputTransactionForTests(rw);
    const ret = [tip.keydown(ev('Shift', 'ShiftLeft', 16)), tip.keydown(ev(key, code, keyCode)), tip.keyup(ev(key, code, keyCode)), tip.keyup(ev('Shift', 'ShiftLeft', 16))];
    if (typeof tip.endInputTransaction === 'function') tip.endInputTransaction();
    return ret;
  };
  const out = { status: 'FAIL', direction: 'previous', errors: [], traces: [], targetRequests: [], preparedPlays: [], stopCalls: [] };
  if (!reader || !manager) { out.errors.push('fixture manager is missing'); return JSON.stringify(out, null, 1); }
  const menu = [], source = manager.voicesForLanguage || [];
  for (let i = 0; i < source.length; i++) { const v = source[i]; if (v?.id) menu.push({ voice: v, id: String(v.id), label: String(v.label ?? ''), credits: v.creditsPerMinute ?? null }); }
  menu.sort((a, b) => (a.credits ?? -1) - (b.credits ?? -1));
  const selectedBefore = String(manager.selectedVoiceID ?? ''), selectedIndex = menu.findIndex(v => v.id === selectedBefore);
  const targetRow = selectedIndex >= 0 && menu.length > 1 ? menu[(selectedIndex - 1 + menu.length) % menu.length] : null;
  out.selectedBefore = selectedBefore; out.target = targetRow ? { id: targetRow.id, label: targetRow.label } : null; out.menuCount = menu.length;
  if (!targetRow || !targetRow.id.startsWith('local::')) { out.errors.push('previous filtered target is not a Kokoro voice'); return JSON.stringify(out, null, 1); }

  const lengths = [];
  for (let i = 0; i < (manager._segments || []).length; i++) lengths.push({ index: i, chars: String(manager._segments[i]?.text ?? '').length });
  lengths.sort((a, b) => b.chars - a.chars || a.index - b.index);
  const segmentIndex = lengths[0]?.index ?? 0;
  out.segment = { index: segmentIndex, chars: lengths[0]?.chars ?? null, granularity: manager._segmentGranularity ?? null };
  if (manager.active && !manager.paused) { try { manager.pause(); } catch (e) {} }
  try { manager.repositionTo(segmentIndex); } catch (e) { out.errors.push('reposition: ' + String(e)); }
  if (manager.active && !manager.paused) { try { manager.pause(); } catch (e) { out.errors.push('pause after reposition: ' + String(e)); } }
  await sleep(100);
  try { manager.repositionTo(segmentIndex); } catch (e) { out.errors.push('second reposition: ' + String(e)); }
  if (manager.active && !manager.paused) { try { manager.pause(); } catch (e) {} }
  try { Zotero_Tabs.select(reader.tabID); reader.focus?.(); reader._iframeWindow?.focus?.(); } catch (e) { out.errors.push('focus: ' + String(e)); }
  let startKeys = null; try { startKeys = press(' ', 'Space', 32); } catch (e) { out.errors.push('start key: ' + String(e)); }
  let old = null, startAt = now();
  for (let i = 0; i < 100; i++) {
    const s = state();
    if (s.active && !s.paused && s.source && s.playing && s.audio.state === 'running' && s.position === segmentIndex) { old = manager._controller; break; }
    await sleep(20);
  }
  out.start = { key: startKeys, state: state(), elapsedMs: now() - startAt };
  if (!old || !state().source || !state().playing || state().audio.state !== 'running') {
    out.status = 'NOT TESTABLE'; out.errors.push('old source did not reach a running clock');
    if (manager.active && !manager.paused) { try { manager.pause(); } catch (e) {} }
    return JSON.stringify(out, null, 1);
  }
  const ow = Components.utils.waiveXrays(old), oldNode = ow._sourceNode, nw = Components.utils.waiveXrays(oldNode), oldContext = ow._audioContext;
  const oldPosition = Number(ow._position), oldSegment = manager._segments?.[oldPosition];
  const oldTimes = copyTimes(ow._currentTimestamps), oldDuration = Number(ow._currentBuffer?.duration);
  const instrumentation = { controllerAt: null, readyAt: null, prepared: null, targetTimes: [], targetDuration: null, cacheBefore: null, stopCalls: [], plays: [], requests: [], patchErrors: [] };
  const restores = [];
  const restoreOwn = (object, name, descriptor) => { try { if (descriptor) Object.defineProperty(object, name, descriptor); else delete object[name]; } catch (e) { instrumentation.patchErrors.push('restore ' + name + ': ' + String(e)); } };
  const instrumentPrepared = prepared => {
    instrumentation.prepared = prepared; const c = Components.utils.waiveXrays(prepared);
    try { instrumentation.cacheBefore = !!c._audioBuffers?.has(oldPosition); instrumentation.requests.push({ index: oldPosition, requestedAt: instrumentation.controllerAt ?? now() }); }
    catch (e) { instrumentation.patchErrors.push('prepared readiness probe: ' + String(e)); }
    try { const original = c._playAudioBuffer, descriptor = Object.getOwnPropertyDescriptor(c, '_playAudioBuffer');
      c._playAudioBuffer = function (...args) { instrumentation.plays.push({ at: now(), index: Number(c._position), offset: Number(args[1]), speed: Number(args[2]) }); return Reflect.apply(original, this, args); };
      restores.push(() => restoreOwn(c, '_playAudioBuffer', descriptor));
    } catch (e) { instrumentation.patchErrors.push('prepared playAudioBuffer: ' + String(e)); }
  };
  try { const target = Components.utils.waiveXrays(targetRow.voice), original = target.getController, descriptor = Object.getOwnPropertyDescriptor(target, 'getController');
    target.getController = function (...args) { instrumentation.controllerAt = now(); const prepared = Reflect.apply(original, this, args); instrumentPrepared(prepared); return prepared; };
    restores.push(() => restoreOwn(target, 'getController', descriptor));
  } catch (e) { instrumentation.patchErrors.push('target getController: ' + String(e)); }
  try { const original = nw.stop, descriptor = Object.getOwnPropertyDescriptor(nw, 'stop'); nw.stop = function (...args) { instrumentation.stopCalls.push({ at: now(), when: Number(args[0]), contextTime: Number(oldContext?.currentTime) }); return Reflect.apply(original, this, args); };
    restores.push(() => restoreOwn(nw, 'stop', descriptor)); } catch (e) { instrumentation.patchErrors.push('old source stop: ' + String(e)); }
  const triggerAt = now(); let switchKeys = null; try { switchKeys = press(',', 'Comma', 188); } catch (e) { out.errors.push('switch key: ' + String(e)); }
  const trace = []; let finalDiagnostic = null;
  for (let i = 0; i < 55; i++) { const d = diagnostic(), s = state(), h = d.fixture?.handoff ?? null;
    const prepared = instrumentation.prepared ? Components.utils.waiveXrays(instrumentation.prepared) : null;
    if (prepared && instrumentation.readyAt === null && prepared._audioBuffers?.has(oldPosition) && prepared._segmentTimestamps?.has(oldPosition)) {
      instrumentation.readyAt = now(); instrumentation.targetTimes = copyTimes(prepared._segmentTimestamps.get(oldPosition)); instrumentation.targetDuration = Number(prepared._audioBuffers.get(oldPosition)?.duration ?? NaN);
    }
    if (h?.stage === 'committed' || h?.stage === 'failed' || h?.stage === 'cancelled') { finalDiagnostic = d; trace.push({ ms: now() - triggerAt, state: s, handoff: h, oldAlive: !ow._destroyed }); break; }
    trace.push({ ms: now() - triggerAt, state: s, handoff: h ? { pending: h.pending, stage: h.stage, prepared: h.prepared, last: h.last, wordDecision: h.wordDecision, audioReady: h.audioReady } : null, oldAlive: !ow._destroyed, targetReady: instrumentation.readyAt !== null });
    finalDiagnostic = d; await sleep(80); }
  if (!finalDiagnostic) finalDiagnostic = diagnostic();
  if (instrumentation.prepared && !instrumentation.targetTimes.length) { const c = Components.utils.waiveXrays(instrumentation.prepared); instrumentation.targetTimes = copyTimes(c._segmentTimestamps?.get(oldPosition)); instrumentation.targetDuration = Number(c._audioBuffers?.get(oldPosition)?.duration ?? NaN); }
  const h = finalDiagnostic.fixture?.handoff ?? null;
  out.status = h?.stage === 'committed' && h?.last?.kind === 'word' ? 'PASS' : h?.stage === 'committed' ? 'FAIL' : 'NOT TESTABLE';
  out.old = { voice: selectedBefore, position: oldPosition, duration: oldDuration, timestamps: oldTimes, state: out.start.state,
    sourcePosition: oldSegment?.sourcePosition ? { pageIndex: oldSegment.sourcePosition.pageIndex ?? null, rects: oldSegment.sourcePosition.rects?.length ?? null } : null };
  out.new = { voice: targetRow.id, duration: instrumentation.targetDuration, timestamps: instrumentation.targetTimes,
    cacheBefore: instrumentation.cacheBefore, controllerAtMs: instrumentation.controllerAt === null ? null : instrumentation.controllerAt - triggerAt,
    requestAtMs: instrumentation.requests[0] ? instrumentation.requests[0].requestedAt - triggerAt : null,
    readyAtMs: instrumentation.readyAt === null ? null : instrumentation.readyAt - triggerAt,
    preparedPlays: instrumentation.plays.map(row => ({ ...row, at: row.at - triggerAt })) };
  out.stopCalls = instrumentation.stopCalls.map(row => ({ ...row, at: row.at - triggerAt }));
  out.diagnostic = { handoff: h, selectedAfter: finalDiagnostic.fixture?.selected ?? manager.selectedVoiceID ?? null,
    mechanism: finalDiagnostic.all?.mechanism ?? null, audioReady: h?.audioReady ?? [] };
  out.trace = { count: trace.length, first: trace[0] ?? null, last: trace.at(-1) ?? null };
  out.identity = { sameSegment: h?.last?.index === oldPosition, targetVoice: targetRow.id.startsWith('local::'),
    oneTargetRequest: instrumentation.requests.filter(x => x.index === oldPosition).length === 1,
    sourcePositionRetained: manager._activeSegment === oldSegment, sharedSegments: instrumentation.prepared ? Components.utils.waiveXrays(instrumentation.prepared)._segments === manager._segments : null };
  out.patchErrors = instrumentation.patchErrors;
  if (manager.active && !manager.paused) { try { manager.pause(); } catch (e) { out.errors.push('pause after test: ' + String(e)); } }
  for (let i = restores.length - 1; i >= 0; i--) restores[i]();
  out.cleanup = { paused: !!manager.paused, selected: manager.selectedVoiceID ?? null, pending: diagnostic().fixture?.handoff?.pending ?? null };
  return JSON.stringify(out, null, 1);
})()
