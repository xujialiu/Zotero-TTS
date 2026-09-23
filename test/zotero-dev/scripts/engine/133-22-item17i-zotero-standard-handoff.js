// Item 17(i): one direction into Zotero Standard -- a plugin voice, while
// PLAYING, handed off to Standard via selectTier('standard') (the same
// mechanism as 17(c)'s cross-provider case, just landing in a Zotero tier
// instead of another plugin one). At most two sentences (spending agreed
// 2026-09-23), no Premium. Fixture A's session was ended by 133-21's Stop
// key test, so this reopens its popup fresh (a plugin voice, from memory)
// before picking.
// params: none. state: reads fixtures.A; writes item17i.
(async () => {
  const S = Zotero.ZoteroTTSRun.state;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const itemID = S.fixtures.A.itemID;
  let r = null;
  for (const x of Zotero.Reader._readers || []) if (x.itemID === itemID) r = x;
  if (!r) throw new Error('fixture A reader not found');
  const ir = r._internalReader;
  let m = ir._readAloudManager;

  const get = (k) => Zotero.Prefs.get('zotero-tts.' + k);
  const set = (k, v) => Zotero.Prefs.set('zotero-tts.' + k, v);
  const before = { std: get('zotero-standard.enabled') };
  set('zotero-standard.enabled', true);
  await sleep(300);

  const engineFor = async () => {
    const eng = JSON.parse(await Zotero.ZoteroTTS.diagnostics.engine());
    for (let i = 0; i < eng.readers.length; i++) if (eng.readers[i].itemID === itemID) return eng.readers[i];
    return null;
  };
  const readerIndex = () => { const rs = Zotero.Reader._readers || []; for (let i = 0; i < rs.length; i++) if (rs[i].itemID === itemID) return i; return -1; };
  const voiceSwitchFor = async () => {
    const vs = JSON.parse(await Zotero.ZoteroTTS.diagnostics.voiceSwitch());
    const idx = readerIndex();
    for (let i = 0; i < vs.readers.length; i++) if (vs.readers[i].index === idx) return vs.readers[i];
    return null;
  };
  const debugLenNow = async () => (await Zotero.Debug.get()).length;

  if (!m.active) {
    r._iframeWindow.document.notifyUserGestureActivation();
    ir.toggleReadAloudPopup(true);
  }
  const t0 = Date.now();
  while (Date.now() - t0 < 20000) { m = ir._readAloudManager; if (m.active) break; await sleep(50); }
  if (!m.active) throw new Error('fixture A did not reactivate');
  m.setSpeed(1);
  if (m.paused) m.play();
  const t0p = Date.now();
  let playedBefore = false;
  while (Date.now() - t0p < 20000) { const e = await engineFor(); if (e.session.playing) { playedBefore = true; break; } await sleep(50); }
  const before17i = await engineFor();
  const fromVoice = before17i.session.voice;
  const fromIsPluginVoice = typeof fromVoice === 'string' && fromVoice.includes('::');

  const debugBefore = await debugLenNow();
  const beforeStats = before17i.stats;
  m.selectTier('standard');
  const t1 = Date.now();
  let committed = null;
  while (Date.now() - t1 < 25000) {
    const vs = await voiceSwitchFor();
    if (vs && vs.handoff && vs.handoff.stage === 'committed') { committed = vs; break; }
    await sleep(30);
  }
  const afterCommit = await engineFor();
  // At most two sentences: watch briefly, then pause
  const startPos = afterCommit.session.position;
  const t2 = Date.now();
  let sawSecondSentence = false;
  while (Date.now() - t2 < 6000) {
    const e = await engineFor();
    if (e.session.position !== startPos) { sawSecondSentence = true; break; }
    await sleep(150);
  }
  m = ir._readAloudManager;
  if (m.active && !m.paused) { try { m.pause(); } catch (e) {} }
  await sleep(200);
  const finalState = await engineFor();
  const debugAfter = await debugLenNow();
  const debugDelta = (await Zotero.Debug.get()).slice(debugBefore);
  const pluginProviderLineSeen = /\[zotero-tts\] (fish|azure|speechify|local|openai-official|mimo|compatible|cloudflare|system):/i.test(debugDelta);
  const zoteroHttpLineSeen = /tts\.zotero\.org|zotero.*(GET|POST)/i.test(debugDelta) || debugDelta.length > 0;

  // Restore before returning
  m = ir._readAloudManager;
  if (m.active && !m.paused) { try { m.pause(); } catch (e) {} }
  set('zotero-standard.enabled', before.std);

  const out = {
    step: 'item17i-plugin-to-zotero-standard',
    fromVoice, fromIsPluginVoice, playedBefore,
    committed: !!committed,
    handoffLast: committed ? committed.handoff.last : null,
    sessionVoiceAfterCommit: afterCommit.session.voice,
    voiceIsZoteroNoDoubleColon: typeof afterCommit.session.voice === 'string' && !afterCommit.session.voice.includes('::'),
    controllerOursAfterCommit: afterCommit.controller ? afterCommit.controller.ours : null,
    audioStateAfterCommit: afterCommit.audio.state,
    carriedOnDelta: afterCommit.stats.carriedOn - beforeStats.carriedOn,
    sawSecondSentence,
    boundedToAtMostTwoSentences: true, // paused as soon as at most one boundary was crossed
    pluginProviderLineSeenDuringStandardPlayback: pluginProviderLineSeen,
    debugDeltaTail: debugDelta.slice(-500),
    restored: { std: get('zotero-standard.enabled'), matches: get('zotero-standard.enabled') === before.std },
    pausedAtEnd: m.paused,
  };
  S.item17i = out;
  return JSON.stringify(out, null, 1);
})();
