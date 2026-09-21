/**
 * Item 7: ten quiet seconds after a pause send both files up. Polls the debug
 * log for `position sync (pause)` and `shared position sync (pause)` for up to
 * 16 s from the pause, then reads both transports' lastTrigger.
 * Reads nothing of state; run straight after the pause.
 */
(async () => {
  const out = { trace: [] };
  const started = Date.now();
  const seen = { own: null, shared: null };
  while (Date.now() - started < 16000 && (seen.own === null || seen.shared === null)) {
    const debug = String(await Zotero.Debug.get());
    const lines = debug.split('\n').filter((l) => l.indexOf('[zotero-tts]') !== -1);
    if (seen.own === null && lines.some((l) => l.indexOf('position sync (pause)') !== -1 && l.indexOf('shared') === -1)) {
      seen.own = Date.now() - started;
      out.trace.push(`${seen.own} ms position sync (pause)`);
    }
    if (seen.shared === null && lines.some((l) => l.indexOf('shared position sync (pause)') !== -1)) {
      seen.shared = Date.now() - started;
      out.trace.push(`${seen.shared} ms shared position sync (pause)`);
    }
    if (seen.own !== null && seen.shared !== null) break;
    await new Promise((r) => setTimeout(r, 400));
  }
  out.sawAfterMs = seen;
  const debug = String(await Zotero.Debug.get());
  const lines = debug.split('\n').filter((l) => l.indexOf('[zotero-tts]') !== -1).map((l) => l.slice(l.indexOf('[zotero-tts]')));
  out.pauseLines = lines.filter((l) => l.indexOf('(pause)') !== -1);
  const sync = JSON.parse(await Zotero.ZoteroTTS.diagnostics.positionSync());
  out.ownTransport = { lastTrigger: sync.transport.lastTrigger, lastOutcome: sync.transport.lastOutcome, uploaded: sync.transport.uploaded };
  out.sharedTransport = { lastTrigger: sync.shared.transport.lastTrigger, lastOutcome: sync.shared.transport.lastOutcome, uploaded: sync.shared.transport.uploaded, remoteItems: sync.shared.transport.remoteItems, carried: sync.shared.transport.carried, adopted: sync.shared.transport.adopted };
  out.documents = sync.shared.documents;
  return JSON.stringify(out);
})()
