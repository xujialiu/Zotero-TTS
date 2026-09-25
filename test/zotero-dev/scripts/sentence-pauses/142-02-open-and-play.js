// The pauses (issues #44, #142): open the one fixture, start a session on a
// plugin voice, confirm the 17-segment/paragraph-starts-0-5-9-12-15 shape
// the whole item-3/3.10 check relies on. This is the one reader tab and one
// session the brief allows; the engine kit's own 133-04 (item 3) reuses it
// rather than opening a second one.
// params: none. state: reads fixtures.A (142-01); writes fixtures.A.tabID.
(async () => {
  const S = Zotero.ZoteroTTSRun.state;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = { step: 'open-and-play' };

  const memoryRaw = Zotero.Prefs.get('zotero-tts.readAloud.memory');
  let memoryVoiceId = null;
  try { memoryVoiceId = JSON.parse(memoryRaw).voice.id; } catch (e) { /* ignore */ }
  out.memoryIsPluginVoice = typeof memoryVoiceId === 'string' && memoryVoiceId.includes('::') && !memoryVoiceId.startsWith('zotero');
  if (!out.memoryIsPluginVoice) throw new Error('readAloud.memory is not a plugin voice; refusing to open the popup (workflow rule)');

  const itemID = S.fixtures.A.itemID;
  await Zotero.Reader.open(itemID);
  let r = null;
  const t0 = Date.now();
  while (Date.now() - t0 < 24000) {
    r = null;
    const rs = Zotero.Reader._readers || [];
    for (let i = 0; i < rs.length; i++) if (rs[i].itemID === itemID) r = rs[i];
    if (r && r._internalReader && r._internalReader._readAloudManager) break;
    await sleep(300);
  }
  if (!r) throw new Error('reader/_readAloudManager never appeared for fixture A');
  out.readerReadyMs = Date.now() - t0;
  S.fixtures.A.tabID = r.tabID;

  const ir = r._internalReader;
  const m = ir._readAloudManager;
  out.before = { active: m.active, paused: m.paused };

  // Start: a trusted-equivalent gesture stand-in + the popup open, in one script
  r._iframeWindow.document.notifyUserGestureActivation();
  ir.toggleReadAloudPopup(true);

  let tActive = null;
  const tA0 = Date.now();
  while (Date.now() - tA0 < 30000) {
    if (m.active) { tActive = Date.now(); break; }
    await sleep(50);
  }
  out.becameActive = !!tActive;
  if (!tActive) throw new Error('manager never activated within 30 s');

  // Segments: 17, paragraph starts 0/5/9/12/15 (baseline.md, fixture-a.pdf)
  const segs = m.segments;
  const segCount = segs ? segs.length : 0;
  const paragraphStarts = [];
  for (let i = 0; i < segCount; i++) if (segs[i] && segs[i].anchor === 'paragraphStart') paragraphStarts.push(i);
  out.segCount = segCount;
  out.paragraphStarts = paragraphStarts;
  out.paragraphStartsMatchExpected = JSON.stringify(paragraphStarts) === JSON.stringify([0, 5, 9, 12, 15]);

  // Poll diagnostics.engine() until it actually plays (never just that the hooks exist)
  let mech = null;
  const tP0 = Date.now();
  while (Date.now() - tP0 < 20000) {
    const eng = JSON.parse(await Zotero.ZoteroTTS.diagnostics.engine());
    let entry = null;
    for (let i = 0; i < eng.readers.length; i++) if (eng.readers[i].itemID === itemID) entry = eng.readers[i];
    if (entry && entry.session && entry.session.playing && entry.audio && entry.audio.state === 'running') { mech = entry; break; }
    await sleep(150);
  }
  out.mechanismReachedMs = mech ? Date.now() - tP0 : null;
  out.mechanism = mech;
  if (!mech) throw new Error('session never reached playing/running within 20 s');

  S.item142_02 = out;
  return JSON.stringify(out, null, 1);
})();
