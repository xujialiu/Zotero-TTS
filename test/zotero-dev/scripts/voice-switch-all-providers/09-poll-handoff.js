return (async () => {
  const state = Zotero.__zttsAllHandoff, run = state && state.run;
  const out = { status: 'PENDING', errors: [] };
  if (!run) { out.status = 'NOT TESTABLE'; out.errors.push('run missing'); return JSON.stringify(out, null, 1); }
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), now = () => Date.now();
  const list = Zotero.Reader._readers || [];
  let reader = null;
  for (let i = 0; i < list.length; i++) if (list[i] && list[i].itemID === run.readerItemID) { reader = list[i]; break; }
  const manager = reader && reader._internalReader && reader._internalReader._readAloudManager;
  const copyTimes = arr => { const a = []; for (let i = 0; i < (arr && arr.length || 0); i++) { const t = arr[i]; if (t) a.push({ start: Number(t.start), end: Number(t.end), charStart: Number(t.charStart), charEnd: Number(t.charEnd) }); } return a; };
  const diagnostic = () => { try { const all = JSON.parse(Zotero.ZoteroTTS.diagnostics.voiceSwitch()); const index = (Zotero.Reader._readers || []).indexOf(reader); return { all, fixture: all.readers && all.readers[index] || null }; } catch (e) { return { error: String(e), all: null, fixture: null }; } };
  if (!reader || !manager) { out.status = 'NOT TESTABLE'; out.errors.push('fixture manager missing'); return JSON.stringify(out, null, 1); }
  for (let n = 0; n < 55; n++) {
    let ready = false;
    try { const prepared = run.prepared && Components.utils.waiveXrays(run.prepared); if (prepared && prepared._audioBuffers && prepared._segmentTimestamps && prepared._audioBuffers.has(run.oldPosition) && prepared._segmentTimestamps.has(run.oldPosition)) { if (run.targetReadyAt === null) run.targetReadyAt = now(); run.targetTimes = copyTimes(prepared._segmentTimestamps.get(run.oldPosition)); run.targetDuration = Number(prepared._audioBuffers.get(run.oldPosition) && prepared._audioBuffers.get(run.oldPosition).duration); ready = true; } } catch (e) { const message = 'read prepared: ' + String(e); if (run.patchErrors.indexOf(message) < 0) run.patchErrors.push(message); }
    const d = diagnostic(), h = d.fixture && d.fixture.handoff || null, c = manager._controller, context = c && c._audioContext;
    const stateNow = { active: !!(manager && manager.active), paused: !!(manager && manager.paused), selected: manager && manager.selectedVoiceID || null, position: c && Number.isFinite(c._position) ? c._position : null, currentIndex: c && Number.isFinite(c._currentIndex) ? c._currentIndex : null, progress: c && Number.isFinite(c._currentPlaybackTime) ? c._currentPlaybackTime : null, source: !!(c && c._sourceNode), playing: !!(c && c._isPlaying), audioState: context && context.state || null, audioTime: context && Number.isFinite(context.currentTime) ? context.currentTime : null };
    run.trace.push({ ms: now() - run.triggerAt, state: stateNow, handoff: h ? { pending: h.pending, stage: h.stage, prepared: h.prepared, last: h.last, wordDecision: h.wordDecision, audioReady: h.audioReady } : null, targetReady: ready, targetVoice: run.targetVoiceID, targetControllerAt: run.targetControllerAt === null ? null : run.targetControllerAt - run.triggerAt, targetReadyAt: run.targetReadyAt === null ? null : run.targetReadyAt - run.triggerAt });
    if (h && ['committed', 'failed', 'cancelled'].indexOf(h.stage) >= 0) break;
    await sleep(75);
  }
  const d = diagnostic(), h = d.fixture && d.fixture.handoff || null;
  out.status = h && h.stage === 'committed' ? 'COMPLETED' : h && ['failed', 'cancelled'].indexOf(h.stage) >= 0 ? h.stage.toUpperCase() : 'PENDING';
  out.trace = { count: run.trace.length, first: run.trace[0] || null, ready: run.trace.filter(x => x.targetReady).slice(0, 3), last: run.trace[run.trace.length - 1] || null };
  out.target = { voice: run.targetVoiceID, expected: run.expectedTarget, controllerAtMs: run.targetControllerAt === null ? null : run.targetControllerAt - run.triggerAt, readyAtMs: run.targetReadyAt === null ? null : run.targetReadyAt - run.triggerAt, requests: run.targetRequests.map(x => ({ index: x.index, at: x.at - run.triggerAt, voice: x.voice })), timings: run.targetTimes.length, duration: run.targetDuration };
  out.diagnostic = { stage: h && h.stage || null, pending: h && h.pending || null, prepared: h && h.prepared || null, last: h && h.last || null, wordDecision: h && h.wordDecision || null, audioReady: h && h.audioReady || [], selected: d.fixture && d.fixture.selected || null };
  out.state = run.trace.length ? run.trace[run.trace.length - 1].state : null; out.patchErrors = run.patchErrors;
  return JSON.stringify(out, null, 1);
})()
