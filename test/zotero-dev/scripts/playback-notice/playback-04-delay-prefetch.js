return (async () => {
  const t = Zotero.ZoteroTTSRun.state.transport, state = Zotero.ZoteroTTSRun.state;
  const Cu = Components.utils, sleep = ms => new Promise(resolve => setTimeout(resolve, Math.max(0, ms)));
  const waitFor = async (fn, ms = 9000, interval = 50) => {
    const end = Date.now() + ms;
    while (Date.now() < end) { if (fn()) return true; await sleep(interval); }
    return !!fn();
  };
  const noticeOf = entry => { try { const el = entry.window?.document?.getElementById('ztts-playback-notice'); return { exists: !!el, opacity: el?.style?.opacity ?? null, text: el ? String(el.textContent || '').trim() : null }; } catch (e) { return { exists: false, opacity: null, text: null, error: String(e) }; } };
  const diagOf = entry => { const d = JSON.parse(Zotero.ZoteroTTS.diagnostics.playbackNotice()), rows = d.readers || []; for (let i = 0; i < rows.length; i++) if (rows[i]?.itemID === entry.itemID) return rows[i]; return null; };
  const pausesOf = entry => { try { const d = JSON.parse(Zotero.ZoteroTTS.diagnostics.pauses()), rows = d || [], readers = Zotero.Reader._readers || []; let index = -1; for (let i = 0; i < readers.length; i++) if (readers[i]?.itemID === entry.itemID) { index = i; break; } return index >= 0 ? (rows[index] ?? null) : null; } catch (e) { return null; } };
  const stateOf = entry => { const m = Cu.waiveXrays(entry.manager), c = Cu.waiveXrays(m?._controller), a = c?._audioContext; return { active: !!m?.active, paused: !!m?.paused, position: Number.isFinite(c?._position) ? Number(c._position) : null, currentIndex: Number.isFinite(c?._currentIndex) ? Number(c._currentIndex) : null, playing: !!c?._isPlaying, context: a?.state ?? null, audioTime: Number.isFinite(a?.currentTime) ? Number(a.currentTime) : null }; };
  const host = () => Zotero.getMainWindow?.();
  const foreground = entry => { const w = host(); try { if (w?.windowState === 2) w.restore?.(); w?.focus?.(); w?.Zotero_Tabs?.select(entry.tabID); entry.reader?.focus?.(); entry.window?.focus?.(); } catch (e) {} };
  const minimize = () => { try { host()?.minimize?.(); } catch (e) {} };
  const clearBuffers = entry => { const c = Cu.waiveXrays(Cu.waiveXrays(entry.manager)?._controller); for (const key of ['_audioBuffers', '_segmentTimestamps', '_fetching']) { try { c?.[key]?.clear?.(); } catch (e) {} } try { c._currentBuffer = null; c._currentTimestamps = null; } catch (e) {} };
  const clickPlay = entry => { const doc = entry.window?.document?.getElementById('ztts-player-frame')?.contentDocument, button = doc?.querySelector('.play'); if (!button) return { ok: false, reason: 'player play control missing' }; const before = button.getAttribute('aria-label'); try { button.click(); return { ok: true, before, after: button.getAttribute('aria-label') }; } catch (e) { return { ok: false, before, error: String(e) }; } };
  const restorePref = (name, snap, type) => { const full = `extensions.zotero.zotero-tts.${name}`; if (snap?.user) { if (type === 'int') Services.prefs.setIntPref(full, Number(snap.value)); else Services.prefs.setBoolPref(full, !!snap.value); } else if (Services.prefs.prefHasUserValue(full)) Services.prefs.clearUserPref(full); };
  const runOne = async (entry, kind) => {
    const m = Cu.waiveXrays(entry.manager), baseline = state.baseline?.prefs || {}, oldEnabled = baseline['readAloud.sentenceDelayEnabled'], oldMs = baseline['readAloud.sentenceDelayMs'], oldParagraphEnabled = baseline['readAloud.paragraphDelayEnabled'], oldParagraphMs = baseline['readAloud.paragraphDelayMs'];
    const fullEnabled = 'extensions.zotero.zotero-tts.readAloud.sentenceDelayEnabled', fullMs = 'extensions.zotero.zotero-tts.readAloud.sentenceDelayMs', fullParagraphEnabled = 'extensions.zotero.zotero-tts.readAloud.paragraphDelayEnabled', fullParagraphMs = 'extensions.zotero.zotero-tts.readAloud.paragraphDelayMs';
    const originalDelay = 1000, record = { plays: [], speak: [], schedule: [], errors: [] }, trace = [], startedAt = Date.now(), callStart = (t.calls || []).length, responseStart = (t.responses || []).length;
    let controller = null, playDescriptor = null, speakDescriptor = null, scheduleDescriptor = null;
    const installHooks = () => {
      controller = Cu.waiveXrays(Cu.waiveXrays(entry.manager)?._controller);
      if (!controller) return;
      const play = controller._playAudioBuffer, speak = controller._speak, schedule = controller._scheduleSpeak;
      playDescriptor = Object.getOwnPropertyDescriptor(controller, '_playAudioBuffer');
      speakDescriptor = Object.getOwnPropertyDescriptor(controller, '_speak');
      scheduleDescriptor = Object.getOwnPropertyDescriptor(controller, '_scheduleSpeak');
      if (typeof play === 'function') controller._playAudioBuffer = function (...args) { const self = Cu.waiveXrays(this), before = { notice: noticeOf(entry), diagnostic: diagOf(entry) }; let out; try { out = Reflect.apply(play, this, args); } catch (e) { record.errors.push(String(e)); throw e; } record.plays.push({ at: Date.now(), index: Number(self?._position), offset: Number(args[1]), context: self?._audioContext?.state ?? null, before, after: { notice: noticeOf(entry), diagnostic: diagOf(entry) } }); if (record.plays.length === 1) t.delayByVoice = { 'native119-a': 5000 }; return out; };
      if (typeof speak === 'function') controller._speak = function (...args) { const self = Cu.waiveXrays(this); record.speak.push({ at: Date.now(), index: Number(self?._position), args: args.length }); return Reflect.apply(speak, this, args); };
      if (typeof schedule === 'function') controller._scheduleSpeak = function (...args) { const self = Cu.waiveXrays(this); record.schedule.push({ at: Date.now(), index: Number(self?._position), args: args.length }); return Reflect.apply(schedule, this, args); };
    };
    const restoreHooks = () => { try { if (controller) { if (playDescriptor) Object.defineProperty(controller, '_playAudioBuffer', playDescriptor); else delete controller._playAudioBuffer; if (speakDescriptor) Object.defineProperty(controller, '_speak', speakDescriptor); else delete controller._speak; if (scheduleDescriptor) Object.defineProperty(controller, '_scheduleSpeak', scheduleDescriptor); else delete controller._scheduleSpeak; } } catch (e) {} };
    const sample = label => trace.push({ label, elapsedMs: Date.now() - startedAt, state: stateOf(entry), notice: noticeOf(entry), diagnostic: diagOf(entry), pauses: pausesOf(entry), calls: (t.calls || []).length - callStart, responses: (t.responses || []).length - responseStart });
    try {
      restorePref('readAloud.sentenceDelayEnabled', oldEnabled, 'bool');
      restorePref('readAloud.sentenceDelayMs', oldMs, 'int');
      restorePref('readAloud.paragraphDelayEnabled', oldParagraphEnabled, 'bool');
      restorePref('readAloud.paragraphDelayMs', oldParagraphMs, 'int');
      Services.prefs.setBoolPref(fullEnabled, true); Services.prefs.setIntPref(fullMs, originalDelay);
      Services.prefs.setBoolPref(fullParagraphEnabled, false); Services.prefs.setIntPref(fullParagraphMs, 0);
      await m.pause?.(); await sleep(100); clearBuffers(entry);
      t.audioDuration = 0.7; t.delayMs = 0; t.delayByVoice = { 'native119-a': 0 }; t.failVoiceID = null; t.noTimestampsVoiceID = null;
      installHooks(); foreground(entry); const action = clickPlay(entry); minimize(); sample('after-player-play');
      await waitFor(() => record.plays.length > 0, 3000, 30); sample('first-source-start');
      try { const c = Cu.waiveXrays(Cu.waiveXrays(entry.manager)?._controller), context = c?._audioContext; if (context?.state !== 'running') { entry.window.document.notifyUserGestureActivation(); const resumed = context?.resume?.(); if (resumed?.then) await Promise.race([resumed, sleep(1000)]); } } catch (e) {}
      for (let elapsed = 100; elapsed <= 7600; elapsed += 100) { await sleep(elapsed - (Date.now() - startedAt)); sample(`at-${elapsed}ms`); }
      const firstPlay = record.plays[0] || null, firstPostSpeak = firstPlay ? record.speak.find(row => row.at > firstPlay.at + 50) : null;
      const inSource = firstPlay ? trace.filter(row => row.elapsedMs >= firstPlay.at - startedAt && row.elapsedMs < (firstPlay.at - startedAt + 700)) : [];
      const delayRows = trace.filter(row => row.diagnostic?.phase === 'delay');
      const pauseRows = trace.map(row => row.pauses?.last).filter(row => row && firstPlay && Number(row.at) > Number(firstPlay.at));
      const firstGap = pauseRows[0] || null;
      const gapScheduledAt = firstGap ? Number(firstGap.at) - startedAt : null;
      const gapDueAt = firstGap && Number.isFinite(gapScheduledAt) ? gapScheduledAt + Number(firstGap.delay) : null;
      const calls = (t.calls || []).slice(callStart).map(row => ({ id: row.id, kind: row.kind, voiceID: row.voiceID, at: row.at - startedAt }));
      const prefetchCall = calls.find(row => row.kind === 'segment' && row.at > (firstPlay ? firstPlay.at - startedAt : 0));
      const speakAt = firstPostSpeak ? firstPostSpeak.at - startedAt : null, jitterMs = 40, gapBoundary = gapDueAt ?? (speakAt === null ? null : speakAt), thresholdAt = speakAt === null ? (gapBoundary === null ? null : gapBoundary + 300) : speakAt + 300;
      const nextVisible = thresholdAt === null ? null : trace.find(row => row.elapsedMs >= thresholdAt - jitterMs && row.notice?.opacity === '1');
      const visibleAfterDelay = nextVisible && gapScheduledAt !== null ? nextVisible.elapsedMs - gapScheduledAt : null, visibleAfterSpeak = nextVisible && (speakAt ?? gapDueAt) !== null ? nextVisible.elapsedMs - (speakAt ?? gapDueAt) : null;
      const noNoticeBeforeSpeakThreshold = gapScheduledAt !== null && thresholdAt !== null && trace.filter(row => row.elapsedMs >= gapScheduledAt && row.elapsedMs < thresholdAt - jitterMs).every(row => row.notice?.opacity !== '1');
      const runningSourceSamples = trace.filter(row => row.state?.context === 'running' && row.state?.playing), runningSourceRecords = record.plays.filter(row => row.context === 'running');
      const checks = { actualPlayerControl: action.ok, sourceStartedRunning: runningSourceRecords.length > 0,
        currentSourcePlayingNoNotice: (runningSourceSamples.length > 0 && runningSourceSamples.every(row => row.notice?.opacity !== '1')) || runningSourceRecords.some(row => row.at - startedAt > (firstPlay ? firstPlay.at - startedAt : 0) && row.before?.notice?.opacity !== '1'),
        prefetchObserved: !!prefetchCall, prefetchNoNotice: !!prefetchCall && ((trace.filter(row => row.state?.context === 'running' && row.state?.playing && row.elapsedMs >= prefetchCall.at && row.elapsedMs < (nextVisible?.elapsedMs ?? Infinity)).length > 0 && trace.filter(row => row.state?.context === 'running' && row.state?.playing && row.elapsedMs >= prefetchCall.at && row.elapsedMs < (nextVisible?.elapsedMs ?? Infinity)).every(row => row.notice?.opacity !== '1')) || runningSourceRecords.some(row => row.at - startedAt >= prefetchCall.at && row.before?.notice?.opacity !== '1')),
        delayObserved: delayRows.length > 0 && firstGap !== null, noNoticeDuringDelay: firstGap !== null && trace.filter(row => row.elapsedMs >= gapScheduledAt && row.elapsedMs < gapDueAt).every(row => row.notice?.opacity !== '1'),
        nextWaitShown: !!nextVisible && nextVisible.diagnostic?.preparingRequested === true,
        thresholdAfterDelay: thresholdAt !== null && visibleAfterSpeak !== null && visibleAfterSpeak >= 300 - jitterMs && noNoticeBeforeSpeakThreshold,
        clearsAtNextSource: record.plays.slice(1).some(row => row.before?.notice?.opacity === '1' && row.after?.notice?.opacity === '0') };
      const result = { kind, status: Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL', configuredDelayMs: originalDelay, action, firstSourceStartMs: firstPlay ? firstPlay.at - startedAt : null, gapScheduledAtMs: gapScheduledAt, gapDueAtMs: gapDueAt, postGapSpeakMs: speakAt, thresholdAtMs: thresholdAt, schedulerJitterMs: jitterMs, firstVisibleMs: nextVisible?.elapsedMs ?? null, visibleAfterDelayMs: visibleAfterDelay, visibleAfterSpeakMs: visibleAfterSpeak, speak: record.speak.map(row => ({ at: row.at - startedAt, index: row.index })), schedule: record.schedule.map(row => ({ at: row.at - startedAt, index: row.index })), sourceStarts: record.plays.map(row => ({ at: row.at - startedAt, index: row.index, offset: row.offset, context: row.context, before: row.before, after: row.after })), calls, trace: [trace[0], ...trace.filter(row => row.notice?.opacity === '1' || row.diagnostic?.phase === 'delay').slice(0, 4), ...trace.slice(-3)], checks };
      return result;
    } finally {
      try { if (m.active && !m.paused) m.pause(); } catch (e) {}
      restoreHooks(); t.delayByVoice = {}; t.delayMs = 0; t.audioDuration = 20;
      restorePref('readAloud.sentenceDelayEnabled', oldEnabled, 'bool'); restorePref('readAloud.sentenceDelayMs', oldMs, 'int'); restorePref('readAloud.paragraphDelayEnabled', oldParagraphEnabled, 'bool'); restorePref('readAloud.paragraphDelayMs', oldParagraphMs, 'int');
      minimize();
    }
  };
  const results = [];
  for (const kind of ['pdf', 'epub']) { const entry = t.readers?.[kind]; if (!entry) throw new Error(`${kind} transport reader missing`); results.push(await runOne(entry, kind)); }
  state.delayResults = results;
  return JSON.stringify({ status: results.every(row => row.status === 'PASS') ? 'PASS' : 'FAIL', results }, null, 1);
})()
