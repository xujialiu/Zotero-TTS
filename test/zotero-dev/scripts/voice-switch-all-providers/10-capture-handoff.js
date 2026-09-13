return (() => {
  const state = Zotero.__zttsAllHandoff, run = state && state.run;
  if (!run) return JSON.stringify({ status: 'NOT TESTABLE', error: 'run missing' }, null, 1);
  const list = Zotero.Reader._readers || [];
  let reader = null;
  for (let i = 0; i < list.length; i++) if (list[i] && list[i].itemID === run.readerItemID) { reader = list[i]; break; }
  const manager = reader && reader._internalReader && reader._internalReader._readAloudManager;
  const d = (() => { try { const all = JSON.parse(Zotero.ZoteroTTS.diagnostics.voiceSwitch()); const index = (Zotero.Reader._readers || []).indexOf(reader); return { all, fixture: all.readers && all.readers[index] || null }; } catch (e) { return { error: String(e), all: null, fixture: null }; } })();
  const h = d.fixture && d.fixture.handoff || null, rel = value => value == null ? null : Number(value) - Number(run.triggerAt);
  const c = manager && manager._controller, context = c && c._audioContext;
  const evidence = { status: h && h.stage === 'committed' ? 'PASS_OR_FALLBACK' : h && h.stage ? h.stage.toUpperCase() : 'PENDING', spec: run.spec, source: run.source, expectedTarget: run.expectedTarget, actualTarget: run.targetVoiceID ? { id: run.targetVoiceID } : null, direction: run.direction, segment: { index: run.segmentIndex, text: run.segmentText, chars: run.segmentText.length, oldDuration: run.oldDuration, speed: run.speed, oldTimings: run.oldTimes }, target: { duration: run.targetDuration, timings: run.targetTimes, controllerAtMs: rel(run.targetControllerAt), readyAtMs: rel(run.targetReadyAt), requests: run.targetRequests.map(x => ({ index: x.index, atMs: rel(x.at), voice: x.voice })) }, audioReady: h && h.audioReady || [], diagnostic: h || null, stopCalls: run.stopCalls.map(x => ({ atMs: rel(x.at), when: x.when, contextTime: x.contextTime })), preparedPlays: run.preparedPlays.map(x => ({ atMs: rel(x.at), index: x.index, offset: x.offset, speed: x.speed })), finalState: { active: !!(manager && manager.active), paused: !!(manager && manager.paused), selected: manager && manager.selectedVoiceID || null, position: c && Number.isFinite(c._position) ? c._position : null, currentIndex: c && Number.isFinite(c._currentIndex) ? c._currentIndex : null, audioState: context && context.state || null, audioTime: context && Number.isFinite(context.currentTime) ? context.currentTime : null }, trace: { count: run.trace.length, first: run.trace[0] || null, last: run.trace[run.trace.length - 1] || null }, patchErrors: run.patchErrors };
  state.results = state.results || []; state.results.push(evidence);
  if (manager && manager.active && !manager.paused) { try { manager.pause(); } catch (e) { evidence.cleanupError = 'pause: ' + String(e); } }
  if (run.restores) { for (let i = run.restores.length - 1; i >= 0; i--) { try { run.restores[i](); } catch (e) { evidence.cleanupError = 'restore: ' + String(e); } } run.restores = []; run.prepared = null; }
  return JSON.stringify(evidence, null, 1);
})()
