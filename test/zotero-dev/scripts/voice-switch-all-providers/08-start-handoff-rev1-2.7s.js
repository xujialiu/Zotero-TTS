return (async () => {
  const state = Zotero.__zttsAllHandoff, fixture = state && state.fixture, spec = state && state.spec;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const out = { status: 'FAIL', errors: [] };
  if (!state || !fixture || !spec) { out.status = 'NOT TESTABLE'; out.errors.push('baseline, fixture, or spec missing'); return JSON.stringify(out, null, 1); }
  const list = Zotero.Reader._readers || [];
  let reader = null;
  for (let i = 0; i < list.length; i++) if (list[i] && list[i].itemID === fixture.itemID) { reader = list[i]; break; }
  const internal = reader && reader._internalReader, manager = internal && internal._readAloudManager;
  if (!reader || !manager) { out.status = 'NOT TESTABLE'; out.errors.push('fixture manager missing'); return JSON.stringify(out, null, 1); }
  const normalize = locale => { const value = String(locale || ''), at = value.indexOf('-'); if (at < 0) return value; const base = value.slice(0, at), region = value.slice(at + 1); if (region === 'CN' || region === 'HK' || region === 'TW') return base; if (region === 'XA' || region === 'SA') return base + '-001'; return base + '-' + region; };
  const rowsFor = () => {
    const source = manager.voicesForLanguage || [], rows = [];
    for (let i = 0; i < source.length; i++) { const v = source[i]; if (v && v.id) rows.push({ voice: v, id: String(v.id), label: String(v.label || ''), language: String(v.language || ''), credits: v.creditsPerMinute == null ? null : v.creditsPerMinute }); }
    rows.sort((a, b) => (a.credits == null ? -1 : a.credits) - (b.credits == null ? -1 : b.credits));
    return rows;
  };
  const initial = rowsFor(), direction = spec.direction === -1 ? -1 : 1;
  const eligible = row => !spec.provider || row.id.indexOf(spec.provider) === 0;
  const candidatePairs = [];
  for (let i = 0; i < initial.length; i++) {
    const a = initial[i], key = normalize(a.language), filtered = key.indexOf('-') >= 0 ? initial.filter(v => normalize(v.language) === key) : initial, selectedIndex = filtered.findIndex(v => v.id === a.id), b = selectedIndex >= 0 ? filtered[(selectedIndex + direction + filtered.length) % filtered.length] : null;
    if (!a || !b || a.id === b.id) continue;
    if (spec.mode === 'same' && !(eligible(a) && eligible(b))) continue;
    if (spec.mode === 'cross' && !(a.id.indexOf(spec.from) === 0 && b.id.indexOf(spec.to) === 0)) continue;
    candidatePairs.push({ a, b });
  }
  let pair = candidatePairs[0] || null;
  if (spec.mode === 'auto') {
    pair = candidatePairs.find(x => eligible(x.a) && eligible(x.b)) || candidatePairs[0] || null;
  }
  if (!pair) { out.status = 'NOT TESTABLE'; out.errors.push('requested adjacent pair is unavailable'); out.menuCount = initial.length; return JSON.stringify(out, null, 1); }
  try { if (manager.active && !manager.paused) manager.pause(); } catch (e) { out.errors.push('pause before select: ' + String(e)); }
  try { if (manager.selectedVoiceID !== pair.a.id) manager.selectVoice(pair.a.id); } catch (e) { out.errors.push('select source: ' + String(e)); }
  await sleep(120);
  const currentRows = rowsFor();
  const current = currentRows.find(v => v.id === pair.a.id) || pair.a;
  const currentKey = normalize(current.language);
  const filtered = currentKey.indexOf('-') >= 0 ? currentRows.filter(v => normalize(v.language) === currentKey) : currentRows;
  const selectedIndex = filtered.findIndex(v => v.id === pair.a.id);
  const actualTarget = selectedIndex >= 0 ? filtered[(selectedIndex + direction + filtered.length) % filtered.length] : null;
  if (!actualTarget || (spec.mode === 'same' && actualTarget.id.indexOf(spec.provider) !== 0) || (spec.mode === 'cross' && actualTarget.id.indexOf(spec.to) !== 0)) {
    out.status = 'NOT TESTABLE'; out.errors.push('requested pair is not adjacent in the selected regional pool'); out.selected = manager.selectedVoiceID || null; out.menuCount = currentRows.length; out.actualTarget = actualTarget ? { id: actualTarget.id, label: actualTarget.label } : null; return JSON.stringify(out, null, 1);
  }
  let segmentIndex = 0, maxChars = -1;
  const segments = manager._segments || [];
  for (let i = 0; i < segments.length; i++) { const chars = String(segments[i] && segments[i].text || '').length; if (chars > maxChars) { maxChars = chars; segmentIndex = i; } }
  try { manager.repositionTo(segmentIndex); } catch (e) { out.errors.push('reposition: ' + String(e)); }
  if (manager.active && !manager.paused) { try { manager.pause(); } catch (e) { out.errors.push('pause after reposition: ' + String(e)); } }
  await sleep(100);
  try { Zotero_Tabs.select(reader.tabID); reader.focus && reader.focus(); reader._iframeWindow && reader._iframeWindow.focus && reader._iframeWindow.focus(); } catch (e) { out.errors.push('focus: ' + String(e)); }
  const rw = reader._iframeWindow, tip = Components.classes['@mozilla.org/text-input-processor;1'].createInstance(Components.interfaces.nsITextInputProcessor), K = rw.KeyboardEvent, ev = (key, code, keyCode, shiftKey = false) => new K('', { key, code, keyCode, bubbles: true, cancelable: true, shiftKey });
  let startKeys = null;
  try { tip.beginInputTransactionForTests(rw); startKeys = [tip.keydown(ev('Shift', 'ShiftLeft', 16)), tip.keydown(ev(' ', 'Space', 32, true)), tip.keyup(ev(' ', 'Space', 32, true)), tip.keyup(ev('Shift', 'ShiftLeft', 16))]; if (typeof tip.endInputTransaction === 'function') tip.endInputTransaction(); } catch (e) { out.errors.push('start key: ' + String(e)); }
  let running = null;
  for (let i = 0; i < 180; i++) {
    const c = manager._controller, context = c && c._audioContext, s = { position: c && Number.isFinite(c._position) ? c._position : null, currentIndex: c && Number.isFinite(c._currentIndex) ? c._currentIndex : null, progress: c && Number.isFinite(c._currentPlaybackTime) ? c._currentPlaybackTime : null, source: !!(c && c._sourceNode), playing: !!(c && c._isPlaying), audioState: context && context.state || null, audioTime: context && Number.isFinite(context.currentTime) ? context.currentTime : null };
    if (manager.active && !manager.paused && s.source && s.playing && s.audioState === 'running' && s.position === segmentIndex) { running = s; break; }
    await sleep(15);
  }
  if (!running) { out.status = 'NOT TESTABLE'; out.errors.push('old source did not reach running clock'); out.start = { keys: startKeys, selected: manager.selectedVoiceID || null, position: manager._controller && manager._controller._position || null, source: !!(manager._controller && manager._controller._sourceNode), playing: !!(manager._controller && manager._controller._isPlaying), audioState: manager._controller && manager._controller._audioContext && manager._controller._audioContext.state || null }; if (manager.active && !manager.paused) { try { manager.pause(); } catch (e) {} } return JSON.stringify(out, null, 1); }
  const c = manager._controller, old = Components.utils.waiveXrays(c), oldNode = old._sourceNode, oldNodeWaived = Components.utils.waiveXrays(oldNode), context = old._audioContext, copyTimes = arr => { const a = []; for (let i = 0; i < (arr && arr.length || 0); i++) { const t = arr[i]; if (t) a.push({ start: Number(t.start), end: Number(t.end), charStart: Number(t.charStart), charEnd: Number(t.charEnd) }); } return a; }, now = () => Date.now();
  const run = { spec, readerItemID: fixture.itemID, readerTabID: reader.tabID, readerIndex: (Zotero.Reader._readers || []).indexOf(reader), source: { id: pair.a.id, label: pair.a.label }, expectedTarget: { id: actualTarget.id, label: actualTarget.label }, direction, segmentIndex, segmentText: String(manager._segments[segmentIndex] && manager._segments[segmentIndex].text || ''), oldPosition: Number(old._position), oldTimes: copyTimes(old._currentTimestamps), oldDuration: Number(old._currentBuffer && old._currentBuffer.duration), speed: Number(manager.speed), triggerAt: null, targetControllerAt: null, targetVoiceID: null, targetReadyAt: null, targetRequests: [], targetTimes: [], targetDuration: null, preparedPlays: [], stopCalls: [], patchErrors: [], trace: [], restores: [], prepared: null, oldController: c };
  const restoreOwn = (object, name, descriptor) => { try { if (descriptor) Object.defineProperty(object, name, descriptor); else delete object[name]; } catch (e) { run.patchErrors.push('restore ' + name + ': ' + String(e)); } };
  const instrumentPrepared = prepared => { run.prepared = prepared; const pc = Components.utils.waiveXrays(prepared); run.targetRequests.push({ index: run.oldPosition, at: run.targetControllerAt || now(), voice: run.targetVoiceID }); try { const original = pc._playAudioBuffer, descriptor = Object.getOwnPropertyDescriptor(pc, '_playAudioBuffer'); pc._playAudioBuffer = function (...args) { run.preparedPlays.push({ at: now(), index: Number(pc._position), offset: Number(args[1]), speed: Number(args[2]) }); return Reflect.apply(original, this, args); }; run.restores.push(() => restoreOwn(pc, '_playAudioBuffer', descriptor)); } catch (e) { run.patchErrors.push('prepared play: ' + String(e)); } };
  const seen = new Set(), pool = []; const source = manager.voicesForLanguage || []; for (let i = 0; i < source.length; i++) if (source[i] && !seen.has(source[i])) { seen.add(source[i]); pool.push(source[i]); } const all = manager.allVoices || []; for (let i = 0; i < all.length; i++) if (all[i] && !seen.has(all[i])) { seen.add(all[i]); pool.push(all[i]); }
  for (let i = 0; i < pool.length; i++) { const voice = pool[i], id = String(voice.id || ''); try { const v = Components.utils.waiveXrays(voice), original = v.getController, descriptor = Object.getOwnPropertyDescriptor(v, 'getController'); v.getController = function (...args) { run.targetControllerAt = now(); run.targetVoiceID = id; const prepared = Reflect.apply(original, this, args); instrumentPrepared(prepared); return prepared; }; run.restores.push(() => restoreOwn(v, 'getController', descriptor)); } catch (e) { run.patchErrors.push('patch ' + id + ': ' + String(e)); } }
  try { const original = oldNodeWaived.stop, descriptor = Object.getOwnPropertyDescriptor(oldNodeWaived, 'stop'); oldNodeWaived.stop = function (...args) { run.stopCalls.push({ at: now(), when: Number(args[0]), contextTime: Number(context && context.currentTime) }); return Reflect.apply(original, this, args); }; run.restores.push(() => restoreOwn(oldNodeWaived, 'stop', descriptor)); } catch (e) { run.patchErrors.push('old stop: ' + String(e)); }
  state.run = run; run.triggerAt = now();
  let switchKeys = null;
  try { const key = direction === 1 ? '.' : ','; const code = direction === 1 ? 'Period' : 'Comma', keyCode = direction === 1 ? 190 : 188; switchKeys = [tip.keydown(ev('Shift', 'ShiftLeft', 16)), tip.keydown(ev(key, code, keyCode, true)), tip.keyup(ev(key, code, keyCode, true)), tip.keyup(ev('Shift', 'ShiftLeft', 16))]; if (typeof tip.endInputTransaction === 'function') tip.endInputTransaction(); } catch (e) { run.patchErrors.push('switch key: ' + String(e)); }
  out.status = 'STARTED'; out.start = { keys: startKeys, state: running }; out.switchKeys = switchKeys; out.source = run.source; out.expectedTarget = run.expectedTarget; out.direction = direction; out.segment = { index: segmentIndex, chars: run.segmentText.length, text: run.segmentText, duration: run.oldDuration, timings: run.oldTimes.length, speed: run.speed }; out.poolSize = pool.length; out.patchErrors = run.patchErrors;
  return JSON.stringify(out, null, 1);
})()


