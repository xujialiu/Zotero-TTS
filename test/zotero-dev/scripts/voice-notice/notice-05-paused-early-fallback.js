return (async () => {
  const t = Zotero.ZoteroTTSRun.state.transport, Cu = Components.utils;
  t.audioDuration = 20;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const waitFor = async (fn, ms = 9000, interval = 60) => { const end = Date.now() + ms; while (Date.now() < end) { if (fn()) return true; await sleep(interval); } return !!fn(); };
  const findReader = id => { const rows = Zotero.Reader._readers || []; for (let i = 0; i < rows.length; i++) if (rows[i]?.itemID === id) return rows[i]; return null; };
  const handoffOf = entry => { const all = JSON.parse(Zotero.ZoteroTTS.diagnostics.voiceSwitch()), index = (Zotero.Reader._readers || []).indexOf(entry.reader); return all.readers?.[index]?.handoff ?? null; };
  const stateOf = entry => { const m = entry.manager, c = m?._controller, a = c?._audioContext; return {
    active: !!m?.active, paused: !!m?.paused, selected: m?.selectedVoiceID ?? null, position: Number.isFinite(c?._position) ? c._position : null,
    currentIndex: Number.isFinite(c?._currentIndex) ? c._currentIndex : null, progress: Number.isFinite(c?._currentPlaybackTime) ? c._currentPlaybackTime : null,
    sourcePlaying: !!c?._isPlaying, context: a?.state ?? null, audioTime: Number.isFinite(a?.currentTime) ? a.currentTime : null,
  }; };
  const noticeOf = entry => { const el = entry.window?.document?.getElementById('ztts-voice-notice'); return { exists: !!el, opacity: el?.style?.opacity ?? null, text: el ? String(el.textContent || '').trim() : null }; };
  const press = (entry, key, code, keyCode) => { const rw = entry.window, tip = Components.classes['@mozilla.org/text-input-processor;1'].createInstance(Components.interfaces.nsITextInputProcessor), K = rw.KeyboardEvent;
    const ev = (value, valueCode, valueKeyCode, shiftKey = false) => new K('', { key: value, code: valueCode, keyCode: valueKeyCode, bubbles: true, cancelable: true, shiftKey });
    tip.beginInputTransactionForTests(rw); const ret = [tip.keydown(ev('Shift', 'ShiftLeft', 16)), tip.keydown(ev(key, code, keyCode, true)), tip.keyup(ev(key, code, keyCode, true)), tip.keyup(ev('Shift', 'ShiftLeft', 16))];
    if (typeof tip.endInputTransaction === 'function') tip.endInputTransaction(); return ret; };
  const targetVoice = (entry, id) => { const values = Cu.waiveXrays(entry.manager.allVoices) || []; for (let i = 0; i < values.length; i++) if (String(values[i]?.id ?? '') === id) return values[i]; return null; };
  const reopen = async kind => {
    const previous = t.readers[kind];
    try { previous?.internal?.toggleReadAloudPopup(false); } catch (e) {}
    try { previous?.reader?.close?.(); } catch (e) {}
    await waitFor(() => !findReader(previous?.itemID), 5000, 50);
    Services.prefs.setStringPref('extensions.zotero.zotero-tts.readAloud.memory', JSON.stringify({ speed: 1, voice: { id: 'native119-a', lang: 'en' } }));
    const fixture = (Zotero.ZoteroTTSRun.state.fixtures || []).find(row => row.kind === kind);
    Zotero.Reader.open(fixture.itemID);
    let reader = null;
    for (let i = 0; i < 80; i++) { reader = findReader(fixture.itemID); if (reader) { t.window = reader._iframeWindow; break; } await sleep(50); }
    if (!reader) throw new Error(`${kind} reader did not open`);
    let manager = null;
    for (let i = 0; i < 100; i++) { manager = reader._internalReader?._readAloudManager; if (manager) break; await sleep(50); }
    if (!manager) throw new Error(`${kind} manager did not appear`);
    await sleep(500);
    const options = Cu.waiveXrays(manager._options), internal = Cu.waiveXrays(reader._internalReader);
    const originalRemote = options.remoteInterface, originalInternalRemote = internal._readAloudRemoteInterface;
    const injected = Cu.cloneInto(t.nativeStub, reader._iframeWindow, { cloneFunctions: true });
    options.remoteInterface = injected; internal._readAloudRemoteInterface = injected;
    const entry = { itemID: fixture.itemID, tabID: reader.tabID, reader, internal: reader._internalReader, manager, window: reader._iframeWindow, originalRemote, originalInternalRemote };
    t.readers[kind] = entry;
    try { Zotero.getMainWindow?.().Zotero_Tabs?.select(reader.tabID); reader.focus?.(); reader._iframeWindow?.focus?.(); } catch (e) {}
    try { entry.internal.toggleReadAloudPopup(true); } catch (e) {}
    const ready = await waitFor(() => manager.allVoices?.length && manager._segments?.length && manager.selectedVoiceID, 10000, 80);
    if (!ready) throw new Error(`${kind} fresh manager did not load native fixture`);
    if (manager.active && !manager.paused) { try { manager.pause(); } catch (e) {} }
    // The fixture may have persisted the preceding scenario's synthetic voice.
    // Reset the idle manager directly, without routing a test selection through
    // the handoff under test, then keep the fixture's own persisted choice A.
    try {
      const mw = Cu.waiveXrays(manager), values = Cu.waiveXrays(manager.allVoices) || [];
      let voice = null; for (let i = 0; i < values.length; i++) if (String(values[i]?.id ?? '') === 'native119-a') { voice = values[i]; break; }
      if (voice) { mw._voiceID = 'native119-a'; mw._voice = voice; mw._applyVoice(); }
      if (mw._persistedVoices) { mw._persistedVoices.voice = 'native119-a'; if (mw._persistedVoices.tierVoices) mw._persistedVoices.tierVoices.standard = 'native119-a'; }
    } catch (e) {}
    if (manager.active && !manager.paused) { try { manager.pause(); } catch (e) {} }
    await sleep(180); return entry;
  };
  const startAndPause = async entry => {
    const m = entry.manager; Zotero.getMainWindow?.().Zotero_Tabs?.select(entry.tabID); entry.reader.focus?.(); entry.window.focus?.();
    const key = m.paused ? press(entry, ' ', 'Space', 32) : [];
    await sleep(160); if (m.paused) { entry.window.document.notifyUserGestureActivation(); try { m.play(); } catch (e) {} }
    const running = await waitFor(() => { const s = stateOf(entry); return !s.paused && s.sourcePlaying && s.context === 'running' && Number(s.progress) > 0.1; }, 2500, 50);
    const playing = stateOf(entry); if (m.active && !m.paused) { try { m.pause(); } catch (e) {} }
    await sleep(100); return { key, running, playing, paused: stateOf(entry) };
  };
  const instrument = (entry, voice, record) => {
    const original = voice?.getController, descriptor = voice ? Object.getOwnPropertyDescriptor(voice, 'getController') : null;
    if (typeof original !== 'function') return () => {};
    voice.getController = function (...args) { const controller = Reflect.apply(original, this, args); record.prepared = controller; try { const c = Cu.waiveXrays(controller), play = c._playAudioBuffer, pd = Object.getOwnPropertyDescriptor(c, '_playAudioBuffer'); c._playAudioBuffer = function (...playArgs) { record.targetPlays.push({ index: Number(c._position), offset: Number(playArgs[1]), context: c._audioContext?.state ?? null, at: Date.now() }); return Reflect.apply(play, this, playArgs); }; record.restorePrepared = () => { if (pd) Object.defineProperty(c, '_playAudioBuffer', pd); else delete c._playAudioBuffer; }; } catch (e) { record.error = String(e); } return controller; };
    return () => { if (descriptor) Object.defineProperty(voice, 'getController', descriptor); else delete voice.getController; };
  };
  const instrumentOld = (entry, record) => { const c = Cu.waiveXrays(entry.manager._controller), original = c?._playAudioBuffer, descriptor = c ? Object.getOwnPropertyDescriptor(c, '_playAudioBuffer') : null; if (typeof original !== 'function') return () => {}; c._playAudioBuffer = function (...args) { record.oldPlays.push({ index: Number(c._position), offset: Number(args[1]), at: Date.now() }); return Reflect.apply(original, this, args); }; return () => { if (descriptor) Object.defineProperty(c, '_playAudioBuffer', descriptor); else delete c._playAudioBuffer; }; };
  const choosePlayer = async (entry, id) => { const frame = entry.window.document.getElementById('ztts-player-frame'), doc = frame?.contentDocument; if (!doc) return { ok: false, reason: 'player frame missing' }; if (doc.querySelector('.voice-group')?.hidden) doc.querySelector('.options-toggle')?.click(); const picker = doc.querySelector('[data-pick="voice"]'); if (!picker) return { ok: false, reason: 'voice picker missing' }; picker.click(); await sleep(80); const options = doc.querySelectorAll('.option'); for (let i = 0; i < options.length; i++) if (String(options[i].textContent || '').includes('Issue 119 Fixture B')) { const text = String(options[i].textContent || '').trim(); options[i].click(); await sleep(80); return { ok: true, control: 'plugin-player voice picker click', text }; } return { ok: false, reason: 'target voice option missing' }; };
  const selectTarget = async (entry, route) => route === 'player' ? choosePlayer(entry, 'native119-b') : { ok: true, control: 'trusted Shift+.', key: press(entry, '.', 'Period', 190) };
  const finishAction = () => { try { Zotero.getMainWindow?.().minimize?.(); } catch (e) {} };
  const pausedOne = async (kind, route) => {
    const entry = await reopen(kind), start = await startAndPause(entry), m = entry.manager, old = m._controller, target = targetVoice(entry, 'native119-b');
    const record = { targetPlays: [], oldPlays: [], prepared: null, restorePrepared: null, error: null }, restoreFactory = instrument(entry, target, record), restoreOld = instrumentOld(entry, record), before = stateOf(entry);
    t.delayMs = 0; t.delayByVoice = {}; t.failVoiceID = null; t.noTimestampsVoiceID = null;
    let action; try { action = await selectTarget(entry, route); } catch (e) { action = { ok: false, reason: String(e) }; } finishAction();
    const requested = { state: stateOf(entry), notice: noticeOf(entry), handoff: handoffOf(entry) };
    const prepared = await waitFor(() => { const h = handoffOf(entry); return !!h?.audioReady?.length || h?.stage === 'failed'; }, 6000, 60);
    const ready = { state: stateOf(entry), notice: noticeOf(entry), handoff: handoffOf(entry), prepared: !!record.prepared, targetContext: record.prepared?._audioContext?.state ?? null, targetPlays: record.targetPlays.length, oldPlays: record.oldPlays.length };
    const targetWasSuspended = ready.targetContext === 'suspended';
    let playKey = []; if (m.paused) { playKey = press(entry, ' ', 'Space', 32); await sleep(180); if (m.paused) { entry.window.document.notifyUserGestureActivation(); try { m.play(); } catch (e) {} } } finishAction();
    const committed = await waitFor(() => { const h = handoffOf(entry); return h?.notice === 'selected' || h?.stage === 'failed' || (!h?.pending && h?.last); }, 7000, 60);
    const final = { state: stateOf(entry), notice: noticeOf(entry), handoff: handoffOf(entry), targetPlays: record.targetPlays.map(x => ({ ...x, at: x.at - Date.now() })), oldPlays: record.oldPlays.map(x => ({ ...x, at: x.at - Date.now() })) };
    const clock = !!start.running;
    const checks = { action: !!action?.ok, remainedPaused: requested.state.paused && ready.state.paused, noPreparationPlay: ready.targetPlays === 0 && ready.oldPlays === 0,
      readyNotice: ready.handoff?.notice === 'ready' && ready.notice.opacity === '0', targetFirstAfterPlay: record.targetPlays.length > 0 && record.oldPlays.length === 0,
      targetSelected: final.state.selected === 'native119-b', samePosition: final.handoff?.last?.index === before.position, targetSource: final.handoff?.last?.kind === 'word' };
    const result = { kind, route, start, action, requested, prepared, ready, playKey, committed, final,
      record: { targetPlays: record.targetPlays, oldPlays: record.oldPlays, error: record.error }, targetWasSuspended, checks,
      status: !clock ? 'NOT TESTABLE' : Object.values(checks).every(Boolean) ? 'PASS' : targetWasSuspended && !record.targetPlays.length ? 'NOT TESTABLE' : 'FAIL' };
    if (!clock) result.reason = 'native clock was unavailable in the preliminary probe';
    restoreFactory(); record.restorePrepared?.(); restoreOld(); t.delayMs = 0; t.delayByVoice = {};
    if (m.active && !m.paused) { try { m.pause(); } catch (e) {} }
    return result;
  };
  const earlyOne = async kind => {
    const entry = await reopen(kind), start = await startAndPause(entry), m = entry.manager, old = m._controller, target = targetVoice(entry, 'native119-b');
    const record = { targetPlays: [], oldPlays: [], prepared: null, restorePrepared: null, error: null }, restoreFactory = instrument(entry, target, record), restoreOld = instrumentOld(entry, record);
    t.delayMs = 0; t.delayByVoice = { 'native119-b': 2500 }; t.failVoiceID = null; t.noTimestampsVoiceID = null;
    let action; try { action = entry.window.document.getElementById('ztts-player-frame') ? await choosePlayer(entry, 'native119-b') : null; } catch (e) { action = { ok: false, reason: String(e) }; } finishAction();
    const requested = { state: stateOf(entry), notice: noticeOf(entry), handoff: handoffOf(entry) };
    let playKey = []; if (m.paused) { playKey = press(entry, ' ', 'Space', 32); await sleep(180); if (m.paused) { entry.window.document.notifyUserGestureActivation(); try { m.play(); } catch (e) {} } } finishAction();
    const early = { state: stateOf(entry), notice: noticeOf(entry), handoff: handoffOf(entry), oldPlays: record.oldPlays.length, targetPlays: record.targetPlays.length };
    const committed = await waitFor(() => { const h = handoffOf(entry); return h?.notice === 'selected' || h?.stage === 'failed' || (!h?.pending && h?.last); }, 9000, 60);
    const final = { state: stateOf(entry), notice: noticeOf(entry), handoff: handoffOf(entry) };
    const clock = !!start.running, checks = { action: !!action?.ok, oldResumedFirst: early.oldPlays > 0 && early.targetPlays === 0, noticeStayedPreparing: early.notice.opacity === '1' && early.handoff?.notice === 'preparing', targetSelected: final.state.selected === 'native119-b', noticeClearedAfterTarget: final.handoff?.notice === 'selected' && final.notice.opacity === '0', targetPlayed: record.targetPlays.length > 0 };
    const result = { kind, route: 'plugin-player voice picker then immediate Play', start, action, requested, early, committed, final,
      record: { targetPlays: record.targetPlays, oldPlays: record.oldPlays, error: record.error }, checks,
      status: !clock ? 'NOT TESTABLE' : Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL' };
    if (!clock) result.reason = 'native clock was unavailable in the preliminary probe';
    restoreFactory(); record.restorePrepared?.(); restoreOld(); t.delayMs = 0; t.delayByVoice = {};
    if (m.active && !m.paused) { try { m.pause(); } catch (e) {} }
    return result;
  };
  const fallbackOne = async (kind, scenario) => {
    // A short controlled sentence reaches the fallback boundary within the
    // bounded live window; the slow-source check uses a separate long buffer.
    t.audioDuration = 4;
    const entry = await reopen(kind), start = await startAndPause(entry), m = entry.manager, old = Cu.waiveXrays(m._controller), oldIndex = Number(old._position), target = targetVoice(entry, 'native119-b');
    if (!old || !target) throw new Error(`${kind} fallback fixture controller/target missing`);
    if (scenario === 'grouped') { const times = Array.from(old._currentTimestamps || []); if (times.length < 3) throw new Error(`${kind} grouped fallback needs word timings`); old._currentTimestamps = Cu.cloneInto([{ ...times[0], end: times[1].end, charEnd: times[1].charEnd }, ...times.slice(2)], entry.window); }
    const record = { targetPlays: [], oldPlays: [], prepared: null, restorePrepared: null, error: null }, restoreFactory = instrument(entry, target, record), restoreOld = instrumentOld(entry, record);
    t.delayMs = 0; t.delayByVoice = {}; t.failVoiceID = null; t.noTimestampsVoiceID = scenario === 'missing' ? 'native119-b' : null;
    let actionError = null; try { m.selectVoice('native119-b'); } catch (e) { actionError = String(e); } finishAction();
    const requested = { state: stateOf(entry), notice: noticeOf(entry), handoff: handoffOf(entry) };
    // Missing timing resolves as a no-timestamp response, while grouped timing
    // keeps the target prepared but cannot promise the paused word cut.
    const prepared = await waitFor(() => { const h = handoffOf(entry); return !!h?.audioReady?.length || h?.stage === 'failed'; }, 7000, 60);
    const ready = { state: stateOf(entry), notice: noticeOf(entry), handoff: handoffOf(entry), targetPlays: record.targetPlays.length, oldPlays: record.oldPlays.length };
    let playKey = []; if (m.paused) { playKey = press(entry, ' ', 'Space', 32); await sleep(180); if (m.paused) { entry.window.document.notifyUserGestureActivation(); try { m.play(); } catch (e) {} } } finishAction();
    const committed = await waitFor(() => { const h = handoffOf(entry); return h?.notice === 'selected' || h?.stage === 'failed' || (!h?.pending && h?.last); }, 10000, 60);
    const final = { state: stateOf(entry), notice: noticeOf(entry), handoff: handoffOf(entry), targetPlays: record.targetPlays, oldPlays: record.oldPlays };
    const clock = !!start.running, checks = { actionError: actionError === null, prepared, noTargetPlayBeforePlay: ready.targetPlays === 0, noticePreparingUntilFallback: ready.notice.opacity === '1' && ready.handoff?.notice === 'preparing', oldPlayed: record.oldPlays.length > 0,
      sentenceFallback: final.handoff?.last?.kind === 'sentence' && Number(final.handoff?.last?.index) === oldIndex + 1 && Number(final.handoff?.last?.offset) === 0,
      targetSelected: final.state.selected === 'native119-b', noSkip: Number(final.handoff?.last?.index) === oldIndex + 1 };
    const result = { kind, scenario, start, actionError, requested, prepared, ready, playKey, committed, final, checks, status: !clock ? 'NOT TESTABLE' : Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL' };
    if (!clock) result.reason = 'native clock was unavailable in the preliminary probe';
    restoreFactory(); record.restorePrepared?.(); restoreOld(); t.delayMs = 0; t.delayByVoice = {}; t.failVoiceID = null; t.noTimestampsVoiceID = null;
    if (m.active && !m.paused) { try { m.pause(); } catch (e) {} }
    return result;
  };
  const results = { paused: [], early: [], fallback: [] };
  for (const kind of ['pdf', 'epub']) { results.paused.push(await pausedOne(kind, kind === 'pdf' ? 'player' : 'shortcut')); t.pausedResults = results; }
  for (const kind of ['pdf', 'epub']) { results.early.push(await earlyOne(kind)); t.pausedResults = results; }
  for (const kind of ['pdf', 'epub']) for (const scenario of ['missing', 'grouped']) { results.fallback.push(await fallbackOne(kind, scenario)); t.pausedResults = results; }
  t.audioDuration = 20;
  t.pausedResults = results;
  const all = [...results.paused, ...results.early, ...results.fallback];
  if (all.some(row => row.status === 'FAIL')) throw new Error(`issue 119 paused/early/fallback failed: ${all.filter(row => row.status === 'FAIL').map(row => `${row.kind}/${row.scenario || 'paused'}`).join(', ')}`);
  return JSON.stringify({ status: all.every(row => row.status === 'PASS') ? 'PASS' : 'NOT TESTABLE', results }, null, 1);
})()
