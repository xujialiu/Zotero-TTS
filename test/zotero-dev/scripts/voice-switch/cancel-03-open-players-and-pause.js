return (async () => {
  const root = Zotero.__ztts95Followup;
  if (!root?.fixtures.a?.reader || !root.fixtures.b?.reader) throw new Error('both fixtures are required');
  const a = root.fixtures.a, b = root.fixtures.b;
  const openedA = await root.openPopup(a);
  const ma = a.reader._internalReader?._readAloudManager;
  if (ma?.active && !ma.paused) ma.pause();
  await root.sleep(120);
  const openedB = await root.openPopup(b);
  const mb = b.reader._internalReader?._readAloudManager;
  if (mb?.active && !mb.paused) mb.pause();
  await root.sleep(120);
  const aPaused = await root.activate(a, root.voices[0], false);
  const bPaused = await root.activate(b, root.voices[0], false);
  return JSON.stringify({ openedA, openedB, paused: { a: aPaused, b: bPaused }, fixtureWindowsDistinct: a.window !== b.window, remoteStateDistinct: a !== b }, null, 1);
})()
