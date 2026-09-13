(async () => {
  const itemID = 24426;
  const list = Zotero.Reader._readers || [];
  let reader = null;
  for (let i = 0; i < list.length; i++) if (list[i].itemID === itemID) { reader = list[i]; break; }
  const manager = reader && reader._internalReader && reader._readAloudManager;
  const iface = manager && manager._options && manager._options.remoteInterface;
  if (!reader || !manager || !iface) return JSON.stringify({ error: 'fixture remote interface missing' });
  const prefix = 'extensions.zotero.zotero-tts.';
  const prefKeys = ['cacheAudio', 'prefetchEnabled'];
  const snap = {};
  for (const s of prefKeys) snap[s] = { value: Zotero.Prefs.get('zotero-tts.' + s), user: Services.prefs.prefHasUserValue(prefix + s) };
  const sandbox = Components.utils.getGlobalForObject(Zotero.ZoteroTTS.startup);
  const originalFetch = sandbox.fetch;
  const win = reader._window;
  const bytes = await IOUtils.read('/Users/xujialiu/Works/Zotero-TTS/.tmp/fish-locale-test/baseline-100-exp.mp3');
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.slice(i, i + 0x8000));
  const base64 = btoa(binary);
  const calls = [];
  sandbox.fetch = function(input, init) {
    let body = {};
    try { body = JSON.parse(init?.body || '{}'); } catch (e) {}
    const path = String(input).split('://').pop().replace(/^[^/]*/, '');
    calls.push({ path, body });
    if (path === '/dev/captioned_speech') {
      const response = { audio: base64, timestamps: [
        { word: '100', start_time: 0, end_time: 0.2 },
        { word: 'exp', start_time: 0.2, end_time: 0.4 }
      ] };
      return new win.Response(JSON.stringify(response), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new win.Response('{}', { status: 404, headers: { 'Content-Type': 'application/json' } });
  };
  const summary = {};
  try {
    Zotero.Prefs.set('zotero-tts.cacheAudio', false);
    Zotero.Prefs.set('zotero-tts.prefetchEnabled', false);
    const source = { text: '<100 exp>', sourcePosition: { type: 'FragmentSelector', value: 'local-test' } };
    const result = await iface.getAudio(source, { id: 'local::af_bella', locale: 'en-US' });
    const timestamps = [];
    for (const t of (result.timestamps || [])) timestamps.push({ start: t.start, end: t.end, charStart: t.charStart, charEnd: t.charEnd, sourceSlice: source.text.slice(t.charStart, t.charEnd) });
    const sample = await iface.getAudio('sample', { id: 'local::af_bella', locale: 'en-US' });
    summary.result = { audioBytes: result.audio?.size ?? null, error: result.error ?? null, timestamps };
    summary.sample = { audioBytes: sample.audio?.size ?? null, error: sample.error ?? null };
    summary.request = calls.map(x => ({ path: x.path, body: x.body }));
    summary.noCue = calls.every(x => !JSON.stringify(x.body).includes('[Speak in'));
  } catch (e) { summary.error = { message: String(e), stack: e?.stack || null }; }
  finally {
    sandbox.fetch = originalFetch;
    for (const s of prefKeys) { const b = snap[s]; if (b.user) Zotero.Prefs.set('zotero-tts.' + s, b.value); else Services.prefs.clearUserPref(prefix + s); }
  }
  summary.prefsRestored = prefKeys.every(s => Zotero.Prefs.get('zotero-tts.' + s) === snap[s].value && Services.prefs.prefHasUserValue(prefix + s) === snap[s].user);
  summary.after = { active: !!manager.active, paused: !!manager.paused, voice: manager.selectedVoiceID ?? null, position: manager._controller?._position ?? null, error: manager._controller?._lastError ?? null };
  return JSON.stringify(summary, null, 1);
})()
