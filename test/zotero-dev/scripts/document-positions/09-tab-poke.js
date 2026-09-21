/**
 * A tab event, which is what pokes both transports outside playback (spec 6.8):
 * the run's PDF tab closed and opened again, then one sync's worth of wait.
 * Reports both transports before and after, and the last shared log lines.
 * Reads state.pdf.
 */
(async () => {
  const s = Zotero.ZoteroTTSRun.state;
  const out = {};
  const stats = async () => {
    const d = JSON.parse(await Zotero.ZoteroTTS.diagnostics.positionSync());
    return { own: { syncs: d.transport.syncs, lastOutcome: d.transport.lastOutcome, lastTrigger: d.transport.lastTrigger, uploaded: d.transport.uploaded }, shared: d.shared.transport, documents: d.shared.documents };
  };
  out.before = await stats();
  const win = Zotero.getMainWindow();
  if (s.pdf?.tabID && win.Zotero_Tabs._tabs.some((t) => t.id === s.pdf.tabID)) {
    win.Zotero_Tabs.close(s.pdf.tabID);
    out.closed = s.pdf.tabID;
    await new Promise((r) => setTimeout(r, 2500));
  }
  const reader = await Zotero.Reader.open(s.pdf.itemID);
  const started = Date.now();
  while (Date.now() - started < 20000) {
    if (reader?._internalReader) break;
    await new Promise((r) => setTimeout(r, 700));
  }
  s.pdf.tabID = reader?.tabID ?? s.pdf.tabID;
  out.opened = s.pdf.tabID;
  await new Promise((r) => setTimeout(r, 3500));
  out.after = await stats();
  const debug = String(await Zotero.Debug.get());
  out.sharedLines = debug.split('\n').filter((l) => l.indexOf('shared position sync') !== -1).slice(-4).map((l) => l.slice(l.indexOf('[zotero-tts]')));
  return JSON.stringify(out);
})()
