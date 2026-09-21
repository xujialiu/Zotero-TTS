/**
 * Item 7: both files go up ten quiet seconds after a pause, and two pauses
 * inside those ten seconds produce one pair — the only two things here that
 * cannot be seen in a five-second run, so the script plays about two seconds
 * per pause and spends the rest waiting on the timer.
 * Reads state.fixture.
 */
(async () => {
  const f = Zotero.ZoteroTTSRun.state.fixture;
  const out = { phases: [] };
  const lines = async () => String(await Zotero.Debug.get()).split('\n').filter((l) => l.indexOf('[zotero-tts]') !== -1).map((l) => l.slice(l.indexOf('[zotero-tts]')));
  const win = Zotero.getMainWindow();
  win.Zotero_Tabs.select(f.tabID);
  await new Promise((r) => setTimeout(r, 300));
  const reader = Zotero.Reader._readers.find((x) => x.tabID === f.tabID);
  const m = () => reader?._internalReader?._readAloudManager ?? null;
  const playFor = async (ms) => {
    if (m() && m().paused) reader._internalReader.toggleReadAloudPaused();
    await new Promise((r) => setTimeout(r, ms));
  };
  const pause = () => {
    if (m() && !m().paused) reader._internalReader.toggleReadAloudPaused(true);
    return Date.now();
  };
  const watch = async (t0, forMs) => {
    const mark = out.mark;
    const seen = { own: null, shared: null };
    while (Date.now() - t0 < forMs && (seen.own === null || seen.shared === null)) {
      const after = (await lines()).slice(mark);
      if (seen.own === null && after.some((l) => l.indexOf('position sync (pause)') !== -1 && l.indexOf('shared') === -1)) seen.own = Date.now() - t0;
      if (seen.shared === null && after.some((l) => l.indexOf('shared position sync (pause)') !== -1)) seen.shared = Date.now() - t0;
      await new Promise((r) => setTimeout(r, 300));
    }
    const after = (await lines()).slice(mark);
    return { seen, ownLines: after.filter((l) => l.indexOf('position sync (pause)') !== -1 && l.indexOf('shared') === -1).length, sharedLines: after.filter((l) => l.indexOf('shared position sync (pause)') !== -1).length };
  };

  // One pause: the pair should arrive between ten and thirteen seconds
  out.mark = (await lines()).length;
  await playFor(2200);
  let t0 = pause();
  out.phases.push(Object.assign({ phase: 'one pause' }, await watch(t0, 16000)));

  // Two pauses inside ten seconds: one pair, counted from the second
  out.mark = (await lines()).length;
  await playFor(1800);
  pause();
  await new Promise((r) => setTimeout(r, 3000));
  await playFor(1800);
  t0 = pause();
  out.phases.push(Object.assign({ phase: 'two pauses within ten seconds', gapMs: 3000 }, await watch(t0, 16000)));

  const mm = m();
  out.managerAtEnd = mm ? { active: mm.active, paused: mm.paused } : null;
  return JSON.stringify(out);
})()
