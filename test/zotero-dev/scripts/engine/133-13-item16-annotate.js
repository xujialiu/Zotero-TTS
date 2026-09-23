// Item 16: annotating while reading. getSegmentToAnnotate() (a public member
// of the Engine's own controller): under half-way AND under 3 s into a
// sentence, the previous segment; otherwise the current one.
// params: none. state: reads fixtures.A; writes item16.
(async () => {
  const S = Zotero.ZoteroTTSRun.state;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const itemID = S.fixtures.A.itemID;
  let r = null;
  for (const x of Zotero.Reader._readers || []) if (x.itemID === itemID) r = x;
  if (!r) throw new Error('fixture A reader not found');
  const ir = r._internalReader;
  let m = ir._readAloudManager;
  const engineFor = async () => {
    const eng = JSON.parse(await Zotero.ZoteroTTS.diagnostics.engine());
    for (let i = 0; i < eng.readers.length; i++) if (eng.readers[i].itemID === itemID) return eng.readers[i];
    return null;
  };
  m.setSpeed(1);
  m.repositionTo(4); // "The later sentences are a little longer..." -- long enough to sample early and late
  let played = false;
  const t0 = Date.now();
  while (Date.now() - t0 < 15000) { const e = await engineFor(); if (e.session.currentIndex === 4 && e.session.playing) { played = true; break; } await sleep(30); }
  const clipDuration = (await engineFor()).session.clipDuration;
  await sleep(150); // early: well under half and under 3 s in
  const controller = Components.utils.waiveXrays(m._controller);
  const earlySeg = controller.getSegmentToAnnotate();
  const early = { playbackTime: (await engineFor()).session.playbackTime, segmentText: earlySeg ? String(earlySeg.text || '').slice(0, 60) : null };
  const targetWait = Math.max(0, Math.min(clipDuration * 0.7, clipDuration - 0.2)) * 1000 - 150;
  if (targetWait > 0) await sleep(targetWait);
  const lateSeg = controller.getSegmentToAnnotate();
  const late = { playbackTime: (await engineFor()).session.playbackTime, segmentText: lateSeg ? String(lateSeg.text || '').slice(0, 60) : null };
  if (m.active && !m.paused) { try { m.pause(); } catch (e2) {} }
  const segs = ir._readAloudSegments.segments;
  const out = {
    played, clipDuration,
    early: { ...early, expected: 'previous (index 3)', matchesExpected: !!earlySeg && String(earlySeg.text) === String(segs[3].text) },
    late: { ...late, expected: 'current (index 4)', matchesExpected: !!lateSeg && String(lateSeg.text) === String(segs[4].text) },
  };
  S.item16 = out;
  return JSON.stringify(out, null, 1);
})();
