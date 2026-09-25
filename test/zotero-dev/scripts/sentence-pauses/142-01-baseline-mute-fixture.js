// The pauses (issues #44, #142): baseline snapshot, mute, and the single
// fixture this run's whole item-3/3.10 check reads from. WebDAV isolation
// is handled once per zotero-dev run outside the kit (workflow "Test WebDAV
// first") and is not repeated here. Named prefs only (workflow "Keys and
// prefs"): the four pause prefs plus volume, globalSpeed and memory --
// nothing bulk-read.
(async () => {
  const PREFIX = 'zotero-tts.';
  const FULL = (k) => 'extensions.zotero.' + PREFIX + k;
  const get = (k) => Zotero.Prefs.get(PREFIX + k);
  const hasUser = (k) => { try { return Services.prefs.prefHasUserValue(FULL(k)); } catch (e) { return null; } };
  const snap = (k) => ({ value: get(k), hasUser: hasUser(k) });

  const prefKeys = [
    'readAloud.volume', 'readAloud.globalSpeed',
    'readAloud.sentenceDelayEnabled', 'readAloud.sentenceDelayMs',
    'readAloud.paragraphDelayEnabled', 'readAloud.paragraphDelayMs',
  ];
  const baseline = {};
  for (const k of prefKeys) baseline[k] = snap(k);

  // The memory is restored last of all prefs (workflow rule), and is not
  // touched by this case at all -- recorded, not changed. The FULL value is
  // kept in state (never in the returned/printed JSON, which reports only
  // the length) so a later run that ever needs to touch it can restore it
  // byte-identically (2026-09-23's own lesson, engine kit 133-01).
  const memoryRaw = get('readAloud.memory');
  baseline['readAloud.memory'] = { len: typeof memoryRaw === 'string' ? memoryRaw.length : memoryRaw, hasUser: hasUser('readAloud.memory') };
  Zotero.ZoteroTTSRun.state.readAloudMemoryFullValue = memoryRaw;
  const memoryVoiceId = (() => { try { return JSON.parse(memoryRaw).voice.id; } catch (e) { return null; } })();
  const memoryIsPluginVoice = typeof memoryVoiceId === 'string' && memoryVoiceId.includes('::');

  // Mute by default (workflow "How to drive"): snapshot done above; 0 now
  Zotero.Prefs.set(PREFIX + 'readAloud.volume', 0);

  // The reading-position row count before any fixture of ours is imported
  const posBefore = JSON.parse(await Zotero.ZoteroTTS.diagnostics.position());

  // The one fixture this run touches (brief: "one reader tab on the kit's
  // fixture") -- fixture-a.pdf, 17 segments, paragraph starts 0/5/9/12/15
  const path = PathUtils.join(Zotero.ZoteroTTSRun.params.fixturesDir, 'fixture-a.pdf');
  const item = await Zotero.Attachments.importFromFile({
    file: path,
    libraryID: Zotero.Libraries.userLibraryID,
    title: 'ztts-142 ' + new Date().toISOString().slice(0, 10) + ' A',
  });
  const fixtureA = { itemID: item.id, key: item.key, title: item.getField('title') };

  Zotero.ZoteroTTSRun.state.baseline = baseline;
  Zotero.ZoteroTTSRun.state.fixtures = { A: fixtureA };
  Zotero.ZoteroTTSRun.state.posBeforeRows = posBefore && posBefore.database ? posBefore.database.rows : null;

  return JSON.stringify({
    baseline,
    memoryIsPluginVoice,
    volumeNowAfterMute: get('readAloud.volume'),
    posBeforeRows: Zotero.ZoteroTTSRun.state.posBeforeRows,
    fixtureA,
  }, null, 1);
})();
