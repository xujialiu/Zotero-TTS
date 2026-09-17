return (async () => {
  const run = Zotero.ZoteroTTSRun, state = run.state;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const waitFor = async (fn, ms = 10000, step = 100) => { const end = Date.now() + ms; while (Date.now() < end) { const v = fn(); if (v) return v; await sleep(step); } return null; };
  const p = Services.prefs, prefix = 'extensions.zotero.zotero-tts.', K = n => prefix + n;
  const readPref = name => { const key = K(name), type = p.getPrefType(key), user = p.prefHasUserValue(key); let value = null; try { value = type === p.PREF_BOOL ? p.getBoolPref(key) : type === p.PREF_INT ? p.getIntPref(key) : type === p.PREF_STRING ? p.getStringPref(key) : null; } catch {} return { key, type, user, value }; };
  const restorePref = rec => { if (!rec) return; if (!rec.user) { if (p.prefHasUserValue(rec.key)) p.clearUserPref(rec.key); return; } if (rec.type === p.PREF_BOOL) p.setBoolPref(rec.key, !!rec.value); else if (rec.type === p.PREF_INT) p.setIntPref(rec.key, Number(rec.value)); else if (rec.type === p.PREF_STRING) p.setStringPref(rec.key, String(rec.value)); };
  const readers = () => Zotero.Reader._readers || [];
  const indexOf = reader => { const rs = readers(); for (let i = 0; i < rs.length; i++) if (rs[i] === reader) return i; return -1; };
  const live = reader => { try { return JSON.parse(Zotero.ZoteroTTS.diagnostics.liveVoiceList())[indexOf(reader)] || null; } catch { return null; } };
  const handoff = reader => { try { return JSON.parse(Zotero.ZoteroTTS.diagnostics.voiceSwitch()).readers?.[indexOf(reader)]?.handoff || null; } catch { return null; } };
  const readingImpact = changes => JSON.parse(Zotero.ZoteroTTS.diagnostics.readingImpact(JSON.stringify(changes || {})));
  const stateOf = entry => { const m = entry.manager, c = m?._controller, ctx = c?._audioContext; return { active: !!m?.active, paused: !!m?.paused, voice: m?.selectedVoiceID || null, position: Number.isFinite(c?._position) ? Number(c._position) : null, progress: Number.isFinite(c?._currentPlaybackTime) ? Number(c._currentPlaybackTime) : null, audioState: ctx?.state || null, audioTime: Number.isFinite(ctx?.currentTime) ? Number(ctx.currentTime) : null }; };
  const focusReader = entry => { try { const host = Zotero.getMainWindow?.() || Services.wm.getMostRecentWindow('navigator:browser'); host?.restore?.(); host?.focus?.(); host?.Zotero_Tabs?.select(entry.tabID); entry.reader.focus?.(); entry.reader._iframeWindow?.focus?.(); } catch {} };
  const clearController = controller => { const c = Components.utils.waiveXrays(controller); for (const name of ['_audioBuffers', '_segmentTimestamps', '_fetching']) { try { c?.[name]?.clear?.(); } catch {} } try { c._currentBuffer = null; c._currentTimestamps = null; c._currentPlaybackTime = 0; } catch {} };
  const settlePending = async entry => {
    const h = handoff(entry.reader); if (!h?.pending) return false;
    const keep = String(entry.manager.selectedVoiceID || ''); if (!keep) return false;
    focusReader(entry); try { entry.reader._iframeWindow?.document?.notifyUserGestureActivation?.(); entry.manager.play?.(); } catch {}
    const done = await waitFor(() => !handoff(entry.reader)?.pending && entry.manager.active && !entry.manager.paused, 15000, 100);
    if (!done) throw new Error('pending fixture handoff did not settle before request-count probe: ' + JSON.stringify({ keep, state: stateOf(entry), handoff: handoff(entry.reader) }));
    try { entry.manager.pause?.(); } catch { try { entry.manager.togglePaused?.(); } catch {} }
    await sleep(120);
    return true;
  };
  const entries = state.opened || [];
  if (entries.length !== 2) throw new Error('two fixture readers are required for request-count supplement');
  const A = entries[0], B = entries[1], mA = A.manager, mB = B.manager;
  const out = { status: 'FAIL', rows: [], errors: [] };
  const temporary = ['cacheAudio', 'prefetchEnabled', 'prefetch'].map(readPref);
  let sandbox = null, oldFetch = null, delayVoice = null, omitCurrent = false;
  const events = [];
  let configuredBase = '';
  try {
    await settlePending(A); await settlePending(B);
    if (!mA.active || !mB.active) throw new Error('fixture sessions are not active');
    // Keep other synthesis from polluting the exact current-sentence count.
    p.setBoolPref(K('cacheAudio'), false);
    p.setBoolPref(K('prefetchEnabled'), false);
    const currentPrefetch = readPref('prefetch'); if (currentPrefetch.type === p.PREF_INT && currentPrefetch.value !== 0) p.setIntPref(K('prefetch'), 0);
    const controller = mA._controller;
    let targetIndex = Number(controller?._position); if (!Number.isFinite(targetIndex)) targetIndex = 0;
    const targetText = String(mA._segments?.[targetIndex]?.text || '');
    if (!targetText) throw new Error('current fixture sentence text is empty');
    const targetVoice = String(mA.selectedVoiceID || '');
    const rawVoice = targetVoice.replace(/^local::/, '');
    clearController(controller);

    sandbox = Components.utils.getGlobalForObject(Zotero.ZoteroTTS.startup);
    oldFetch = sandbox.fetch;
    configuredBase = String(p.getStringPref(K('local.baseURL')) || '').replace(/\/+$/, '');
    const configuredVoiceURL = configuredBase + '/v1/audio/voices';
    const requestPath = url => url.replace(/^https?:\/\/[^/]+/i, '') || '/';
    const parseBody = init => { try { return typeof init?.body === 'string' ? JSON.parse(init.body) : {}; } catch { return {}; } };
    const isConfiguredVoiceList = url => url === configuredVoiceURL || url.startsWith(configuredVoiceURL + '?');
    const responseDelay = (promise, ms) => {
      const PromiseCtor = sandbox.Promise || Promise;
      return new PromiseCtor((resolve, reject) => promise.then(value => sandbox.setTimeout(() => resolve(value), ms), reject));
    };
    sandbox.fetch = function(input, init) {
      const url = String(input), path = requestPath(url), payload = parseBody(init);
      if (path.startsWith('/dev/captioned_speech') || path.startsWith('/v1/audio/speech')) {
        const voice = String(payload.voice || ''), inputText = String(payload.input || '');
        events.push({ kind: 'synthesis', endpoint: path.split('?')[0], voice, input: inputText, index: Number(mA._controller?._position), at: Date.now() });
        const result = Reflect.apply(oldFetch, sandbox, [input, init]);
        if (delayVoice && voice === delayVoice) return responseDelay(result, 1500);
        return result;
      }
      if (omitCurrent && isConfiguredVoiceList(url)) {
        events.push({ kind: 'omitted-voice-list', url: url.replace(/^https?:\/\/[^/]+/i, ''), configuredMatch: true, at: Date.now() });
        const PromiseCtor = sandbox.Promise || Promise;
        return new PromiseCtor(resolve => sandbox.setTimeout(() => resolve({ ok: true, status: 200, json: async () => ({ voices: [] }) }), 80));
      }
      return Reflect.apply(oldFetch, sandbox, [input, init]);
    };

    const callsFor = (voice, inputText, index) => events.filter(e => e.kind === 'synthesis' && e.voice === voice && e.input === inputText && e.index === index);
    const exactCalls = () => callsFor(rawVoice, targetText, targetIndex);
    focusReader(A); try { A.reader._iframeWindow?.document?.notifyUserGestureActivation?.(); mA.play?.(); } catch {}
    const started = await waitFor(() => exactCalls().length > 0 && mA.active && !mA.paused, 15000, 100);
    const startState = stateOf(A), exactBefore = exactCalls().length;
    if (!started || exactBefore < 1) throw new Error('exact current-sentence synthesis request did not start: ' + JSON.stringify({ started, startState, targetIndex, targetVoice, rawVoice, targetChars: targetText.length, events }));
    const beforeController = mA._controller, beforeVoice = mA._voice, beforeCatalog = mA._allVoices, beforeClock = stateOf(A), appliedBefore = live(A.reader)?.applied ?? 0;
    let refreshError = null; try { await mA.loadVoices(true); } catch (e) { refreshError = String(e); }
    const refreshed = await waitFor(() => (live(A.reader)?.applied ?? 0) > appliedBefore, 15000, 120);
    const afterRefresh = stateOf(A), exactAfter = exactCalls().length;
    const sameController = mA._controller === beforeController, sameVoiceObject = mA._voice === beforeVoice, sameCatalog = mA._allVoices === beforeCatalog;
    const refreshNoDuplicate = exactAfter === exactBefore;
    const clockEnd = afterRefresh.audioTime;
    const clockMoving = beforeClock.audioState === 'running' && afterRefresh.audioState === 'running' && Number(clockEnd) > Number(beforeClock.audioTime);
    if (!refreshed || !sameController || !sameVoiceObject || !sameCatalog || !refreshNoDuplicate || refreshError) throw new Error('allowed refresh request-count mismatch: ' + JSON.stringify({ refreshed, refreshError, beforeClock, afterRefresh, exactBefore, exactAfter, sameController, sameVoiceObject, sameCatalog, appliedBefore, appliedAfter: live(A.reader) }));
    out.rows.push({ check: 'allowed refresh request count', status: 'PASS', sentence: { index: targetIndex, chars: targetText.length, voice: targetVoice }, synthesisCalls: { exactBefore, exactAfter, noIncrease: refreshNoDuplicate }, applied: { before: appliedBefore, after: live(A.reader)?.applied ?? null }, identity: { controller: sameController, voiceObject: sameVoiceObject, catalogArray: sameCatalog }, clock: { start: beforeClock, end: afterRefresh, moving: clockMoving, verdict: clockMoving ? 'running' : 'NOT TESTABLE: output clock suspended' } });
    if (mA.active && !mA.paused) { try { mA.pause?.(); } catch {} await sleep(120); }

    // Capture the protected pair while B's delayed target preparation is
    // genuinely pending, then let the fixture handoff finish normally.
    if (mB.active && !mB.paused) { try { mB.pause?.(); } catch {} await sleep(100); }
    const originalID = String(mB.selectedVoiceID || '');
    let targetID = null;
    for (let i = 0; i < (mB._allVoices?.length || 0); i++) { const id = String(mB._allVoices[i]?.id || ''); if (id.startsWith('local::') && id !== originalID) { targetID = id; break; } }
    if (!targetID) throw new Error('a second local voice is missing for pending impact');
    delayVoice = targetID.replace(/^local::/, '');
    let selectError = null; try { mB.selectVoice(targetID); } catch (e) { selectError = String(e); }
    await sleep(120);
    const pendingHandoff = handoff(B.reader), impactPending = readingImpact({});
    let pendingSession = null; for (const session of impactPending.sessions || []) if ((session.voices || []).some(v => v.id === targetID)) { pendingSession = session; break; }
    const pendingIDs = pendingSession?.voices?.map(v => v.id) || [];
    const bothProtected = pendingIDs.includes(originalID) && pendingIDs.includes(targetID) && pendingHandoff?.pending === targetID;
    if (!bothProtected) throw new Error('readingImpact did not capture both pending handoff voices: ' + JSON.stringify({ originalID, targetID, pendingHandoff, impactPending, pendingIDs, selectError }));
    focusReader(B); try { B.reader._iframeWindow?.document?.notifyUserGestureActivation?.(); mB.play?.(); } catch {}
    const committed = await waitFor(() => mB.selectedVoiceID === targetID && !handoff(B.reader)?.pending && mB.active && !mB.paused, 15000, 100);
    const committedHandoff = handoff(B.reader);
    if (!committed) throw new Error('delayed pending handoff did not commit: ' + JSON.stringify({ originalID, targetID, committedHandoff, state: stateOf(B) }));
    if (mB.active && !mB.paused) { try { mB.pause?.(); } catch {} await sleep(100); }
    out.rows.push({ check: 'pending handoff impact', status: 'PASS', originalID, targetID, pending: pendingHandoff, impactPending: { title: pendingSession?.title || null, protectedVoiceIDs: pendingIDs }, committed: committedHandoff });

    // Omit the playing provider's voice list through a URL-scoped stub. This
    // is a fresh list request in the plugin sandbox; no HTTP call outside the
    // configured Kokoro voice-list URL is intercepted.
    // The refresh advanced A during the first count. Retarget immediately to
    // the sentence A is actually on now; the omission assertion must not keep
    // counting the earlier target sentence.
    const beforeDiscovery = live(A.reader), discoveryIndex = Number(mA._controller?._position), discoveryID = String(mA.selectedVoiceID || ''), discoveryRawVoice = discoveryID.replace(/^local::/, ''), discoveryText = String(mA._segments?.[discoveryIndex]?.text || ''), discoveryBeforeCalls = callsFor(discoveryRawVoice, discoveryText, discoveryIndex).length, discoveryController = mA._controller, discoveryVoiceObject = mA._voice, discoveryCatalog = mA._allVoices;
    if (!Number.isFinite(discoveryIndex) || !discoveryText) throw new Error('A current sentence could not be identified before omitted discovery: ' + JSON.stringify({ discoveryIndex, discoveryID, textChars: discoveryText.length }));
    await waitFor(() => (live(A.reader)?.loading ?? 0) === 0, 15000, 120); await sleep(250);
    omitCurrent = true;
    let discoveryError = null; try { await mA.loadVoices(true); } catch (e) { discoveryError = String(e); }
    const afterDiscovery = live(A.reader), discoveryAfterCalls = callsFor(discoveryRawVoice, discoveryText, discoveryIndex).length;
    const stubEvents = events.filter(e => e.kind === 'omitted-voice-list');
    const retained = Number(afterDiscovery?.retained || 0), noNewExact = discoveryAfterCalls === discoveryBeforeCalls;
    const discoveryIdentity = mA._controller === discoveryController && mA._voice === discoveryVoiceObject && mA._allVoices === discoveryCatalog && mA.selectedVoiceID === discoveryID;
    const configuredOnly = stubEvents.length > 0 && stubEvents.every(e => e.configuredMatch === true);
    if (!stubEvents.length || !configuredOnly || !retained || !noNewExact || !discoveryIdentity || discoveryError) throw new Error('omitted-current discovery request-count mismatch: ' + JSON.stringify({ beforeDiscovery, afterDiscovery, stubEvents, retained, discoveryBeforeCalls, discoveryAfterCalls, noNewExact, discoveryIdentity, discoveryError, configuredBase }));
    out.rows.push({ check: 'omitted current voice request count', status: 'PASS', configuredKokoroBase: configuredBase, stubURLMatch: 'configured Kokoro /v1/audio/voices only', voiceListRequests: stubEvents.length, sentence: { index: discoveryIndex, chars: discoveryText.length, voice: discoveryID }, selectedVoice: discoveryID, retained, synthesisCalls: { exactBefore: discoveryBeforeCalls, exactAfter: discoveryAfterCalls, noIncrease: noNewExact }, identity: { controller: mA._controller === discoveryController, voiceObject: mA._voice === discoveryVoiceObject, catalogArray: mA._allVoices === discoveryCatalog }, after: afterDiscovery });
    omitCurrent = false;
    try { await mA.loadVoices(true); } catch {}
    out.requestEvents = { synthesis: events.filter(e => e.kind === 'synthesis').length, omittedLists: stubEvents.length, refreshExact: { voice: rawVoice, index: targetIndex, sentenceChars: targetText.length }, omissionExact: { voice: discoveryRawVoice, index: discoveryIndex, sentenceChars: discoveryText.length } };
    out.status = 'PASS';
    return JSON.stringify(out, null, 1);
  } catch (error) {
    out.error = String(error); out.stack = error?.stack ? String(error.stack).split('\n').slice(0, 5).join(' | ') : null;
    throw new Error(JSON.stringify(out));
  } finally {
    omitCurrent = false; delayVoice = null;
    if (sandbox && oldFetch) { try { sandbox.fetch = oldFetch; } catch {} }
    for (const rec of temporary) { try { restorePref(rec); } catch {} }
    try { if (mA.active && !mA.paused) mA.pause?.(); } catch {}
    try { if (mB.active && !mB.paused) mB.pause?.(); } catch {}
    try { const host = Services.wm.getMostRecentWindow('navigator:browser'); if (host && host.windowState !== 2) host.minimize(); } catch {}
  }
})()
