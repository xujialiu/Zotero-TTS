// Issue #144, item 22: collect the Engine's output-latency and clock evidence
// on a muted session.  A positive AudioContext latency is recorded, but this
// probe cannot identify a Bluetooth route or judge perceived lead/lag; those
// limits stay explicit in the result.
// params: none. state: reads fixtures.A; writes item22.
(async () => {
  const S = Zotero.ZoteroTTSRun.state;
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const wait = async (test, ceiling = 15000, step = 30) => {
    const end = Date.now() + ceiling;
    while (Date.now() < end) {
      const value = await test();
      if (value) return value;
      await sleep(step);
    }
    return await test();
  };
  const itemID = S.fixtures?.A?.itemID;
  if (!itemID) throw new Error('fixture A is missing');
  const readers = Zotero.Reader?._readers || [];
  let reader = null;
  for (let i = 0; i < readers.length; i++) if (readers[i]?.itemID === itemID) reader = readers[i];
  if (!reader) throw new Error('fixture A reader is missing');
  const ir = reader._internalReader;
  let manager = ir?._readAloudManager;
  if (!manager?.active) {
    try { ir.toggleReadAloudPopup(true); } catch (e) { throw new Error('Player could not reopen: ' + String(e)); }
    manager = await wait(() => ir._readAloudManager?.active ? ir._readAloudManager : null, 20000, 40);
  }
  if (!manager?.active) throw new Error('fixture A manager did not activate');
  try { Zotero.getMainWindow?.()?.minimize?.(); } catch (e) {}
  const diag = async () => {
    const all = JSON.parse(await Zotero.ZoteroTTS.diagnostics.engine());
    for (let i = 0; i < all.readers.length; i++) if (all.readers[i].itemID === itemID) return all.readers[i];
    return null;
  };
  if (!manager.paused) { try { manager.pause(); } catch (e) {} await sleep(80); }
  manager.setSpeed(2.5);
  manager.repositionTo(4);
  try { reader._iframeWindow.document.notifyUserGestureActivation(); } catch (e) {}
  manager.play();
  const first = await wait(async () => {
    const value = await diag();
    return value?.session?.currentIndex === 4 && value.session.playing ? value : null;
  }, 20000, 30);
  const trace = [];
  const traceEnd = Date.now() + 600;
  while (Date.now() < traceEnd) {
    const value = await diag();
    if (value) trace.push({
      at: Date.now(), state: value.audio?.state ?? null,
      latency: value.audio?.latency ?? null,
      playbackTime: value.session?.playbackTime ?? null,
      word: value.session?.activeTimestampIndex ?? null,
    });
    await sleep(80);
  }
  const last = trace[trace.length - 1] || null;
  const latency = Number(first?.audio?.latency ?? last?.latency ?? 0);
  const clockAdvances = trace.length > 1 && Number(last?.playbackTime) > Number(trace[0]?.playbackTime);
  if (manager.active && !manager.paused) { try { manager.pause(); } catch (e) {} }
  const out = {
    step: 'item22-latency',
    audio: first?.audio ?? null,
    trace: { count: trace.length, first: trace[0] || null, last },
    latencySeconds: latency,
    latencyPositive: latency > 0,
    clockAdvances,
    outputRouteIdentified: false,
    bluetoothEvidence: null,
    notTestable: 'No Bluetooth output route was identified and this probe cannot judge perceived lead/lag by ear.',
    sourceCheck: 'The word-clock traces separately compare event/frame observations with latency-adjusted audio time.',
  };
  S.item22 = out;
  return JSON.stringify(out, null, 1);
})();
