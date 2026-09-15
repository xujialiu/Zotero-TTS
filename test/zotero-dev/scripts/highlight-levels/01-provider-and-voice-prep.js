// Prepares the run to stay on Azure only, without ever touching the
// owner's own open reader (itemID from state.owner, "paper", active+paused
// on a fish voice). This profile has readAloud.sameForAllDocuments AND
// globalSpeed ON, which would normally spread a fresh voice/speed pick to
// every OTHER active reader (memory-sync.ts spreadVoice/spread) -- so
// sameForAllDocuments is turned off for the whole run before the voice
// memory is touched, and restored only after every fixture tab this run
// opened is closed again.
return (async () => {
  const Zp = Zotero.Prefs;
  const fullName = (rel) => 'extensions.zotero.' + rel;
  const snap = (rel) => ({ value: Zp.get(rel), hasUserValue: Services.prefs.prefHasUserValue(fullName(rel)) });

  const before = {
    azureEnabled: snap('zotero-tts.azure.enabled'),
    sameForAllDocuments: snap('zotero-tts.readAloud.sameForAllDocuments'),
    readerReadAloudVoicesRaw: Services.prefs.getStringPref(fullName('reader.readAloudVoices'), '{}'),
    readAloudMemoryRaw: Services.prefs.getStringPref(fullName('zotero-tts.readAloud.memory'), '{}'),
  };

  // The owner's own reader, when one is open: its itemID comes in as
  // params.ownerItemID (the tester reads it off Zotero.Reader._readers before
  // the run); never touched, only read back at the end (17)
  const owner = { itemID: Zotero.ZoteroTTSRun.params.ownerItemID ?? null, note: 'the owner\'s own reader; never touched by this run' };
  const ownerBefore = (() => {
    if (owner.itemID === null) return null;
    const r = (Zotero.Reader._readers || []).find((x) => x.itemID === owner.itemID);
    const m = r?._internalReader?._readAloudManager;
    return { active: !!m?.active, paused: !!m?.paused, selectedVoiceID: m?.selectedVoiceID ?? null };
  })();

  // 1) Isolate: no spread of this run's voice pick to the owner's active reader
  Zp.set('zotero-tts.readAloud.sameForAllDocuments', false);

  // 2) Azure is configured (a key is set) but off; the testing rule allows
  // temporarily enabling a configured, currently-disabled provider
  Zp.set('zotero-tts.azure.enabled', true);

  // 3) Point the 'en' entry (and its Azure tier slot) at ChristopherNeural,
  // real word timing, keeping every other field and every other language
  const voices = JSON.parse(before.readerReadAloudVoicesRaw || '{}');
  const AZURE_ID = 'azure::en-US-ChristopherNeural';
  const enBefore = voices.en ? JSON.parse(JSON.stringify(voices.en)) : null;
  voices.en = voices.en || { region: 'US', speed: 1.8, tierVoices: {} };
  voices.en.voice = AZURE_ID;
  voices.en.tierVoices = { ...(voices.en.tierVoices || {}), azure: AZURE_ID };
  Services.prefs.setStringPref(fullName('reader.readAloudVoices'), JSON.stringify(voices));

  const after = {
    azureEnabled: snap('zotero-tts.azure.enabled'),
    sameForAllDocuments: snap('zotero-tts.readAloud.sameForAllDocuments'),
    readerReadAloudVoicesEn: voices.en,
    readAloudMemoryRaw: Services.prefs.getStringPref(fullName('zotero-tts.readAloud.memory'), '{}'),
  };
  const ownerAfter = (() => {
    const r = (Zotero.Reader._readers || []).find((x) => x.itemID === owner.itemID);
    const m = r?._internalReader?._readAloudManager;
    return { active: !!m?.active, paused: !!m?.paused, selectedVoiceID: m?.selectedVoiceID ?? null };
  })();

  Zotero.ZoteroTTSRun.state.voicePrep = { before, enBefore, owner };

  return JSON.stringify({ before, after, ownerBefore, ownerAfter, ownerUnchanged: ownerBefore.selectedVoiceID === ownerAfter.selectedVoiceID && ownerBefore.paused === ownerAfter.paused }, null, 1);
})();
