// Item 2 (the gate): the smallest proof the Engine plays at all. A plugin
// voice (the memory's, Fish Audio) reads fixture-a.pdf for a few sentences.
// Checks the mechanism fields the brief names before anything else is
// driven: hooks all true, controller {ours:true, live:true}, session.playing
// true, audio.state 'running', stats.fallbacks 0, no zotero-tts.js error.
// params: none (reads state.fixtures.A from 133-01). state: writes item2,
// leaves the reader open and playing for the scripts that follow (they
// share this same session rather than re-opening the fixture).
(async () => {
  const S = Zotero.ZoteroTTSRun.state;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = { step: 'item2-smoke' };

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

  const errorsBefore = (Zotero.getErrors(true) || []).length;

  // Start: a trusted-equivalent gesture stand-in + the popup open, in one script (playback.md pattern)
  r._iframeWindow.document.notifyUserGestureActivation();
  ir.toggleReadAloudPopup(true);

  let tActive = null;
  const tA0 = Date.now();
  while (Date.now() - tA0 < 30000) {
    if (m.active) { tActive = Date.now(); break; }
    await sleep(50);
  }
  out.becameActive = !!tActive;
  out.activatedAfterMs = tActive ? tActive - tA0 : null;
  if (!tActive) throw new Error('manager never activated within 30 s');

  // Segments, for the record (baseline.md: 17 segments, paragraph starts 0/5/9/12/15)
  const segs = m.segments;
  const segCount = segs ? segs.length : 0;
  const paragraphStarts = [];
  for (let i = 0; i < segCount; i++) if (segs[i] && segs[i].anchor === 'paragraphStart') paragraphStarts.push(i);
  out.segCount = segCount;
  out.paragraphStarts = paragraphStarts;

  // Poll diagnostics.engine() for this reader until session.playing and audio.state running
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

  out.managerNow = { active: m.active, paused: m.paused, activeSegment: !!m.activeSegment, activeSegmentIndex: (() => {
    const seg = m.activeSegment;
    if (!seg || !segs) return -1;
    for (let i = 0; i < segs.length; i++) if (segs[i] === seg) return i;
    return -1;
  })(), buffering: m.buffering, error: m.error, speed: m.speed };

  const errorsAfter = Zotero.getErrors(true) || [];
  const newErrors = errorsAfter.slice(errorsBefore);
  out.newErrorCount = newErrors.length;
  out.newZoteroTTSErrors = newErrors.filter((e) => /zotero-tts/i.test(String(e)));

  // A few sentences: let it read on a little further, then confirm session.position tracks
  await sleep(1500);
  const eng2 = JSON.parse(await Zotero.ZoteroTTS.diagnostics.engine());
  let entry2 = null;
  for (let i = 0; i < eng2.readers.length; i++) if (eng2.readers[i].itemID === itemID) entry2 = eng2.readers[i];
  out.afterFewSeconds = entry2 ? { position: entry2.session.position, currentIndex: entry2.session.currentIndex, stats: entry2.stats } : null;

  S.item2 = out;
  return JSON.stringify(out, null, 1);
})();
