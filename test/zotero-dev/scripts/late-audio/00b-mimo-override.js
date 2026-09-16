// Run AFTER 00-baseline-and-mute.js, only when Kokoro answered too fast to
// catch (see 00's header): temporarily enables Xiaomi MiMo (already
// configured -- an API key is set -- but off) and points readAloud.memory at
// one of its documented built-in voices, mimo::mimo_default (MIMO_VOICES in
// src/core/providers/mimo.ts; no voice listing needed, so no extra request).
// MiMo is paid per request -- live, this run needed exactly four short
// reads (31 to ~132 chars each) across items 1 and 3 to get a clean getAudio
// drop in each. 90-cleanup-restore.js's own restore order includes
// mimo.enabled, so running 90 after 01/03 restores it along with the rest --
// no separate hand restore needed.
// params: none. state: reads baseline (must have run already).
(async () => {
  const out = { step: 'mimo-override' };
  const S = Zotero.ZoteroTTSRun.state;
  try {
    if (!S.baseline) throw new Error('00-baseline-and-mute.js must run first');
    Zotero.Prefs.set('zotero-tts.mimo.enabled', true);
    Zotero.Prefs.set('zotero-tts.readAloud.memory', JSON.stringify({ speed: 1, voice: { id: 'mimo::mimo_default', lang: 'en' } }));
    out.mimoEnabledNow = Zotero.Prefs.get('zotero-tts.mimo.enabled');
    out.memoryNow = Zotero.Prefs.get('zotero-tts.readAloud.memory');
  } catch (e) {
    out.error = String(e);
    throw e;
  }
  return JSON.stringify(out, null, 1);
})();
