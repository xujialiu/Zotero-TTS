(async () => {
  const itemID = 24426;
  const list = Zotero.Reader._readers || [];
  let reader = null;
  for (let i = 0; i < list.length; i++) if (list[i].itemID === itemID) { reader = list[i]; break; }
  const manager = reader && reader._internalReader && reader._internalReader._readAloudManager;
  const controller = manager && manager._controller;
  const iface = manager && manager._options && manager._options.remoteInterface;
  if (!reader || !manager || !controller || !iface) return JSON.stringify({ error: 'fixture controller/remote missing' });
  const prefix = 'extensions.zotero.zotero-tts.';
  const prefKeys = ['cacheAudio', 'prefetchEnabled'];
  const snap = {};
  for (const s of prefKeys) snap[s] = { value: Zotero.Prefs.get('zotero-tts.' + s), user: Services.prefs.prefHasUserValue(prefix + s) };
  const sandbox = Components.utils.getGlobalForObject(Zotero.ZoteroTTS.startup);
  const originalFetch = sandbox.fetch;
  const win = reader._window;
  const calls = [];
  const audioBytes = await IOUtils.read('/Users/xujialiu/Works/Zotero-TTS/.tmp/fish-locale-test/baseline-100-exp.mp3');
  let binary = '';
  for (let i = 0; i < audioBytes.length; i += 0x8000) binary += String.fromCharCode(...audioBytes.slice(i, i + 0x8000));
  const base64 = btoa(binary);
  function responseFor(bodyText) {
    let raw = String(bodyText || '');
    const close = raw.indexOf(']');
    if (raw.startsWith('[Speak in ') && close >= 0) raw = raw.slice(close + 1).replace(/^\s+/u, '');
    const words = [];
    const re = /[\p{L}\p{N}]+/gu;
    let match;
    let n = 0;
    while ((match = re.exec(raw)) && n < 20) { words.push({ text: match[0], start: n * 0.2, end: (n + 1) * 0.2 }); n++; }
    const payload = 'data: ' + JSON.stringify({ audio_base64: base64, chunk_seq: 0, alignment: { segments: words } }) + String.fromCharCode(10, 10);
    return new win.Response(payload, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
  }
  sandbox.fetch = function(input, init) {
    if (typeof init?.body !== 'string') return Reflect.apply(originalFetch, sandbox, [input, init]);
    let body = {};
    try { body = JSON.parse(init.body); } catch (e) {}
    calls.push({ path: String(input).split('://').pop().replace(/^[^/]*/, ''), text: body.text ?? null, model: init?.headers?.model ?? null });
    return responseFor(body.text);
  };
  const originalSegments = controller._segments;
  const originalPosition = controller._position;
  const originalCurrentIndex = controller._currentIndex;
  const anchor = 'This sentence has five words.';
  const mutableVoice = { id: 'fish::en/9fa4b7a1b67446b48208f2f5d4bcd8da', locale: 'en-US' };
  let summary = {};
  try {
    Zotero.Prefs.set('zotero-tts.cacheAudio', true);
    Zotero.Prefs.set('zotero-tts.prefetchEnabled', true);
    controller._segments = Components.utils.cloneInto([
      { text: anchor },
      { text: '<102 exp>' },
      { text: '<4/70 HP >' }
    ], win);
    controller._position = 0;
    controller._currentIndex = 0;
    const primary = await iface.getAudio({ text: anchor }, mutableVoice);
    mutableVoice.locale = 'en-GB';
    const primaryCallIndex = calls.findIndex(x => x.text === anchor);
    const prefetchStart = Date.now();
    const wanted = ['[Speak in American English] 102 exp', '[Speak in American English] 4/70 HP '];
    for (let i = 0; i < 70 && !wanted.every(text => calls.some(x => x.text === text)); i++) await new Promise(resolve => setTimeout(resolve, 100));
    const waitedMs = Date.now() - prefetchStart;
    const prefetched = calls.slice(primaryCallIndex + 1).filter(x => wanted.includes(x.text));
    const beforeReplay = calls.length;
    const replay = await iface.getAudio({ text: '<102 exp>' }, { id: mutableVoice.id, locale: 'en-US' });
    const afterReplay = calls.length;
    const beforeBritish = calls.length;
    const british = await iface.getAudio({ text: '<102 exp>' }, { id: mutableVoice.id, locale: 'en-GB' });
    summary = {
      primary: { audioBytes: primary.audio?.size ?? null, error: primary.error ?? null },
      capturedLocale: 'en-US',
      mutatedLocaleAfterPrimary: mutableVoice.locale,
      prefetch: { waitedMs, calls: prefetched.map(x => x.text), expected: wanted },
      reuse: { replayAudioBytes: replay.audio?.size ?? null, fetchesAdded: afterReplay - beforeReplay },
      british: { audioBytes: british.audio?.size ?? null, fetchesAdded: calls.length - beforeBritish, bodies: calls.slice(beforeBritish).map(x => x.text) },
      allCalls: calls,
      controllerRestoredPending: false
    };
  } catch (e) { summary = { error: String(e), stack: e?.stack || null, calls }; }
  finally {
    controller._segments = originalSegments;
    controller._position = originalPosition;
    controller._currentIndex = originalCurrentIndex;
    sandbox.fetch = originalFetch;
    for (const s of prefKeys) { const b = snap[s]; if (b.user) Zotero.Prefs.set('zotero-tts.' + s, b.value); else Services.prefs.clearUserPref(prefix + s); }
  }
  summary.controllerRestored = controller._segments === originalSegments && controller._position === originalPosition && controller._currentIndex === originalCurrentIndex;
  summary.prefsRestored = prefKeys.every(s => Zotero.Prefs.get('zotero-tts.' + s) === snap[s].value && Services.prefs.prefHasUserValue(prefix + s) === snap[s].user);
  summary.after = { active: !!manager.active, paused: !!manager.paused, voice: manager.selectedVoiceID ?? null, position: controller._position, error: controller._lastError ?? null };
  return JSON.stringify(summary, null, 1);
})()
