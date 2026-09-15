return (async () => {
  const root = Zotero.__ztts95Kokoro;
  const fixture = root?.fixtureA;
  const reader = fixture?.reader;
  const internal = reader?._internalReader;
  const manager = internal?._readAloudManager;
  const out = { status: 'FAIL', provider: 'Kokoro', errors: [], fetch: {} };
  if (!reader || !manager) throw new Error('Kokoro fixture manager is missing');
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const prefix = 'extensions.zotero.zotero-tts.';
  const baseURLName = prefix + 'local.baseURL';
  const cacheName = prefix + 'cacheAudio';
  const prefetchName = prefix + 'prefetchEnabled';
  const baseURL = 'http://issue108-fetch-fixture.invalid';
  const originalBase = root.baseline?.prefs?.['local.baseURL'] ?? { value: null, user: false };
  const readBool = name => ({ value: Services.prefs.getBoolPref(name), user: Services.prefs.prefHasUserValue(name) });
  const cacheBefore = readBool(cacheName);
  const prefetchBefore = readBool(prefetchName);
  const restore = (name, entry) => {
    if (!entry.user) { if (Services.prefs.prefHasUserValue(name)) Services.prefs.clearUserPref(name); return; }
    if (typeof entry.value === 'boolean') Services.prefs.setBoolPref(name, entry.value);
    else if (typeof entry.value === 'string') Services.prefs.setStringPref(name, entry.value);
  };
  const restoreBase = () => restore(baseURLName, originalBase);
  const stateOf = () => {
    const c = manager._controller;
    const result = { active: !!manager.active, paused: !!manager.paused, selected: manager.selectedVoiceID ?? null,
      position: Number.isFinite(c?._position) ? c._position : null, playing: !!c?._isPlaying, controller: !!c };
    Object.defineProperty(result, '_controller', { value: c, enumerable: false });
    return result;
  };
  const diagnostic = () => {
    const all = JSON.parse(Zotero.ZoteroTTS.diagnostics.voiceSwitch());
    const index = (Zotero.Reader._readers || []).indexOf(reader);
    return { all, fixture: all.readers?.[index] ?? null };
  };
  const response = payload => {
    const text = String(payload?.input || '');
    const tokens = text.match(/[\p{L}\p{N}\p{M}'’]+/gu) || ['test'];
    const bytes = new Uint8Array([82, 73, 70, 70, 36, 0, 0, 0, 87, 65, 86, 69, 102, 109, 116, 32, 16, 0, 0, 0, 1, 0, 1, 0, 64, 31, 0, 0, 128, 62, 0, 0, 2, 0, 16, 0, 100, 97, 116, 97, 0, 0, 0, 0]);
    const audio = btoa(String.fromCharCode(...bytes));
    const timestamps = tokens.map((word, i) => ({ word, start_time: i * 0.2, end_time: (i + 1) * 0.2 }));
    return { audio, timestamps };
  };
  const sandbox = Components.utils.getGlobalForObject(Zotero.ZoteroTTS.startup);
  const originalFetch = sandbox.fetch;
  const events = [];
  let speechCount = 0;
  sandbox.fetch = function (input, init) {
    const url = String(input);
    const path = url.replace(/^https?:\/\/[^/]+/i, '') || '/';
    if (!path.startsWith('/dev/captioned_speech') && !path.startsWith('/v1/audio/speech')) {
      return Reflect.apply(originalFetch, sandbox, [input, init]);
    }
    let payload = {};
    try { payload = typeof init?.body === 'string' ? JSON.parse(init.body) : {}; } catch (e) {}
    speechCount += 1;
    const request = speechCount;
    const signal = init?.signal;
    events.push({ event: 'fetch-start', request, path, voice: payload.voice ?? null, hasSignal: !!signal, abortedAtStart: !!signal?.aborted });
    const PromiseCtor = sandbox.Promise || Promise;
    return new PromiseCtor((resolve, reject) => {
      let settled = false;
      let timer = null;
      const finish = fn => { if (settled) return; settled = true; if (timer !== null) clearTimeout(timer); signal?.removeEventListener?.('abort', abort); fn(); };
      const abort = () => finish(() => { events.push({ event: 'fetch-abort', request, aborted: !!signal?.aborted }); reject(new Error('issue108 fixture fetch aborted')); });
      signal?.addEventListener?.('abort', abort, { once: true });
      const delay = request === 1 ? 4000 : 100;
      timer = setTimeout(() => finish(() => {
        const body = response(payload);
        events.push({ event: 'fetch-response', request, timestamps: body.timestamps.length });
        resolve({ ok: true, status: 200, json: async () => body, blob: async () => new sandbox.Blob([Uint8Array.from(atob(body.audio), c => c.charCodeAt(0))], { type: 'audio/wav' }) });
      }), delay);
    });
  };
  try {
    if (manager.active && !manager.paused) { try { manager.pause(); } catch (e) {} await sleep(100); }
    const voices = Components.utils.waiveXrays(manager.allVoices) || [];
    let target = null;
    for (let i = 0; i < (voices?.length ?? 0); i++) if (String(voices[i]?.id ?? '') === 'local::af_jadzia') { target = voices[i]; break; }
    if (!target) for (let i = 0; i < (voices?.length ?? 0); i++) if (String(voices[i]?.id ?? '').startsWith('local::')) { target = voices[i]; break; }
    if (!target) { out.status = 'NOT TESTABLE'; out.errors.push('no listed Kokoro voice'); return JSON.stringify(out, null, 1); }
    const targetID = String(target.id);
    const originalID = String(manager.selectedVoiceID ?? '');
    const oldController = manager._controller;
    const segment = Components.utils.waiveXrays(oldController)?._segments?.[0] ?? manager._segments?.[0];
    const remote = Components.utils.waiveXrays(manager._options)?.remoteInterface;
    if (!segment || !remote || typeof remote.getAudio !== 'function') throw new Error('Kokoro remote interface or segment is missing');
    Services.prefs.setBoolPref(cacheName, false);
    Services.prefs.setBoolPref(prefetchName, false);
    Services.prefs.setStringPref(baseURLName, baseURL);
    await sleep(100);
    let targetSelectError = null;
    try { manager.selectVoice(targetID); } catch (e) { targetSelectError = String(e); }
    for (let i = 0; i < 25 && !events.some(event => event.event === 'fetch-start'); i++) await sleep(80);
    const pending = diagnostic();
    let cancelError = null;
    try { manager.selectVoice(originalID); } catch (e) { cancelError = String(e); }
    await sleep(500);
    const cancelled = diagnostic();
    const afterCancel = stateOf();
    const first = events.filter(event => event.request === 1);
    const abortObserved = first.some(event => event.event === 'fetch-abort');
    const responseObserved = first.some(event => event.event === 'fetch-response');
    let normalResult = null;
    const normalStarted = Date.now();
    try { normalResult = await remote.getAudio(segment, { id: targetID, locale: 'en-US' }); }
    catch (e) { normalResult = { error: String(e) }; }
    const normalElapsedMs = Date.now() - normalStarted;
    const normalAudioBytes = Number(normalResult?.audio?.size ?? 0);
    const normalTimestamps = Number(normalResult?.timestamps?.length ?? 0);
    out.fetch = { endpoint: baseURL, events, targetSelectError, pending: pending.fixture?.handoff ?? null,
      cancelled: cancelled.fixture?.handoff ?? null, abortObserved, responseObserved,
      signalAtStart: events.find(event => event.event === 'fetch-start')?.hasSignal ?? false,
      signalAbortedAtStart: events.find(event => event.event === 'fetch-start')?.abortedAtStart ?? null,
      signalAborted: events.some(event => event.event === 'fetch-abort' && event.aborted === true),
      speechRequests: events.filter(event => event.event === 'fetch-start').length,
      responses: events.filter(event => event.event === 'fetch-response').length,
    };
    out.target = { id: targetID, originalID, cancelError, oldController: !!oldController, afterCancel,
      noObsoletePlay: cancelled.fixture?.handoff?.stage === 'cancelled' && !cancelled.fixture?.handoff?.pending
        && manager.selectedVoiceID === originalID && manager._controller === oldController && manager.paused };
    out.normalPlayback = { elapsedMs: normalElapsedMs, audioBytes: normalAudioBytes, timestampCount: normalTimestamps, error: normalResult?.error ?? null };
    out.status = abortObserved && !responseObserved && out.target.noObsoletePlay && out.fetch.signalAtStart && out.fetch.signalAborted && normalAudioBytes > 0 ? 'PASS' : 'FAIL';
  } finally {
    sandbox.fetch = originalFetch;
    restoreBase();
    restore(cacheName, cacheBefore);
    restore(prefetchName, prefetchBefore);
    await sleep(120);
  }
  return JSON.stringify(out, null, 1);
})()
