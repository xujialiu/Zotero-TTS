(async () => {
  const itemID = 24425;
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
  const calls = [];
  let delayed = false;
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
    let body = {};
    try { body = JSON.parse(init?.body || '{}'); } catch (e) {}
    calls.push({ path: String(input).split('://').pop().replace(/^[^/]*/, ''), text: body.text ?? null, model: init?.headers?.model ?? null });
    const response = responseFor(body.text);
    return delayed ? new Promise(resolve => win.setTimeout(() => resolve(response), 120)) : response;
  };
  const voice = { id: 'fish::en/9fa4b7a1b67446b48208f2f5d4bcd8da', locale: 'en-US' };
  const summary = {};
  try {
    Zotero.Prefs.set('zotero-tts.cacheAudio', true);
    Zotero.Prefs.set('zotero-tts.prefetchEnabled', false);
    const short = { text: '<100 exp>' };
    const a = await iface.getAudio(short, voice);
    const b = await iface.getAudio(short, voice);
    const ts = [];
    for (const t of (a.timestamps || [])) ts.push({ start: t.start, end: t.end, charStart: t.charStart, charEnd: t.charEnd, slice: short.text.slice(t.charStart, t.charEnd) });
    const ts2 = [];
    for (const t of (b.timestamps || [])) ts2.push({ start: t.start, end: t.end, charStart: t.charStart, charEnd: t.charEnd });
    const beforeLangCalls = calls.length;
    const gb = await iface.getAudio(short, { ...voice, locale: 'en-GB' });
    const enAgain = await iface.getAudio(short, voice);
    summary.cache = { callsAfterEnUSRepeat: beforeLangCalls, callsAfterEnGB: calls.length,
      repeatSameTimestamps: JSON.stringify(ts2) === JSON.stringify(ts.map(({ slice, ...x }) => x)),
      bodies: calls.map(x => x.text), enGBAudioBytes: gb.audio?.size ?? null, enAgainAudioBytes: enAgain.audio?.size ?? null, firstTimestamps: ts };
    const countBeforeExcluded = calls.length;
    const four = await iface.getAudio({ text: '<One two three four>' }, voice);
    const sample = await iface.getAudio('sample', voice);
    const empty = await iface.getAudio({ text: '<>' }, voice);
    summary.exclusions = { fourAudioBytes: four.audio?.size ?? null, sampleAudioBytes: sample.audio?.size ?? null,
      emptyAudioBytes: empty.audio?.size ?? null, emptyTimestamps: !!empty.timestamps, callsAdded: calls.length - countBeforeExcluded,
      bodies: calls.slice(countBeforeExcluded).map(x => x.text), allNoCue: calls.slice(countBeforeExcluded).every(x => !String(x.text).includes('[Speak')) };
    Zotero.Prefs.set('zotero-tts.cacheAudio', false);
    const excludedLocales = [undefined, 'mul', 'und', 'zxx', 'zz', 'en_US', 'en-x-private'];
    const excluded = [];
    const beforeInvalid = calls.length;
    for (const locale of excludedLocales) {
      const result = await iface.getAudio({ text: '<100 exp>' }, { id: voice.id, locale });
      excluded.push({ locale: locale ?? null, audioBytes: result.audio?.size ?? null, error: result.error ?? null });
    }
    summary.invalidLocales = { results: excluded, callsAdded: calls.length - beforeInvalid,
      bodies: calls.slice(beforeInvalid).map(x => x.text), unchanged: calls.slice(beforeInvalid).every(x => x.text === '100 exp') };
    delayed = true;
    const beforeConcurrent = calls.length;
    const concurrentText = { text: '<100 exp concurrent>' };
    const values = await Promise.all([iface.getAudio(concurrentText, voice), iface.getAudio(concurrentText, voice), iface.getAudio(concurrentText, { ...voice, locale: 'en-GB' })]);
    const concurrentCalls = calls.slice(beforeConcurrent);
    summary.concurrent = { calls: concurrentCalls.length, bodies: concurrentCalls.map(x => x.text), distinct: new Set(concurrentCalls.map(x => x.text)).size,
      audioBytes: values.map(v => v.audio?.size ?? null) };
  } catch (e) { summary.error = { message: String(e), stack: e?.stack || null }; }
  finally {
    delayed = false;
    sandbox.fetch = originalFetch;
    for (const s of prefKeys) { const b = snap[s]; if (b.user) Zotero.Prefs.set('zotero-tts.' + s, b.value); else Services.prefs.clearUserPref(prefix + s); }
  }
  summary.calls = calls;
  summary.prefsRestored = prefKeys.every(s => Zotero.Prefs.get('zotero-tts.' + s) === snap[s].value && Services.prefs.prefHasUserValue(prefix + s) === snap[s].user);
  return JSON.stringify(summary, null, 1);
})()
