// The Engine (issue #133): baseline snapshot, mute, and the fixtures this
// kit reads from for the whole run. Fixture WebDAV isolation is handled once
// per zotero-dev run outside the kit (workflow "Test WebDAV first") and is
// not repeated here.
(async () => {
  const PREFIX = 'zotero-tts.';
  const FULL = (k) => 'extensions.zotero.' + PREFIX + k;
  const get = (k) => Zotero.Prefs.get(PREFIX + k);
  const hasUser = (k) => { try { return Services.prefs.prefHasUserValue(FULL(k)); } catch (e) { return null; } };
  const snap = (k) => ({ value: get(k), hasUser: hasUser(k) });

  const prefKeys = [
    'readAloud.volume', 'readAloud.sameForAllDocuments', 'readAloud.globalSpeed',
    'readAloud.sentenceDelayEnabled', 'readAloud.sentenceDelayMs',
    'readAloud.paragraphDelayEnabled', 'readAloud.paragraphDelayMs',
    'prefetch', 'prefetchEnabled', 'cacheAudio',
    'fish.enabled', 'fish.freeOnly', 'azure.enabled', 'speechify.enabled',
    'local.enabled', 'local.baseURL', 'system.enabled',
    'zotero-standard.enabled', 'zotero-premium.enabled',
    'highlight.word', 'highlight.sentence',
  ];
  const baseline = {};
  for (const k of prefKeys) baseline[k] = snap(k);
  // The memory is restored last of all prefs (workflow rule); snapshot its
  // length only, never its value (it may carry a voice id and speed)
  const memoryRaw = get('readAloud.memory');
  baseline['readAloud.memory'] = { len: typeof memoryRaw === 'string' ? memoryRaw.length : memoryRaw, hasUser: hasUser('readAloud.memory') };
  const memoryVoicePrefix = (() => {
    try { return JSON.parse(memoryRaw).voice && JSON.parse(memoryRaw).voice.id ? String(JSON.parse(memoryRaw).voice.id).split('::')[0] : null; } catch (e) { return 'parse-error'; }
  })();
  const memoryHasDoubleColon = typeof memoryRaw === 'string' && memoryRaw.includes('::');

  // Mute by default (workflow "How to drive"): snapshot done above; set to 0 now
  Zotero.Prefs.set(PREFIX + 'readAloud.volume', 0);

  // The reading-position row count before any fixture is imported (baseline.md)
  const posBefore = JSON.parse(await Zotero.ZoteroTTS.diagnostics.position());

  // Fixtures: fixture-a.pdf (17 segments) is the main reading fixture,
  // fixture-b.pdf (6 segments) is the short one for a fast full read (item 15)
  const importFixture = async (name, title) => {
    const path = PathUtils.join(Zotero.ZoteroTTSRun.params.fixturesDir, name);
    const item = await Zotero.Attachments.importFromFile({
      file: path,
      libraryID: Zotero.Libraries.userLibraryID,
      title,
    });
    return { itemID: item.id, key: item.key, title: item.getField('title') };
  };
  const fixtureA = await importFixture('fixture-a.pdf', 'ztts-133 2026-09-23 A');
  const fixtureB = await importFixture('fixture-b.pdf', 'ztts-133 2026-09-23 B');

  Zotero.ZoteroTTSRun.state.baseline = baseline;
  Zotero.ZoteroTTSRun.state.fixtures = { A: fixtureA, B: fixtureB };
  Zotero.ZoteroTTSRun.state.posBeforeRows = posBefore && posBefore.database ? posBefore.database.rows : null;

  return JSON.stringify({
    baseline,
    memoryVoicePrefix,
    memoryHasDoubleColon,
    volumeNowAfterMute: get('readAloud.volume'),
    posBeforeRows: Zotero.ZoteroTTSRun.state.posBeforeRows,
    fixtureA,
    fixtureB,
  }, null, 1);
})();
