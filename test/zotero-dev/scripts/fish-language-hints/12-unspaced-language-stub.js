(async () => {
  let fixtureID = null;
  let reader = null;
  const result = { errors: [], calls: [] };
  const prefix = 'extensions.zotero.zotero-tts.';
  const prefKeys = ['cacheAudio', 'prefetchEnabled'];
  const snap = {};
  const sandbox = Components.utils.getGlobalForObject(Zotero.ZoteroTTS.startup);
  const originalFetch = sandbox.fetch;
  try {
    const imported = await Zotero.Attachments.importFromFile({
      file: '/Users/xujialiu/Works/Zotero-TTS/test/fixtures/angle-brackets/angle-brackets.epub',
      libraryID: Zotero.Libraries.userLibraryID,
      title: 'Zotero-TTS issue #98 language hint fixture 2026-09-13 unspaced'
    });
    const item = typeof imported === 'number' ? Zotero.Items.get(imported) : imported;
    fixtureID = item?.id ?? imported?.id ?? imported;
    Zotero.Reader.open(fixtureID);
    for (let i = 0; i < 70; i++) {
      const list = Zotero.Reader._readers || [];
      for (let j = 0; j < list.length; j++) if (list[j].itemID === fixtureID && list[j]._internalReader?._readAloudManager?._options?.remoteInterface) { reader = list[j]; break; }
      if (reader) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (!reader) throw new Error('fixture reader did not initialize');
    const manager = reader._internalReader._readAloudManager;
    const iface = manager._options.remoteInterface;
    for (const s of prefKeys) snap[s] = { value: Zotero.Prefs.get('zotero-tts.' + s), user: Services.prefs.prefHasUserValue(prefix + s) };
    const win = reader._window;
    const bytes = await IOUtils.read('/Users/xujialiu/Works/Zotero-TTS/.tmp/fish-locale-test/baseline-100-exp.mp3');
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.slice(i, i + 0x8000));
    const base64 = btoa(binary);
    sandbox.fetch = function(input, init) {
      if (typeof init?.body !== 'string') return Reflect.apply(originalFetch, sandbox, [input, init]);
      let body = {};
      try { body = JSON.parse(init.body); } catch (e) {}
      result.calls.push({ path: String(input).split('://').pop().replace(/^[^/]*/, ''), text: body.text ?? null });
      const raw = String(body.text || '').replace(/^\[Speak in [^\]]+\]\s*/u, '');
      const words = [];
      const re = /[\p{L}\p{N}]+/gu;
      let match; let n = 0;
      while ((match = re.exec(raw)) && n < 20) { words.push({ text: match[0], start: n * 0.2, end: (n + 1) * 0.2 }); n++; }
      const payload = 'data: ' + JSON.stringify({ audio_base64: base64, chunk_seq: 0, alignment: { segments: words } }) + String.fromCharCode(10, 10);
      return new win.Response(payload, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
    };
    Zotero.Prefs.set('zotero-tts.cacheAudio', false);
    Zotero.Prefs.set('zotero-tts.prefetchEnabled', false);
    const voice = { id: 'fish::en/9fa4b7a1b67446b48208f2f5d4bcd8da', locale: 'en-US' };
    const specs = [
      { name: 'single-word', source: '<One>', voice },
      { name: 'unspaced-two-words', source: '<你好世界>', voice: { ...voice, locale: 'zh-CN' } },
      { name: 'unspaced-four-words', source: '<你好世界今天快乐>', voice: { ...voice, locale: 'zh-CN' } }
    ];
    result.results = [];
    for (const spec of specs) {
      const response = await iface.getAudio({ text: spec.source, sourcePosition: { type: 'FragmentSelector', value: spec.name } }, spec.voice);
      result.results.push({ name: spec.name, locale: spec.voice.locale, audioBytes: response.audio?.size ?? null, error: response.error ?? null });
    }
  } catch (e) { result.error = { message: String(e), stack: e?.stack || null }; }
  finally {
    sandbox.fetch = originalFetch;
    for (const s of prefKeys) {
      const b = snap[s];
      if (!b) continue;
      if (b.user) Zotero.Prefs.set('zotero-tts.' + s, b.value); else Services.prefs.clearUserPref(prefix + s);
    }
    if (reader) {
      try { reader._internalReader?.toggleReadAloudPopup(false); } catch (e) { result.errors.push('toggle: ' + String(e)); }
      await new Promise(resolve => setTimeout(resolve, 500));
      try { const p = reader.close(); if (p && typeof p.then === 'function') await p; result.closed = true; } catch (e) { result.errors.push('close: ' + String(e)); }
    }
    if (fixtureID !== null) {
      for (let i = 0; i < 40; i++) {
        let found = false; const list = Zotero.Reader._readers || [];
        for (let j = 0; j < list.length; j++) if (list[j].itemID === fixtureID) { found = true; break; }
        if (!found) break;
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      try { const item = Zotero.Items.get(fixtureID); if (item) { await item.eraseTx(); result.erased = true; } } catch (e) { result.errors.push('erase: ' + String(e)); }
    }
  }
  result.remainingFixtureReaders = 0;
  const now = Zotero.Reader._readers || [];
  for (let i = 0; i < now.length; i++) if (now[i].itemID === fixtureID) result.remainingFixtureReaders++;
  result.prefsRestored = prefKeys.every(s => snap[s] && Zotero.Prefs.get('zotero-tts.' + s) === snap[s].value && Services.prefs.prefHasUserValue(prefix + s) === snap[s].user);
  result.user = [];
  for (let i = 0; i < now.length; i++) {
    const r = now[i], m = r._internalReader && r._internalReader._readAloudManager, c = m && m._controller;
    result.user.push({ itemID: r.itemID, active: !!m?.active, paused: m ? !!m.paused : null, voice: m?.selectedVoiceID ?? null, position: c?._position ?? null, error: c?._lastError ?? null });
  }
  return JSON.stringify(result, null, 1);
})()
