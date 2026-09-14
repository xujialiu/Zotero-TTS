return (async () => {
  const state = Zotero.ZoteroTTSRun.state, transport = state.transport, entry = transport.readers.pdf;
  if (!entry?.manager) throw new Error('PDF fixture manager is missing');
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const rows = () => { const a = entry.manager.voicesForLanguage || [], out = []; for (let i = 0; i < a.length; i++) out.push({ id: a[i]?.id ?? null, language: a[i]?.language ?? null }); return out; };
  const savedVoices = { ...transport.catalog.voices }, savedLocales = { ...transport.catalog.locales };
  const out = { before: null, singleton: null, fallback: null, restore: null, errors: [] };
  try {
    if (entry.manager.active && !entry.manager.paused) entry.manager.pause();
    entry.manager.selectVoice('p106-gb-a'); await sleep(350);
    if (entry.manager.active && !entry.manager.paused) entry.manager.pause();
    out.before = { selected: entry.manager.selectedVoiceID ?? null, offered: rows(), controller: !!entry.manager._controller };
    out.singleton = { selected: out.before.selected, offered: out.before.offered, oneVoice: out.before.offered.length === 1,
      controller: out.before.controller };
    delete transport.catalog.voices['p106-gb-a']; transport.catalog.locales['en-GB'] = [];
    await entry.manager.loadVoices(true); await sleep(350);
    try { entry.manager.setLanguage('en-GB'); } catch (e) { out.errors.push('setLanguage after removal: ' + String(e)); }
    await sleep(350);
    if (entry.manager.active && !entry.manager.paused) entry.manager.pause();
    out.fallback = { selected: entry.manager.selectedVoiceID ?? null, lang: entry.manager.lang ?? null, region: entry.manager.region ?? null,
      offered: rows(), controller: !!entry.manager._controller, voice: !!entry.manager._voice,
      diagnostic: JSON.parse(Zotero.ZoteroTTS.diagnostics.playerVoiceList())[Zotero.Reader._readers.indexOf(entry.reader)] };
    out.fallback.usable = out.fallback.offered.length > 0 && !!out.fallback.controller && !!out.fallback.voice;
  } catch (e) { out.errors.push(String(e)); }
  finally {
    transport.catalog.voices = { ...savedVoices }; transport.catalog.locales = { ...savedLocales };
    try { await entry.manager.loadVoices(true); await sleep(250); } catch (e) { out.errors.push('restore catalog: ' + String(e)); }
    out.restore = { selected: entry.manager.selectedVoiceID ?? null, offered: rows(), controller: !!entry.manager._controller,
      catalogVoiceCount: Object.keys(transport.catalog.voices).length, errors: out.errors.slice() };
  }
  state.fallbackResult = out;
  return JSON.stringify(out, null, 1);
})()
