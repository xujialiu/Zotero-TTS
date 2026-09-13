return (async () => {
  const state = Zotero.__zttsOfficialFollowup, spec = state && state.spec, fixture = state && state.fixture, sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const out = { status: 'FAIL', errors: [] };
  const reader = fixture && fixture.reader, internal = reader && reader._internalReader, manager = internal && internal._readAloudManager;
  if (!state || !spec || !fixture || !manager) { out.status = 'NOT TESTABLE'; out.errors.push('baseline/spec/fixture/manager missing'); return JSON.stringify(out, null, 1); }
  try { if (manager.active && !manager.paused) manager.pause(); } catch (e) { out.errors.push('pause-before-start: ' + String(e)); }
  try { if (manager._selectedTier !== spec.tier) manager.selectTier(spec.tier); } catch (e) { out.errors.push('select-tier: ' + String(e)); }
  try { if (manager.selectedVoiceID !== spec.source.id) manager.selectVoice(spec.source.id); } catch (e) { out.errors.push('select-source: ' + String(e)); }
  try { manager.repositionTo(spec.segmentIndex); } catch (e) { out.errors.push('reposition: ' + String(e)); }
  try { if (manager.active && !manager.paused) manager.pause(); } catch (e) { out.errors.push('pause-after-prepare: ' + String(e)); }
  const rw = reader._iframeWindow;
  try { Zotero_Tabs.select(reader.tabID); reader.focus && reader.focus(); rw && rw.focus && rw.focus(); rw && rw.document && rw.document.notifyUserGestureActivation && rw.document.notifyUserGestureActivation(); } catch (e) { out.errors.push('focus/activation: ' + String(e)); }
  try { const context = manager._controller && manager._controller._audioContext; if (context && context.state === 'suspended') await Promise.race([context.resume(), new Promise(resolve => setTimeout(resolve, 900))]); } catch (e) { out.errors.push('resume: ' + String(e)); }
  const tip = Components.classes['@mozilla.org/text-input-processor;1'].createInstance(Components.interfaces.nsITextInputProcessor), K = rw && rw.KeyboardEvent, ev = (key, code, keyCode, shiftKey = false) => new K('', { key, code, keyCode, bubbles: true, cancelable: true, shiftKey });
  let startKeys = null;
  try { tip.beginInputTransactionForTests(rw); startKeys = [tip.keydown(ev('Shift', 'ShiftLeft', 16)), tip.keydown(ev(' ', 'Space', 32, true)), tip.keyup(ev(' ', 'Space', 32, true)), tip.keyup(ev('Shift', 'ShiftLeft', 16))]; if (typeof tip.endInputTransaction === 'function') tip.endInputTransaction(); } catch (e) { out.errors.push('start-key: ' + String(e)); }
  let running = null;
  for (let i = 0; i < 420; i++) {
    const c = manager._controller, context = c && c._audioContext, current = { position: c && Number.isFinite(c._position) ? c._position : null, currentIndex: c && Number.isFinite(c._currentIndex) ? c._currentIndex : null, progress: c && Number.isFinite(c._currentPlaybackTime) ? c._currentPlaybackTime : null, source: !!(c && c._sourceNode), playing: !!(c && c._isPlaying), active: !!(manager && manager.active), paused: !!(manager && manager.paused), audioState: context && context.state || null, audioTime: context && Number.isFinite(context.currentTime) ? context.currentTime : null };
    if (current.active && !current.paused && current.source && current.playing && current.audioState === 'running' && current.position === spec.segmentIndex) { running = current; break; }
    await sleep(15);
  }
  if (!running) {
    out.status = 'NOT TESTABLE';
    out.errors.push('old source did not reach running clock within 6.3s');
    const c = manager._controller, context = c && c._audioContext;
    out.start = { keys: startKeys, selected: manager.selectedVoiceID || null, tier: manager._selectedTier || null, position: c && c._position || null, source: !!(c && c._sourceNode), playing: !!(c && c._isPlaying), active: !!manager.active, paused: !!manager.paused, audioState: context && context.state || null, audioTime: context && Number.isFinite(context.currentTime) ? context.currentTime : null };
    if (manager.active && !manager.paused) { try { manager.pause(); } catch (e) {} }
    return JSON.stringify(out, null, 1);
  }
  const c = manager._controller, old = Components.utils.waiveXrays(c), oldNode = old._sourceNode, oldNodeWaived = oldNode && Components.utils.waiveXrays(oldNode), context = old._audioContext, copyTimes = arr => { const a = []; for (let i = 0; i < (arr && arr.length || 0); i++) { const t = arr[i]; if (t) a.push({ start: Number(t.start), end: Number(t.end), charStart: Number(t.charStart), charEnd: Number(t.charEnd) }); } return a; }, now = () => Date.now();
  const run = { spec: { tier: spec.tier, direction: spec.direction, source: spec.source, target: spec.target }, readerItemID: fixture.itemID, readerTabID: reader.tabID, readerIndex: (Zotero.Reader._readers || []).indexOf(reader), source: spec.source, expectedTarget: spec.target, direction: spec.direction, segmentIndex: spec.segmentIndex, segmentText: spec.segmentText, oldPosition: Number(old._position), oldTimes: copyTimes(old._currentTimestamps), oldDuration: Number(old._currentBuffer && old._currentBuffer.duration), speed: Number(manager.speed), triggerAt: null, targetControllerAt: null, targetVoiceID: null, targetReadyAt: null, targetRequests: [], targetTimes: [], targetDuration: null, preparedPlays: [], stopCalls: [], patchErrors: [], trace: [], restores: [], prepared: null, oldController: c };
  const restoreOwn = (object, name, descriptor) => { try { if (descriptor) Object.defineProperty(object, name, descriptor); else delete object[name]; } catch (e) { run.patchErrors.push('restore ' + name + ': ' + String(e)); } };
  const instrumentPrepared = prepared => {
    run.prepared = prepared;
    const pc = Components.utils.waiveXrays(prepared);
    run.targetRequests.push({ index: run.oldPosition, at: run.targetControllerAt || now(), voice: run.targetVoiceID });
    try { const original = pc._playAudioBuffer, descriptor = Object.getOwnPropertyDescriptor(pc, '_playAudioBuffer'); pc._playAudioBuffer = function (...args) { run.preparedPlays.push({ at: now(), index: Number(pc._position), offset: Number(args[1]), speed: Number(args[2]) }); return Reflect.apply(original, this, args); }; run.restores.push(() => restoreOwn(pc, '_playAudioBuffer', descriptor)); } catch (e) { run.patchErrors.push('prepared play: ' + String(e)); }
    try { const original = pc._getAudioData, descriptor = Object.getOwnPropertyDescriptor(pc, '_getAudioData'); pc._getAudioData = function (...args) { run.targetRequests.push({ index: Number(args[0]), at: now(), voice: run.targetVoiceID, method: '_getAudioData' }); return Reflect.apply(original, this, args); }; run.restores.push(() => restoreOwn(pc, '_getAudioData', descriptor)); } catch (e) { run.patchErrors.push('prepared getAudioData: ' + String(e)); }
  };
  const target = (() => { const all = manager._allVoices || []; for (let i = 0; i < all.length; i++) if (all[i] && String(all[i].id || '') === String(spec.target.id)) return all[i]; return null; })();
  if (!target) run.patchErrors.push('target voice object missing');
  else {
    try { const v = Components.utils.waiveXrays(target), original = v.getController, descriptor = Object.getOwnPropertyDescriptor(v, 'getController'); if (typeof original !== 'function') throw new Error('getController is not a function'); v.getController = function (...args) { run.targetControllerAt = now(); run.targetVoiceID = String(spec.target.id); const prepared = Reflect.apply(original, this, args); instrumentPrepared(prepared); return prepared; }; run.restores.push(() => restoreOwn(v, 'getController', descriptor)); } catch (e) { run.patchErrors.push('target getController: ' + String(e)); }
  }
  if (oldNodeWaived) { try { const original = oldNodeWaived.stop, descriptor = Object.getOwnPropertyDescriptor(oldNodeWaived, 'stop'); oldNodeWaived.stop = function (...args) { run.stopCalls.push({ at: now(), when: Number(args[0]), contextTime: Number(context && context.currentTime) }); return Reflect.apply(original, this, args); }; run.restores.push(() => restoreOwn(oldNodeWaived, 'stop', descriptor)); } catch (e) { run.patchErrors.push('old stop: ' + String(e)); } }
  state.run = run; run.triggerAt = now();
  let switchKeys = null;
  try { const key = spec.direction === -1 ? ',' : '.', code = spec.direction === -1 ? 'Comma' : 'Period', keyCode = spec.direction === -1 ? 188 : 190; tip.beginInputTransactionForTests(rw); switchKeys = [tip.keydown(ev('Shift', 'ShiftLeft', 16)), tip.keydown(ev(key, code, keyCode, true)), tip.keyup(ev(key, code, keyCode, true)), tip.keyup(ev('Shift', 'ShiftLeft', 16))]; if (typeof tip.endInputTransaction === 'function') tip.endInputTransaction(); } catch (e) { run.patchErrors.push('switch-key: ' + String(e)); }
  out.status = 'STARTED'; out.start = { keys: startKeys, state: running }; out.switchKeys = switchKeys; out.source = run.source; out.expectedTarget = run.expectedTarget; out.tier = spec.tier; out.segment = { index: spec.segmentIndex, chars: spec.segmentText.length, text: spec.segmentText, duration: run.oldDuration, timings: run.oldTimes.length, speed: run.speed }; out.patchErrors = run.patchErrors;
  return JSON.stringify(out, null, 1);
})()
