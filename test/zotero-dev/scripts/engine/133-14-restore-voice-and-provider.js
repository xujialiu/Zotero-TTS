// Cleanup between phases: fixture A back to a real Fish voice (off the fake
// local::af_fake test voice used for items 13/17/23), and the local
// (Kokoro-engine) provider back to disabled with its original baseURL --
// the fake server run for items 13/23 is stopped separately (see the kit
// README's "before you start").
// params: restoreVoiceID, originalLocalEnabled, originalLocalBaseURL. state: reads
// fixtures.A; writes restoreVoiceAndProvider.
(async () => {
  const S = Zotero.ZoteroTTSRun.state;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const itemID = S.fixtures.A.itemID;
  let r = null;
  for (const x of Zotero.Reader._readers || []) if (x.itemID === itemID) r = x;
  if (!r) throw new Error('fixture A reader not found');
  const ir = r._internalReader;
  let m = ir._readAloudManager;

  if (m.active && !m.paused) { try { m.pause(); } catch (e) {} }
  m.selectTier('fish');
  await sleep(200);
  m.selectVoice(Zotero.ZoteroTTSRun.params.restoreVoiceID); // the voice memory-sync had settled on for this profile
  await sleep(400);

  const PREFIX = 'zotero-tts.';
  Zotero.Prefs.set(PREFIX + 'local.enabled', Zotero.ZoteroTTSRun.params.originalLocalEnabled);
  Zotero.Prefs.set(PREFIX + 'local.baseURL', Zotero.ZoteroTTSRun.params.originalLocalBaseURL);

  const out = {
    selectedVoiceID: m.selectedVoiceID, hasController: !!m._controller, active: m.active, paused: m.paused,
    localEnabled: Zotero.Prefs.get(PREFIX + 'local.enabled'), localBaseURL: Zotero.Prefs.get(PREFIX + 'local.baseURL'),
  };
  S.restoreVoiceAndProvider = out;
  return JSON.stringify(out, null, 1);
})();
