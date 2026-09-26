(async () => {
  const run = Zotero.ZoteroTTSRun;
  const state = run.state;
  const params = run.params;
  const prefs = Services.prefs;
  const prefix = 'extensions.zotero.zotero-tts.';
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const waitFor = async (test, timeout = 20000, step = 100) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      let value = null;
      try { value = await test(); } catch (_) {}
      if (value) return value;
      await sleep(step);
    }
    try { return await test(); } catch (_) { return null; }
  };
  const pref = suffix => prefix + suffix;
  const readerOf = itemID => { const list = Zotero.Reader?._readers || []; for (let i = 0; i < list.length; i++) if (list[i]?.itemID === itemID) return list[i]; return null; };
  const diag = itemID => {
    let report;
    try { report = JSON.parse(Zotero.ZoteroTTS.diagnostics.engine()); } catch (error) { return { error: String(error) }; }
    const rows = report.readers || [];
    for (let i = 0; i < rows.length; i++) if (rows[i]?.itemID === itemID) return rows[i];
    return null;
  };
  const select = reader => {
    const host = Zotero.getMainWindow();
    if (host?.windowState === 2 && host.restore) host.restore();
    host?.focus?.();
    try { Zotero_Tabs.select(reader.tabID); } catch (_) {}
    try { reader._window?.focus?.(); reader.focus?.(); reader._iframeWindow?.focus?.(); } catch (_) {}
  };
  const waitReader = async itemID => await waitFor(() => {
    const reader = readerOf(itemID);
    return reader?._internalReader?._readAloudManager ? reader : null;
  }, 24000);
  const openSession = async (item, label) => {
    const opened = Zotero.Reader.open(item.id, null, { openInBackground: false, allowDuplicate: false });
    if (opened?.then) await opened;
    const reader = await waitReader(item.id);
    if (!reader) throw new Error(label + ' reader/manager did not initialize');
    select(reader);
    const internal = reader._internalReader;
    const manager = internal._readAloudManager;
    // Temporarily leave only the deterministic local provider in the list.
    // This prevents a saved Fish/System choice from starting metered audio
    // while the new reader builds its asynchronous voice list.
    prefs.setBoolPref(pref('fish.enabled'), false);
    prefs.setBoolPref(pref('system.enabled'), false);
    const popup = internal._state?.readAloudState?.popupOpen;
    if (!popup) internal.toggleReadAloudPopup(true);
    const target = await waitFor(() => {
      const voices = manager.allVoices || [];
      for (let i = 0; i < Number(voices.length || 0); i++) {
        const voice = voices[i];
        if (String(voice?.id || '') === 'local::af_bella') return voice;
      }
      return null;
    }, 15000);
    if (!target) throw new Error(label + ' deterministic local voice was not offered');
    const tier = String(target.tier || target.provider?.id || 'kokoro');
    if (typeof manager.selectTier === 'function') await manager.selectTier(tier);
    if (typeof manager.selectVoice === 'function') await manager.selectVoice('local::af_bella');
    await waitFor(() => String(manager.selectedVoiceID || '') === 'local::af_bella', 6000);
    const active = await waitFor(() => manager.active && (manager._controller || manager._segments?.length) ? manager : null, 24000);
    if (!active) throw new Error(label + ' Read Aloud session did not start');
    const pluginVoice = String(manager.selectedVoiceID || '').includes('::');
    if (!pluginVoice) throw new Error(label + ' selected a non-plugin voice; refusing metered playback');
    // Let the deterministic server supply at least one clip so the estimate
    // moves from the text prior to a measured finite value, then pause.
    const ready = await waitFor(() => {
      const row = diag(item.id);
      return row?.session?.remainingTime?.status === 'ready' ? row : null;
    }, 18000);
    if (manager.active && !manager.paused) manager.pause();
    await waitFor(() => manager.paused, 3000);
    return { reader, manager, diag: ready || diag(item.id), pluginVoice };
  };
  const importFixture = async (relative, title) => {
    const parts = String(relative).split('/');
    const item = await Zotero.Attachments.importFromFile({ file: PathUtils.join(params.fixturesDir, ...parts), libraryID: Zotero.Libraries.userLibraryID, title });
    const record = { id: item.id, key: item.key, title: item.getField('title'), relative };
    return { item, record };
  };
  const closeSession = async reader => {
    if (!reader) return;
    try { reader._internalReader?.toggleReadAloudPopup(false); } catch (_) {}
    await waitFor(() => !reader._internalReader?._state?.readAloudState?.popupOpen && !reader._internalReader?._readAloudManager?.active, 6000, 80);
    try { reader.close?.(); } catch (_) {}
    await waitFor(() => !readerOf(reader.itemID), 10000, 100);
  };
  const out = { step: 'epub-scope-and-fallback', closedOwnerReaders: [], epub: {}, pdf: {} };

  // The owner left a paused player open. Close it only because this check must
  // change voice/provider settings; never reopen it later.
  const before = state.isolation?.readersBefore || [];
  for (let i = 0; i < before.length; i++) {
    const entry = before[i];
    if (!entry.active) continue;
    const owner = readerOf(entry.itemID);
    if (!owner) continue;
    try { owner._internalReader?.toggleReadAloudPopup(false); } catch (_) {}
    await waitFor(() => !owner._internalReader?._state?.readAloudState?.popupOpen && !owner._internalReader?._readAloudManager?.active, 6000, 80);
    out.closedOwnerReaders.push({ itemID: entry.itemID, tabID: entry.tabID, wasPaused: entry.paused, popupWasOpen: entry.popupOpen });
  }

  // Deterministic local provider: fixed three-second WAV and fixed word times.
  prefs.setBoolPref(pref('local.enabled'), true);
  prefs.setStringPref(pref('local.baseURL'), String(params.deterministicBaseURL));
  prefs.setStringPref(pref('local.voice'), 'af_bella');
  prefs.setStringPref(pref('local.headers'), '');
  prefs.setBoolPref(pref('prefetchEnabled'), false);
  const deterministicMemory = JSON.stringify({ speed: 1, voice: { id: 'local::af_bella', lang: 'en' }});
  prefs.setStringPref(pref('readAloud.defaultVoice'), deterministicMemory);
  prefs.setStringPref(pref('readAloud.memory'), deterministicMemory);
  prefs.setBoolPref(pref('readAloud.remainingTime'), true);
  prefs.setIntPref(pref('readAloud.volume'), 0);

  const runTag = String(params.runId || Date.now()).replace(/[^A-Za-z0-9_-]/g, '_');
  const epub = await importFixture('remaining-time/remaining-time.epub', 'Zotero-TTS #148 remaining-time EPUB ' + runTag);
  state.fixtures = state.fixtures || {};
  state.fixtures.epub = epub.record;
  const epubSession = await openSession(epub.item, 'EPUB');
  const er = epubSession.reader;
  const ei = er._internalReader;
  const segments = ei._readAloudSegments?.segments || [];
  if (!segments.length) throw new Error('EPUB has no Read Aloud segments');
  let outline = null;
  try { outline = JSON.parse(JSON.stringify(ei._sdt?.structure?.catalog?.outline || null)); } catch (_) { outline = null; }
  out.epub.segments = segments.length;
  out.epub.outline = outline;
  out.epub.initial = diag(epub.item.id)?.session?.remainingTime || null;
  const indexWith = text => { for (let i = 0; i < segments.length; i++) if (String(segments[i]?.text || '').includes(text)) return i; return -1; };
  const part2 = indexWith('Part 2,');
  const nestedPart1 = indexWith('Part 1, chapter 2,');
  if (part2 < 1 || nestedPart1 < 0) throw new Error('EPUB boundary text was not segmented as expected');
  const move = async index => {
    const m = ei._readAloudManager;
    if (!m.active) throw new Error('EPUB manager became inactive before boundary move');
    try { m.repositionTo(index); } catch (error) { throw new Error('repositionTo(' + index + ') failed: ' + String(error)); }
    await sleep(250);
    if (m.active && !m.paused) m.pause();
    await waitFor(() => m.paused, 3000, 50);
    return diag(epub.item.id)?.session?.remainingTime || null;
  };
  out.epub.boundaries = {
    nestedChapterWithinPart1: { index: nestedPart1, snapshot: await move(nestedPart1) },
    part1LastSegment: { index: part2 - 1, snapshot: await move(part2 - 1) },
    firstPart2Segment: { index: part2, snapshot: await move(part2) },
  };
  out.epub.positionTexts = { nestedChapterWithinPart1: String(segments[nestedPart1]?.text || '').slice(0, 120), firstPart2: String(segments[part2]?.text || '').slice(0, 120) };
  const b = out.epub.boundaries;
  const snapshots = [b.nestedChapterWithinPart1.snapshot, b.part1LastSegment.snapshot, b.firstPart2Segment.snapshot];
  if (!snapshots.every(value => value?.status === 'ready' && value.scope === 'document')) throw new Error('EPUB boundary estimates were not ready/document scope');
  if (b.nestedChapterWithinPart1.snapshot.sectionTitle !== 'Part 1' || b.part1LastSegment.snapshot.sectionTitle !== 'Part 1' || b.firstPart2Segment.snapshot.sectionTitle !== 'Part 2') {
    throw new Error('EPUB section titles did not follow Part 1/Part 2 boundary: ' + JSON.stringify(out.epub.boundaries));
  }
  for (const value of snapshots) if (!(value.sectionSeconds <= value.seconds)) throw new Error('sectionSeconds exceeded document seconds');

  // An outline-free PDF must retain document scope while still estimating.
  const pdf = await importFixture('fixture-a.pdf', 'Zotero-TTS #148 remaining-time PDF ' + runTag);
  state.fixtures.pdf = pdf.record;
  const pdfSession = await openSession(pdf.item, 'PDF');
  out.pdf.segments = pdfSession.reader._internalReader?._readAloudSegments?.segments?.length || 0;
  out.pdf.remaining = diag(pdf.item.id)?.session?.remainingTime || null;
  const outlineMarkers = (() => { try { return JSON.parse(JSON.stringify(pdfSession.reader._internalReader?._sdt?.structure?.catalog?.outline || null)); } catch (_) { return null; } })();
  out.pdf.outline = outlineMarkers;
  if (out.pdf.remaining?.scope !== 'document' || out.pdf.remaining?.sectionTitle !== undefined || out.pdf.remaining?.sectionSeconds !== undefined) throw new Error('outline-free PDF exposed section estimate: ' + JSON.stringify(out.pdf.remaining));
  state.scopeResults = out;
  return JSON.stringify(out, null, 1);
})()
