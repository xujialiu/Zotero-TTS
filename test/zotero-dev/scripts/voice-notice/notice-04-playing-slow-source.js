return (async () => {
  const t = Zotero.ZoteroTTSRun.state.transport, Cu = Components.utils;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const waitFor = async (fn, ms = 9000, interval = 50) => { const end = Date.now() + ms; while (Date.now() < end) { if (fn()) return true; await sleep(interval); } return !!fn(); };
  const stateOf = entry => { const m = entry.manager, c = m?._controller, a = c?._audioContext; return {
    active: !!m?.active, paused: !!m?.paused, selected: m?.selectedVoiceID ?? null,
    position: Number.isFinite(c?._position) ? c._position : null, progress: Number.isFinite(c?._currentPlaybackTime) ? c._currentPlaybackTime : null,
    currentIndex: Number.isFinite(c?._currentIndex) ? c._currentIndex : null, sourcePlaying: !!c?._isPlaying,
    source: !!c?._sourceNode, context: a?.state ?? null, audioTime: Number.isFinite(a?.currentTime) ? a.currentTime : null,
  }; };
  const noticeOf = entry => { const el = entry.window?.document?.getElementById('ztts-voice-notice'); return {
    exists: !!el, opacity: el?.style?.opacity ?? null, text: el ? String(el.textContent || '').trim() : null,
    transition: el?.style?.transition ?? null,
  }; };
  const handoffOf = entry => { const all = JSON.parse(Zotero.ZoteroTTS.diagnostics.voiceSwitch()), index = (Zotero.Reader._readers || []).indexOf(entry.reader); return all.readers?.[index]?.handoff ?? null; };
  const press = (entry, key, code, keyCode) => { const rw = entry.window, tip = Components.classes['@mozilla.org/text-input-processor;1'].createInstance(Components.interfaces.nsITextInputProcessor), K = rw.KeyboardEvent;
    const ev = (value, valueCode, valueKeyCode, shiftKey = false) => new K('', { key: value, code: valueCode, keyCode: valueKeyCode, bubbles: true, cancelable: true, shiftKey });
    tip.beginInputTransactionForTests(rw); const ret = [tip.keydown(ev('Shift', 'ShiftLeft', 16)), tip.keydown(ev(key, code, keyCode, true)), tip.keyup(ev(key, code, keyCode, true)), tip.keyup(ev('Shift', 'ShiftLeft', 16))];
    if (typeof tip.endInputTransaction === 'function') tip.endInputTransaction(); return ret; };
  const targetVoice = (entry, id) => { const values = Cu.waiveXrays(entry.manager.allVoices) || []; for (let i = 0; i < values.length; i++) if (String(values[i]?.id ?? '') === id) return values[i]; return null; };
  const instrument = (entry, voice, record) => {
    const original = voice?.getController, descriptor = voice ? Object.getOwnPropertyDescriptor(voice, 'getController') : null;
    if (typeof original !== 'function') return () => {};
    voice.getController = function (...args) {
      const controller = Reflect.apply(original, this, args); record.prepared = controller; record.preparedAt = Date.now();
      try {
        const c = Cu.waiveXrays(controller), play = c._playAudioBuffer, playDescriptor = Object.getOwnPropertyDescriptor(c, '_playAudioBuffer');
        c._playAudioBuffer = function (...playArgs) { const before = noticeOf(entry), result = Reflect.apply(play, this, playArgs); record.plays.push({ index: Number(c._position), offset: Number(playArgs[1]), before, after: noticeOf(entry), context: c._audioContext?.state ?? null, playing: !!c._isPlaying, at: Date.now() }); return result; };
        record.restorePrepared = () => { if (playDescriptor) Object.defineProperty(c, '_playAudioBuffer', playDescriptor); else delete c._playAudioBuffer; };
      } catch (e) { record.patchError = String(e); }
      return controller;
    };
    return () => { if (descriptor) Object.defineProperty(voice, 'getController', descriptor); else delete voice.getController; };
  };
  const instrumentOld = (old, entry, record) => { const c = Cu.waiveXrays(old), original = c?._playAudioBuffer, descriptor = c ? Object.getOwnPropertyDescriptor(c, '_playAudioBuffer') : null; if (typeof original !== 'function') return () => {};
    c._playAudioBuffer = function (...args) { record.oldPlays.push({ index: Number(c._position), offset: Number(args[1]), at: Date.now() }); return Reflect.apply(original, this, args); };
    return () => { if (descriptor) Object.defineProperty(c, '_playAudioBuffer', descriptor); else delete c._playAudioBuffer; }; };
  const choosePluginVoice = async (entry, id) => {
    const frame = entry.window?.document?.getElementById('ztts-player-frame'), doc = frame?.contentDocument;
    if (!frame || !doc) return { ok: false, reason: 'plugin player frame missing' };
    if (doc.querySelector('.voice-group')?.hidden) doc.querySelector('.options-toggle')?.click();
    const picker = doc.querySelector('[data-pick="voice"]'); if (!picker) return { ok: false, reason: 'voice picker missing' };
    picker.click(); await sleep(100);
    const options = doc.querySelectorAll('.option'); let option = null;
    for (let i = 0; i < options.length; i++) if (String(options[i].textContent || '').includes('Issue 119 Fixture B')) { option = options[i]; break; }
    if (!option) return { ok: false, reason: 'target voice option missing', options: Array.from(options).map(o => String(o.textContent || '').trim()).slice(0, 12) };
    option.click(); await sleep(80); return { ok: true, control: 'plugin-player voice picker click', text: String(option.textContent || '').trim() };
  };
  const startOld = async entry => {
    const m = entry.manager; Zotero.getMainWindow?.().Zotero_Tabs?.select(entry.tabID); entry.reader.focus?.(); entry.window.focus?.();
    const key = m.paused ? press(entry, ' ', 'Space', 32) : [];
    await sleep(180); if (m.paused) { entry.window.document.notifyUserGestureActivation(); try { m.play(); } catch (e) {} }
    const running = await waitFor(() => { const s = stateOf(entry); return !s.paused && s.sourcePlaying && s.context === 'running' && Number(s.progress) > 0.1; }, 2500);
    return { key, running, state: stateOf(entry) };
  };
  const runOne = async (kind, route) => {
    const entry = t.readers[kind], m = entry.manager, targetID = 'native119-b', target = targetVoice(entry, targetID);
    if (!target) throw new Error(`${kind} target voice is missing`);
    const start = await startOld(entry), old = m._controller, record = { prepared: null, preparedAt: null, plays: [], oldPlays: [], patchError: null, restorePrepared: null };
    const restoreFactory = instrument(entry, target, record), restoreOld = instrumentOld(old, entry, record), trace = [];
    const callStart = Date.now(); t.delayMs = 0; t.delayByVoice = { [targetID]: 5200 }; t.failVoiceID = null; t.noTimestampsVoiceID = null;
    let action = null, actionError = null;
    try { action = route === 'player' ? await choosePluginVoice(entry, targetID) : { ok: true, key: press(entry, '.', 'Period', 190), control: 'trusted Shift+.' }; }
    catch (e) { actionError = String(e); }
    // The player picker and trusted shortcut are foreground-dependent. Return
    // Zotero to the user's taskbar immediately after that input.
    try { Zotero.getMainWindow?.().minimize?.(); } catch (e) {}
    const sample = label => trace.push({ label, elapsedMs: Date.now() - callStart, state: stateOf(entry), notice: noticeOf(entry), handoff: handoffOf(entry), prepared: !!record.prepared, preparedPlays: record.plays.length, oldPlays: record.oldPlays.length });
    sample('after-action');
    for (const wait of [1000, 3000, 5100]) { await sleep(wait - (Date.now() - callStart)); sample(`at-${wait}ms`); }
    const targetReady = await waitFor(() => { const h = handoffOf(entry); return !!h?.audioReady?.length || h?.stage === 'failed' || h?.stage === 'cancelled'; }, 2500, 50);
    sample('target-ready-or-terminal');
    const terminal = await waitFor(() => { const h = handoffOf(entry); return h?.notice === 'selected' || h?.stage === 'failed' || h?.stage === 'cancelled' || !h?.pending; }, 4500, 50);
    sample('terminal');
    const final = trace[trace.length - 1], clock = start.running;
    const preparedAfterFive = trace.find(row => row.label === 'at-5100ms');
    const sourceStarted = record.plays.length > 0 && record.plays[0].context === 'running';
    const result = { kind, route, status: 'FAIL', start, action, actionError, trace,
      targetReady, terminal, preparedControllerAdopted: !!record.prepared, record: { preparedAt: record.preparedAt ? record.preparedAt - callStart : null,
        plays: record.plays.map(row => ({ ...row, at: row.at - callStart })), oldPlays: record.oldPlays.map(row => ({ ...row, at: row.at - callStart })), patchError: record.patchError },
      checks: { noticePreparing: trace[0]?.handoff?.notice === 'preparing' && trace[0]?.notice?.opacity === '1',
        noticeVisibleOverFiveSeconds: preparedAfterFive?.notice?.opacity === '1', noticeSelected: final?.handoff?.notice === 'selected' && final?.notice?.opacity === '0',
        oldControllerBeforeStart: trace[0]?.state?.selected === 'native119-a', sourceStarted, targetSelected: final?.state?.selected === targetID, clock } };
    result.status = !clock ? 'NOT TESTABLE' : Object.values(result.checks).every(Boolean) ? 'PASS' : 'FAIL';
    if (!clock) result.reason = 'the preliminary muted native AudioContext probe did not show a running clock';
    restoreFactory(); record.restorePrepared?.(); restoreOld(); t.delayMs = 0; t.delayByVoice = {};
    if (m.active && !m.paused) { try { m.pause(); } catch (e) {} }
    return result;
  };
  const results = [await runOne('pdf', 'player'), await runOne('epub', 'shortcut')];
  t.playingResults = results;
  if (results.some(row => row.status === 'FAIL')) throw new Error(`issue 119 playing notice failed: ${results.filter(row => row.status === 'FAIL').map(row => row.kind).join(', ')}`);
  return JSON.stringify({ status: results.every(row => row.status === 'PASS') ? 'PASS' : 'NOT TESTABLE', results }, null, 1);
})()
