// Item 21: Zotero's Standard and Premium, played by the Engine. A few
// sentences each (spend agreed 2026-09-23): controller.ours true,
// session.voice Zotero's id, the debug log shows no plugin provider line,
// manager.minutesRemaining/refreshCreditsRemaining as before. Switches
// restored, sameForAllDocuments held false for the run (memory-sync's
// spreadVoice) and restored after.
// params: none. state: reads fixtures.A; writes item21.
(async () => {
  const S = Zotero.ZoteroTTSRun.state;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = { step: 'item21-zotero-tiers' };
  const itemID = S.fixtures.A.itemID;
  let r = null;
  for (const x of Zotero.Reader._readers || []) if (x.itemID === itemID) r = x;
  if (!r) throw new Error('fixture A reader not found');
  const ir = r._internalReader;
  let m = ir._readAloudManager;

  const PREFIX = 'zotero-tts.';
  const get = (k) => Zotero.Prefs.get(PREFIX + k);
  const set = (k, v) => Zotero.Prefs.set(PREFIX + k, v);
  const before = { std: get('zotero-standard.enabled'), prem: get('zotero-premium.enabled'), sameForAll: get('readAloud.sameForAllDocuments') };
  set('zotero-standard.enabled', true);
  set('zotero-premium.enabled', true);
  set('readAloud.sameForAllDocuments', false);
  await sleep(300);

  const engineFor = async () => {
    const eng = JSON.parse(await Zotero.ZoteroTTS.diagnostics.engine());
    for (let i = 0; i < eng.readers.length; i++) if (eng.readers[i].itemID === itemID) return eng.readers[i];
    return null;
  };
  const debugLenNow = async () => (await Zotero.Debug.get()).length;

  if (m.active && !m.paused) { try { m.pause(); } catch (e) {} }
  m.loadVoices(true);
  await sleep(1000);
  const mw = Components.utils.waiveXrays(m);
  const voices = mw.allVoices;
  let standardVoice = null, premiumVoice = null;
  for (let i = 0; i < voices.length; i++) {
    const v = Components.utils.waiveXrays(voices[i]);
    if (!standardVoice && v.tier === 'standard' && !String(v.id).includes('::')) standardVoice = v.id;
    if (!premiumVoice && v.tier === 'premium' && !String(v.id).includes('::')) premiumVoice = v.id;
  }
  out.foundVoices = { standardVoice, premiumVoice };

  const runOne = async (tier, voiceId) => {
    if (!voiceId) return { skipped: true };
    m = ir._readAloudManager;
    m.selectTier(tier);
    await sleep(200);
    m.selectVoice(voiceId);
    await sleep(300);
    const debugBefore = await debugLenNow();
    m = ir._readAloudManager;
    m.setSpeed(1);
    if (!m.active) { try { ir.toggleReadAloudPopup(true); } catch (e) {} }
    for (let i = 0; i < 200; i++) { m = ir._readAloudManager; if (m.active) break; await sleep(50); }
    if (m.paused) m.play();
    let played = false;
    const t0 = Date.now();
    while (Date.now() - t0 < 20000) { const e = await engineFor(); if (e.session.playing) { played = true; break; } await sleep(50); }
    const mid = await engineFor();
    await sleep(1500); // a few real sentences' worth
    const controller = Components.utils.waiveXrays(m._controller);
    let minutesRemaining = null, hasStandardMinutesRemaining = null;
    try { minutesRemaining = controller.minutesRemaining; hasStandardMinutesRemaining = controller.hasStandardMinutesRemaining; } catch (e) {}
    if (m.active && !m.paused) { try { m.pause(); } catch (e) {} }
    const debugAfter = await debugLenNow();
    const debugDelta = (await Zotero.Debug.get()).slice(debugBefore);
    const pluginProviderLine = /\[zotero-tts\] (fish|azure|speechify|local|openai-official|mimo|compatible|cloudflare|system):/i.test(debugDelta);
    return {
      played, selectedVoiceID: m.selectedVoiceID, sessionVoice: mid.session.voice, controllerOurs: mid.controller ? mid.controller.ours : null,
      audioState: mid.audio.state, minutesRemaining, hasStandardMinutesRemaining, pluginProviderLineSeen: pluginProviderLine,
      debugDeltaTail: debugDelta.slice(-400),
    };
  };

  out.standard = await runOne('standard', standardVoice);
  out.premium = await runOne('premium', premiumVoice);

  // Restore: switches, sameForAllDocuments, and the voice back to the plugin's own
  m = ir._readAloudManager;
  if (m.active && !m.paused) { try { m.pause(); } catch (e) {} }
  try { ir.toggleReadAloudPopup(false); } catch (e) {}
  for (let i = 0; i < 100; i++) { m = ir._readAloudManager; if (!m.active) break; await sleep(50); }
  set('zotero-standard.enabled', before.std);
  set('zotero-premium.enabled', before.prem);
  set('readAloud.sameForAllDocuments', before.sameForAll);
  out.restored = { std: get('zotero-standard.enabled'), prem: get('zotero-premium.enabled'), sameForAll: get('readAloud.sameForAllDocuments') };
  out.restoredMatches = out.restored.std === before.std && out.restored.prem === before.prem && out.restored.sameForAll === before.sameForAll;

  S.item21 = out;
  return JSON.stringify(out, null, 1);
})();
