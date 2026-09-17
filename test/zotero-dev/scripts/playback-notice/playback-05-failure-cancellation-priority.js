return (async () => {
  const t = Zotero.ZoteroTTSRun.state.transport, state = Zotero.ZoteroTTSRun.state, Cu = Components.utils;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, Math.max(0, ms)));
  const waitFor = async (fn, ms = 5000, interval = 50) => { const end = Date.now() + ms; while (Date.now() < end) { if (fn()) return true; await sleep(interval); } return !!fn(); };
  const findReader = itemID => { const rows = Zotero.Reader._readers || []; for (let i = 0; i < rows.length; i++) if (rows[i]?.itemID === itemID) return rows[i]; return null; };
  const noticeOf = (entry, id = 'ztts-playback-notice') => { try { const el = entry.window?.document?.getElementById(id); return { exists: !!el, opacity: el?.style?.opacity ?? null, text: el ? String(el.textContent || '').trim() : null }; } catch (e) { return { exists: false, opacity: null, text: null, error: String(e) }; } };
  const diagOf = entry => { const d = JSON.parse(Zotero.ZoteroTTS.diagnostics.playbackNotice()), rows = d.readers || []; for (let i = 0; i < rows.length; i++) if (rows[i]?.itemID === entry.itemID) return rows[i]; return null; };
  const voiceDiagOf = entry => { const d = JSON.parse(Zotero.ZoteroTTS.diagnostics.voiceSwitch()), rows = d.readers || []; for (let i = 0; i < rows.length; i++) if (rows[i]?.itemID === entry.itemID) return rows[i]; return null; };
  const stateOf = entry => { const m = Cu.waiveXrays(entry.manager), c = Cu.waiveXrays(m?._controller), a = c?._audioContext; return { active: !!m?.active, paused: !!m?.paused, selected: m?.selectedVoiceID ?? null, position: Number.isFinite(c?._position) ? Number(c._position) : null, sourcePlaying: !!c?._isPlaying, source: !!c?._sourceNode, context: a?.state ?? null }; };
  const host = () => Zotero.getMainWindow?.();
  const foreground = entry => { const w = host(); try { if (w?.windowState === 2) w.restore?.(); w?.focus?.(); w?.Zotero_Tabs?.select(entry.tabID); entry.reader?.focus?.(); entry.window?.focus?.(); } catch (e) {} };
  const minimize = () => { try { host()?.minimize?.(); } catch (e) {} };
  const clearBuffers = entry => { const c = Cu.waiveXrays(Cu.waiveXrays(entry.manager)?._controller); for (const key of ['_audioBuffers', '_segmentTimestamps', '_fetching']) { try { c?.[key]?.clear?.(); } catch (e) {} } try { c._currentBuffer = null; c._currentTimestamps = null; } catch (e) {} };
  const clickPlay = entry => { const doc = entry.window?.document?.getElementById('ztts-player-frame')?.contentDocument, button = doc?.querySelector('.play'); if (!button) return { ok: false, reason: 'player play control missing' }; const before = button.getAttribute('aria-label'); try { button.click(); return { ok: true, before, after: button.getAttribute('aria-label') }; } catch (e) { return { ok: false, before, error: String(e) }; } };
  const instrument = (entry, record) => { const c = Cu.waiveXrays(Cu.waiveXrays(entry.manager)?._controller), original = c?._playAudioBuffer, descriptor = c ? Object.getOwnPropertyDescriptor(c, '_playAudioBuffer') : null; if (!c || typeof original !== 'function') return () => {}; c._playAudioBuffer = function (...args) { const self = Cu.waiveXrays(this); let out; try { out = Reflect.apply(original, this, args); } catch (e) { record.errors.push(String(e)); throw e; } record.plays.push({ at: Date.now(), index: Number(self?._position), offset: Number(args[1]), context: self?._audioContext?.state ?? null, before: { notice: noticeOf(entry), diagnostic: diagOf(entry) }, after: { notice: noticeOf(entry), diagnostic: diagOf(entry) } }); return out; }; return () => { try { if (descriptor) Object.defineProperty(c, '_playAudioBuffer', descriptor); else delete c._playAudioBuffer; } catch (e) {} }; };
  const setRemote = (entry, remote) => { const options = Cu.waiveXrays(entry.manager._options), internal = Cu.waiveXrays(entry.internal); const injected = Cu.cloneInto(remote, entry.window, { cloneFunctions: true }); options.remoteInterface = injected; internal._readAloudRemoteInterface = injected; return () => { try { options.remoteInterface = entry.originalRemote; internal._readAloudRemoteInterface = entry.originalInternalRemote; } catch (e) {} }; };
  const openFresh = async (kind, remote) => {
    const previous = t.readers?.[kind], itemID = (state.fixtures || []).find(row => row.kind === kind)?.itemID;
    try { previous?.internal?.toggleReadAloudPopup(false); } catch (e) {}
    try { previous?.reader?.close?.(); } catch (e) {}
    await waitFor(() => !findReader(itemID), 5000, 50);
    Services.prefs.setStringPref('extensions.zotero.zotero-tts.readAloud.memory', JSON.stringify({ speed: 1, voice: { id: 'native119-a', lang: 'en' } }));
    Zotero.Reader.open(itemID);
    let reader = null;
    for (let i = 0; i < 100; i++) { reader = findReader(itemID); if (reader?._internalReader?._readAloudManager) break; await sleep(60); }
    if (!reader?._internalReader?._readAloudManager) throw new Error(`${kind} fresh manager did not appear`);
    await sleep(300);
    const internal = reader._internalReader, manager = internal._readAloudManager, options = Cu.waiveXrays(manager._options), internalWaived = Cu.waiveXrays(internal), originalRemote = options.remoteInterface, originalInternalRemote = internalWaived._readAloudRemoteInterface;
    t.window = reader._iframeWindow;
    const injected = Cu.cloneInto(remote || t.nativeStub, reader._iframeWindow, { cloneFunctions: true });
    options.remoteInterface = injected; internalWaived._readAloudRemoteInterface = injected;
    const entry = { itemID, tabID: reader.tabID, reader, internal, manager, window: reader._iframeWindow, originalRemote, originalInternalRemote };
    t.readers[kind] = entry;
    try { host()?.Zotero_Tabs?.select(reader.tabID); reader.focus?.(); reader._iframeWindow?.focus?.(); } catch (e) {}
    try { internal.toggleReadAloudPopup(true); } catch (e) {}
    const ready = await waitFor(() => manager.allVoices?.length && manager._segments?.length && manager.selectedVoiceID, 10000, 60);
    if (!ready) throw new Error(`${kind} fresh native transport did not load`);
    return entry;
  };
  const failureRemote = entry => {
    const original = t.nativeStub.getAudio, clone = (value, target) => Cu.cloneInto(value, target, { cloneFunctions: true });
    const remote = { getVoices: t.nativeStub.getVoices, getCreditsRemaining: t.nativeStub.getCreditsRemaining, resetCredits: t.nativeStub.resetCredits,
      getAudio: function (segment, voice) {
        const target = (() => { try { return Cu.getGlobalForObject(segment); } catch (e) { return t.window; } })();
        const voiceID = String(voice?.id ?? '');
        if (voiceID !== 'native119-a' || !t.failNoText) return Reflect.apply(original, this, arguments);
        const call = { id: ++t.nextCall, kind: 'segment', voiceID, text: String(segment?.text ?? ''), at: Date.now() }; t.calls.push(call);
        const result = () => { t.responses.push({ callId: call.id, kind: call.kind, voiceID, ok: false, error: null, at: Date.now() }); return clone({ audio: null, error: null, noStore: true }, target); };
        if (target?.Promise) return new target.Promise(resolve => target.setTimeout(() => resolve(result()), 700));
        return result();
      } };
    return remote;
  };
  const failureOne = async (kind) => {
    t.audioDuration = 4; t.delayMs = 0; t.delayByVoice = { 'native119-a': 700 }; t.failVoiceID = null; t.failNoText = true; t.noTimestampsVoiceID = null;
    const entry = await openFresh(kind, failureRemote()), m = Cu.waiveXrays(entry.manager), action = { ok: true, label: 'native player popup autoplay' }, record = { plays: [], errors: [] }, restoreHook = instrument(entry, record), startedAt = Date.now();
    await sleep(350); const preparing = { at: Date.now() - startedAt, notice: noticeOf(entry), diagnostic: diagOf(entry), state: stateOf(entry) };
    const failed = await waitFor(() => diagOf(entry)?.phase === 'failed', 3000, 40); const failureResponse = (t.responses || []).slice().reverse().find(row => row.voiceID === 'native119-a' && row.ok === false) || null; const failure = { at: Date.now() - startedAt, notice: noticeOf(entry), diagnostic: diagOf(entry), state: stateOf(entry), sourceStarts: record.plays.length, response: failureResponse ? { ok: failureResponse.ok, error: failureResponse.error ?? null, at: failureResponse.at - startedAt } : null };
    restoreHook(); t.failNoText = false; t.failVoiceID = null; t.delayByVoice = {};
    const restoreNative = setRemote(entry, t.nativeStub); clearBuffers(entry); const retryRecord = { plays: [], errors: [] }, retryRestore = instrument(entry, retryRecord); foreground(entry); try { entry.window.document.notifyUserGestureActivation(); } catch (e) {} const retryAction = clickPlay(entry, 'player .play (retry)'); minimize();
    await sleep(150); if (Cu.waiveXrays(m._controller)?._audioContext?.state !== 'running') { try { entry.window.document.notifyUserGestureActivation(); m.play(); } catch (e) {} }
    const retried = await waitFor(() => retryRecord.plays.length > 0 && diagOf(entry)?.phase === 'playing' && stateOf(entry).context === 'running', 5000, 40); const retry = { at: Date.now() - startedAt, notice: noticeOf(entry), diagnostic: diagOf(entry), state: stateOf(entry), sourceStarts: retryRecord.plays.length, play: retryRecord.plays[retryRecord.plays.length - 1] || null };
    try { if (m.active && !m.paused) m.pause(); } catch (e) {} retryRestore(); restoreNative(); t.delayByVoice = {}; t.delayMs = 0;
    const checks = { playerAction: action.ok, preparingVisible: preparing.notice.opacity === '1' && /Preparing…|正在准备/.test(preparing.notice.text || ''), failedPhase: failed && failure.diagnostic?.phase === 'failed', localizedFailure: failure.notice.opacity === '1' && /Unable to prepare|无法准备/.test(failure.notice.text || ''), failureNoNativeText: failure.response?.error === null, noFailedSource: failure.sourceStarts === 0, retryAction: retryAction.ok, retryStarted: retried && retry.state.context === 'running', retryCleared: retry.notice.opacity === '0' && retry.diagnostic?.phase === 'playing' };
    return { kind, scenario: 'failure-and-retry', status: Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL', action, retryAction, preparing, failure, retry, checks };
  };
  const cancelOne = async (kind) => {
    t.audioDuration = 4; t.delayMs = 0; t.delayByVoice = { 'native119-a': 1600 }; t.failVoiceID = null; t.failNoText = false;
    const entry = await openFresh(kind, t.nativeStub), m = Cu.waiveXrays(entry.manager); try { if (m.active && !m.paused) m.pause(); } catch (e) {} await sleep(1800); clearBuffers(entry); t.delayByVoice = { 'native119-a': 1600 }; const record = { plays: [], errors: [] }, restore = instrument(entry, record); foreground(entry); try { entry.window.document.notifyUserGestureActivation(); } catch (e) {} const action = clickPlay(entry, 'player .play (cancel)'); await sleep(80); if (m.paused) { try { entry.window.document.notifyUserGestureActivation(); m.play(); } catch (e) {} } minimize(); const startedAt = Date.now(); await sleep(350);
    const pending = { at: Date.now() - startedAt, notice: noticeOf(entry), diagnostic: diagOf(entry), state: stateOf(entry) };
    let closeError = null; try { entry.internal.toggleReadAloudPopup(false); } catch (e) { closeError = String(e); } await sleep(200); const canceled = { at: Date.now() - startedAt, notice: noticeOf(entry), diagnostic: diagOf(entry), state: stateOf(entry), sourceStarts: record.plays.length };
    await sleep(1700); const late = { at: Date.now() - startedAt, notice: noticeOf(entry), diagnostic: diagOf(entry), state: stateOf(entry), sourceStarts: record.plays.length, responses: (t.responses || []).slice(-3).map(row => ({ voiceID: row.voiceID, ok: row.ok, at: row.at - startedAt })) };
    const itemID = entry.itemID; let closeReaderError = null; try { entry.reader.close?.(); } catch (e) { closeReaderError = String(e); } const gone = await waitFor(() => { const rows = Zotero.Reader._readers || []; for (let i = 0; i < rows.length; i++) if (rows[i]?.itemID === itemID) return false; return true; }, 5000, 60); const closed = { readerGone: gone, notice: noticeOf(entry), sourceStarts: record.plays.length };
    restore(); t.delayByVoice = {}; t.delayMs = 0;
    const checks = { playerAction: action.ok, pendingVisible: pending.notice.opacity === '1' && pending.diagnostic?.preparingRequested === true, closePopup: !closeError, popupClears: canceled.notice.opacity !== '1' && canceled.diagnostic?.preparingRequested !== true, lateNoSource: late.sourceStarts === 0, lateResponseObserved: late.responses.some(row => row.voiceID === 'native119-a'), readerClosed: closed.readerGone, noClosedSource: closed.sourceStarts === 0 };
    return { kind, scenario: 'pending-cancellation-and-close', status: Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL', action, closeError, closeReaderError, pending, canceled, late, closed, checks };
  };
  const failureResults = [], cancellationResults = [];
  for (const kind of ['pdf', 'epub']) failureResults.push(await failureOne(kind));
  for (const kind of ['pdf', 'epub']) { cancellationResults.push(await cancelOne(kind)); state.failureResults = { failure: failureResults, cancellation: cancellationResults }; }
  state.failureResults = { failure: failureResults, cancellation: cancellationResults };
  const all = [...failureResults, ...cancellationResults];
  return JSON.stringify({ status: all.every(row => row.status === 'PASS') ? 'PASS' : 'FAIL', failure: failureResults, cancellation: cancellationResults, voicePriority: 'covered by playback-06-voice-priority.js in this kit' }, null, 1);
})()
