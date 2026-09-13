(async () => {
  const itemID = 24426;
  const list = Zotero.Reader._readers || [];
  let reader = null;
  for (let i = 0; i < list.length; i++) if (list[i].itemID === itemID) { reader = list[i]; break; }
  if (!reader) return JSON.stringify({ error: 'fixture reader missing' });
  const internal = reader._internalReader;
  const manager = internal && internal._readAloudManager;
  const sandbox = Components.utils.getGlobalForObject(Zotero.ZoteroTTS.startup);
  const originalFetch = sandbox.fetch;
  const win = reader._window;
  const calls = [];
  const prefix = 'extensions.zotero.zotero-tts.';
  const oldPrefetch = { value: Zotero.Prefs.get('zotero-tts.prefetchEnabled'), user: Services.prefs.prefHasUserValue(prefix + 'prefetchEnabled') };
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
    try { body = JSON.parse(init?.body || '{}'); } catch (e) {}
    calls.push({ path: String(input).split('://').pop().replace(/^[^/]*/, ''), text: body.text ?? null, model: init?.headers?.model ?? null });
    return responseFor(body.text);
  };
  const trace = [];
  let error = null;
  try {
    Zotero.Prefs.set('zotero-tts.prefetchEnabled', false);
    internal.toggleReadAloudPopup(true);
    for (let i = 0; i < 70; i++) {
      const c = manager && manager._controller;
      trace.push({ ms: i * 100, active: !!manager?.active, paused: manager ? !!manager.paused : null,
        voice: manager?.selectedVoiceID ?? null, tier: manager ? manager._selectedTier : null,
        controller: !!c, segments: c?._segments?.length ?? null, position: c?._position ?? null });
      if (manager?.active && c && !manager.paused) {
        try { manager.pause(); } catch (e) { error = 'pause ' + String(e); }
        await new Promise(resolve => setTimeout(resolve, 600));
        break;
      }
      if (manager?.active && c && manager.paused) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  } catch (e) { error = String(e); }
  finally {
    sandbox.fetch = originalFetch;
    if (oldPrefetch.user) Zotero.Prefs.set('zotero-tts.prefetchEnabled', oldPrefetch.value);
    else Services.prefs.clearUserPref(prefix + 'prefetchEnabled');
  }
  const c = manager && manager._controller;
  return JSON.stringify({ error, calls, traceCount: trace.length,
    trace: trace.length > 6 ? [trace[0], trace[1], trace[trace.length - 2], trace[trace.length - 1]] : trace,
    final: trace[trace.length - 1] || null, after: { active: !!manager?.active, paused: manager ? !!manager.paused : null,
      voice: manager?.selectedVoiceID ?? null, position: c?._position ?? null, error: c?._lastError ?? null }, segments: c?._segments?.length ?? null }, null, 1);
})()
