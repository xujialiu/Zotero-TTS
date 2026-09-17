return (async () => {
  const t = Zotero.ZoteroTTSRun.state.transport;
  const Cu = Components.utils;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, Math.max(0, ms)));
  const waitFor = async (fn, ms = 5000, interval = 40) => {
    const end = Date.now() + ms;
    while (Date.now() < end) { if (fn()) return true; await sleep(interval); }
    return !!fn();
  };
  const stateOf = entry => {
    const m = Cu.waiveXrays(entry.manager), c = Cu.waiveXrays(m?._controller), a = c?._audioContext;
    return { active: !!m?.active, paused: !!m?.paused, selected: m?.selectedVoiceID ?? null,
      position: Number.isFinite(c?._position) ? Number(c._position) : null,
      currentIndex: Number.isFinite(c?._currentIndex) ? Number(c._currentIndex) : null,
      sourcePlaying: !!c?._isPlaying, source: !!c?._sourceNode, buffering: !!c?._buffering,
      context: a?.state ?? null, audioTime: Number.isFinite(a?.currentTime) ? Number(a.currentTime) : null };
  };
  const noticeOf = entry => {
    const el = entry.window?.document?.getElementById('ztts-playback-notice');
    return { exists: !!el, opacity: el?.style?.opacity ?? null, text: el ? String(el.textContent || '').trim() : null };
  };
  const diagOf = entry => {
    const d = JSON.parse(Zotero.ZoteroTTS.diagnostics.playbackNotice()), rows = d.readers || [];
    for (let i = 0; i < rows.length; i++) if (rows[i]?.itemID === entry.itemID) return rows[i];
    return null;
  };
  const host = () => Zotero.getMainWindow?.();
  const foreground = entry => {
    const w = host();
    try { if (w?.windowState === 2) w.restore?.(); w?.focus?.(); } catch (e) {}
    try { w?.Zotero_Tabs?.select(entry.tabID); entry.reader?.focus?.(); entry.window?.focus?.(); } catch (e) {}
  };
  const minimize = () => { try { host()?.minimize?.(); } catch (e) {} };
  const clearBuffers = entry => {
    const c = Cu.waiveXrays(Cu.waiveXrays(entry.manager)?._controller);
    for (const key of ['_audioBuffers', '_segmentTimestamps', '_fetching']) {
      const value = c?.[key];
      try { if (value && typeof value.clear === 'function') value.clear(); } catch (e) {}
    }
    try { c._currentBuffer = null; c._currentTimestamps = null; } catch (e) {}
  };
  const resetEntry = async entry => {
    const m = Cu.waiveXrays(entry.manager);
    try { if (m?.active && !m.paused) m.pause(); } catch (e) {}
    await sleep(100);
    clearBuffers(entry);
    try { if (m?.active && !m.paused) m.pause(); } catch (e) {}
    await sleep(80);
  };
  const clickPlayer = (entry, label = 'player .play') => {
    const frame = entry.window?.document?.getElementById('ztts-player-frame'), doc = frame?.contentDocument;
    const button = doc?.querySelector('.play');
    if (!button) return { ok: false, label, reason: 'player play control missing' };
    const before = button.getAttribute('aria-label');
    try { button.click(); } catch (e) { return { ok: false, label, before, error: String(e) }; }
    return { ok: true, label, before, after: button.getAttribute('aria-label') };
  };
  const clickNextSentence = entry => {
    const buttons = entry.window?.document?.querySelectorAll('button') || [];
    for (let i = 0; i < buttons.length; i++) {
      if (buttons[i]?.getAttribute('title') === 'Skip to Next Sentence') {
        try { buttons[i].click(); return { ok: true, title: 'Skip to Next Sentence' }; }
        catch (e) { return { ok: false, error: String(e) }; }
      }
    }
    return { ok: false, reason: 'sentence navigation control missing' };
  };
  const instrument = (entry, record) => {
    const c = Cu.waiveXrays(entry.manager?._controller);
    const original = c?._playAudioBuffer;
    const descriptor = c ? Object.getOwnPropertyDescriptor(c, '_playAudioBuffer') : null;
    if (!c || typeof original !== 'function') return { restore: () => {}, error: 'native _playAudioBuffer missing' };
    c._playAudioBuffer = function (...args) {
      const before = { notice: noticeOf(entry), diag: diagOf(entry), state: stateOf(entry) };
      const at = Date.now();
      let result;
      try { result = Reflect.apply(original, this, args); }
      catch (e) {
        record.errors.push(String(e));
        record.plays.push({ at, index: Number(c._position), offset: Number(args[1]), context: c._audioContext?.state ?? null, before, after: { notice: noticeOf(entry), diag: diagOf(entry), state: stateOf(entry) }, threw: true });
        throw e;
      }
      record.plays.push({ at, index: Number(c._position), offset: Number(args[1]), context: c._audioContext?.state ?? null, before, after: { notice: noticeOf(entry), diag: diagOf(entry), state: stateOf(entry) }, threw: false });
      return result;
    };
    return { restore: () => { try { if (descriptor) Object.defineProperty(c, '_playAudioBuffer', descriptor); else delete c._playAudioBuffer; } catch (e) {} } };
  };
  const sample = (entry, trace, label, startedAt) => trace.push({ label, elapsedMs: Date.now() - startedAt, state: stateOf(entry), notice: noticeOf(entry), diagnostic: diagOf(entry) });
  const waitSource = async (entry, record, trace, startedAt) => {
    await waitFor(() => record.plays.length > 0 && record.plays[record.plays.length - 1].context === 'running', 5000, 40);
    sample(entry, trace, 'source-or-timeout', startedAt);
    return record.plays.length > 0;
  };
  const slow = async (entry, kind) => {
    await resetEntry(entry);
    t.audioDuration = 5; t.delayMs = 0; t.delayByVoice = { 'native119-a': 1400 };
    t.failVoiceID = null; t.noTimestampsVoiceID = null;
    const before = diagOf(entry), responseCount = (t.responses || []).length;
    const record = { plays: [], errors: [] }, hook = instrument(entry, record);
    const trace = [], startedAt = Date.now();
    foreground(entry);
    const action = clickPlayer(entry);
    minimize();
    sample(entry, trace, 'after-player-play', startedAt);
    for (const mark of [150, 350, 800, 1250, 1500]) {
      await sleep(mark - (Date.now() - startedAt)); sample(entry, trace, `at-${mark}ms`, startedAt);
    }
    const source = await waitSource(entry, record, trace, startedAt);
    const final = trace[trace.length - 1];
    const waitSample = trace.find(row => row.label === 'at-350ms');
    const response = (t.responses || []).slice(responseCount).filter(row => row.voiceID === 'native119-a').slice(-1)[0] || null;
    const play = record.plays[0] || null;
    const checks = {
      actualPlayerControl: action.ok,
      attached: !!before?.attached,
      waitPhase: waitSample?.diagnostic?.phase === 'waiting',
      requestedAfterThreshold: waitSample?.diagnostic?.preparingRequested === true,
      localizedPreparing: waitSample?.notice?.opacity === '1' && /Preparing…|正在准备/.test(waitSample?.notice?.text || ''),
      responseObserved: !!response,
      visibleAtSourceInvocation: play?.before?.notice?.opacity === '1',
      sourceStartedRunning: !!source && play?.context === 'running' && play?.after?.state?.sourcePlaying,
      clearsAtSourceReturn: play?.after?.notice?.opacity === '0' && play?.after?.diag?.phase === 'playing',
      sourceStartsIncreased: (final?.diagnostic?.sourceStarts ?? 0) > (before?.sourceStarts ?? 0),
      noThrow: record.errors.length === 0,
    };
    try { if (entry.manager.active && !entry.manager.paused) entry.manager.pause(); } catch (e) {}
    hook.restore(); t.delayByVoice = {}; t.delayMs = 0;
    return { kind, scenario: 'slow-initial', status: Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL', action, trace, responseAt: response?.at ?? null, sourcePlay: play, checks };
  };
  const fast = async (entry, kind) => {
    await resetEntry(entry);
    t.audioDuration = 5; t.delayMs = 0; t.delayByVoice = {}; t.failVoiceID = null; t.noTimestampsVoiceID = null;
    clearBuffers(entry);
    const before = diagOf(entry), record = { plays: [], errors: [] }, hook = instrument(entry, record);
    const trace = [], startedAt = Date.now();
    foreground(entry); const action = clickPlayer(entry); minimize();
    sample(entry, trace, 'after-player-play', startedAt);
    for (const mark of [80, 180, 299, 450]) { await sleep(mark - (Date.now() - startedAt)); sample(entry, trace, `at-${mark}ms`, startedAt); }
    await waitSource(entry, record, trace, startedAt);
    const final = trace[trace.length - 1];
    const checks = { actualPlayerControl: action.ok, noVisibleFlash: trace.every(row => row.notice?.opacity !== '1'),
      noIntentFlash: trace.every(row => row.diagnostic?.preparingRequested !== true), sourceStartedRunning: record.plays[0]?.context === 'running',
      sourceStartsIncreased: (final?.diagnostic?.sourceStarts ?? 0) > (before?.sourceStarts ?? 0) };
    try { if (entry.manager.active && !entry.manager.paused) entry.manager.pause(); } catch (e) {}
    hook.restore();
    return { kind, scenario: 'fast-start', status: Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL', action, trace, sourcePlay: record.plays[0] || null, checks };
  };
  const pauseResume = async (entry, kind) => {
    await resetEntry(entry);
    t.audioDuration = 5; t.delayMs = 0; t.delayByVoice = { 'native119-a': 1400 }; t.failVoiceID = null; t.noTimestampsVoiceID = null;
    clearBuffers(entry);
    const before = diagOf(entry), record = { plays: [], errors: [] }, hook = instrument(entry, record);
    const trace = [], startedAt = Date.now();
    foreground(entry); const playAction = clickPlayer(entry, 'player .play (wait)'); minimize();
    sample(entry, trace, 'wait-start', startedAt);
    await sleep(350); sample(entry, trace, 'wait-visible', startedAt);
    foreground(entry); const pauseAction = clickPlayer(entry, 'player .play (pause)'); minimize();
    sample(entry, trace, 'after-pause', startedAt);
    await sleep(1600); sample(entry, trace, 'late-response-after-pause', startedAt);
    const canceled = trace[trace.length - 1], startsBeforeResume = canceled.diagnostic?.sourceStarts ?? 0;
    t.delayByVoice = {};
    foreground(entry); const resumeAction = clickPlayer(entry, 'player .play (resume)'); minimize();
    await waitSource(entry, record, trace, startedAt);
    const resumed = trace[trace.length - 1];
    const checks = { waitShown: trace[1]?.notice?.opacity === '1' && trace[1]?.diagnostic?.preparingRequested === true,
      pauseControl: pauseAction.ok && canceled.state?.paused === true, pauseClearsImmediately: trace[2]?.notice?.opacity !== '1' && trace[2]?.diagnostic?.preparingRequested !== true,
      lateResponseStaysClear: canceled.notice?.opacity !== '1' && canceled.diagnostic?.preparingRequested !== true && record.plays.length === 1,
      newPlayAction: resumeAction.ok, newWait: (resumed.diagnostic?.waits ?? 0) > (canceled.diagnostic?.waits ?? 0),
      resumedSource: record.plays.length > 0 && record.plays[record.plays.length - 1].context === 'running',
      newSourceStart: (resumed.diagnostic?.sourceStarts ?? 0) > startsBeforeResume };
    try { if (entry.manager.active && !entry.manager.paused) entry.manager.pause(); } catch (e) {}
    hook.restore(); t.delayByVoice = {}; t.delayMs = 0;
    return { kind, scenario: 'pause-resume', status: Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL', playAction, pauseAction, resumeAction, trace, checks };
  };
  const navigation = async (entry, kind) => {
    await resetEntry(entry);
    t.audioDuration = 5; t.delayMs = 0; t.delayByVoice = { 'native119-a': 1200 }; t.failVoiceID = null; t.noTimestampsVoiceID = null;
    clearBuffers(entry);
    const before = diagOf(entry), initialPosition = stateOf(entry).position, record = { plays: [], errors: [] }, hook = instrument(entry, record);
    const trace = [], startedAt = Date.now();
    foreground(entry); const navAction = clickNextSentence(entry); await sleep(120); sample(entry, trace, 'after-next-sentence', startedAt);
    const positionAfterNavigation = stateOf(entry).position;
    const playAction = clickPlayer(entry, 'player .play (navigated)'); minimize();
    sample(entry, trace, 'after-navigated-play', startedAt);
    await sleep(350); sample(entry, trace, 'navigated-wait-visible', startedAt);
    await waitSource(entry, record, trace, startedAt);
    const final = trace[trace.length - 1], play = record.plays[0] || null;
    const checks = { navigationControl: navAction.ok, advancedSentence: Number.isFinite(positionAfterNavigation) && positionAfterNavigation > Number(initialPosition ?? 0),
      actualPlayerControl: playAction.ok, waitPhase: trace.find(row => row.label === 'navigated-wait-visible')?.diagnostic?.phase === 'waiting',
      noticeShown: trace.find(row => row.label === 'navigated-wait-visible')?.notice?.opacity === '1', sourceRunning: play?.context === 'running',
      clearedAtSource: play?.before?.notice?.opacity === '1' && play?.after?.notice?.opacity === '0', sourceStartsIncreased: (final?.diagnostic?.sourceStarts ?? 0) > (before?.sourceStarts ?? 0) };
    try { if (entry.manager.active && !entry.manager.paused) entry.manager.pause(); } catch (e) {}
    hook.restore(); t.delayByVoice = {}; t.delayMs = 0;
    return { kind, scenario: 'sentence-navigation', status: Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL', navAction, playAction, initialPosition, positionAfterNavigation, trace, sourcePlay: play, checks };
  };
  const all = [];
  for (const kind of ['pdf', 'epub']) {
    const entry = t.readers?.[kind];
    if (!entry) throw new Error(`${kind} transport reader missing`);
    all.push(await slow(entry, kind));
    all.push(await fast(entry, kind));
    all.push(await pauseResume(entry, kind));
    all.push(await navigation(entry, kind));
  }
  t.playbackResults = all;
  t.delayByVoice = {}; t.delayMs = 0;
  const status = all.every(row => row.status === 'PASS') ? 'PASS' : 'FAIL';
  return JSON.stringify({ status, results: all }, null, 1);
})()
