/**
 * Issue #129's genuine-phone run, after 13-resume-shift-space.js has resumed
 * and paused at the adopted sentence: un-pauses through the same funnel the
 * player's own button uses (toggleReadAloudPaused with no argument —
 * pullBeforePlay, item 11) and lets the session read on until it has moved
 * through params.minExtraSegments (default 2) further segments, so the pause
 * below captures genuine continued reading rather than the resumed sentence
 * itself. Pauses again, then waits out the ten-quiet-second window (item 7)
 * for both `position sync (pause)` and `shared position sync (pause)`. The
 * server file itself is read separately, by 28-file-snapshot.js
 * (snapshot: 'after'), which also has the diff against the run's earlier
 * 'before' snapshot. Reads state.fixture; params.minExtraSegments,
 * params.maxWaitMs (default 45000) bound the read-on wait.
 */
(async () => {
  const p = Zotero.ZoteroTTSRun.params;
  const f = Zotero.ZoteroTTSRun.state.fixture;
  const out = { trace: [] };
  const waive = (v) => { try { return Components.utils.waiveXrays(v) ?? v; } catch { return v; } };
  const linesNow = async () => String(await Zotero.Debug.get()).split('\n').filter((l) => l.indexOf('[zotero-tts]') !== -1).map((l) => l.slice(l.indexOf('[zotero-tts]')));
  const win = Zotero.getMainWindow();
  win.Zotero_Tabs.select(f.tabID);
  win.focus();
  await new Promise((r) => setTimeout(r, 300));
  const reader = Zotero.Reader._readers.find((x) => x.tabID === f.tabID);
  const m = () => reader?._internalReader?._readAloudManager ?? null;

  const startSeg = waive(m())?.activeSegment ?? null;
  out.startSegmentText = startSeg && typeof startSeg.text === 'string' ? startSeg.text : null;
  out.before = { active: m()?.active ?? null, paused: m()?.paused ?? null };

  const mark = (await linesNow()).length;
  if (m() && m().paused) reader._internalReader.toggleReadAloudPaused();
  out.unpaused = { active: m()?.active ?? null, paused: m()?.paused ?? null };

  const minExtra = p.minExtraSegments ?? 2;
  const maxWaitMs = p.maxWaitMs ?? 45000;
  const started = Date.now();
  let seg = out.startSegmentText;
  let extraSeen = 0;
  while (Date.now() - started < maxWaitMs) {
    const s = waive(m())?.activeSegment ?? null;
    if (s && typeof s.text === 'string' && s.text !== seg) {
      seg = s.text;
      extraSeen++;
      out.trace.push(`${Date.now() - started} ms segment: ${s.text.slice(0, 70)}`);
    }
    if (extraSeen >= minExtra) break;
    if (!m() || !m().active) break; // end of document, or the session died
    await new Promise((r) => setTimeout(r, 250));
  }
  out.extraSegmentsSeen = extraSeen;
  out.readOnMs = Date.now() - started;

  const beforePause = m();
  out.managerBeforePause = { active: beforePause?.active ?? null, paused: beforePause?.paused ?? null };
  if (beforePause && beforePause.active && !beforePause.paused) {
    reader._internalReader.toggleReadAloudPaused(true);
    out.pausedAtMs = Date.now() - started;
  }
  await new Promise((r) => setTimeout(r, 400));
  const pausedSeg = waive(m())?.activeSegment ?? null;
  out.pausedSegmentText = pausedSeg && typeof pausedSeg.text === 'string' ? pausedSeg.text : null;
  out.afterPause = { active: m()?.active ?? null, paused: m()?.paused ?? null };

  // The quiet period: ten seconds plus margin (item 7) for both files to sync
  const waitStart = Date.now();
  const seen = { own: null, shared: null };
  while (Date.now() - waitStart < 16000 && (seen.own === null || seen.shared === null)) {
    const lines = (await linesNow()).slice(mark);
    if (seen.own === null && lines.some((l) => l.indexOf('position sync (pause)') !== -1 && l.indexOf('shared') === -1)) seen.own = Date.now() - waitStart;
    if (seen.shared === null && lines.some((l) => l.indexOf('shared position sync (pause)') !== -1)) seen.shared = Date.now() - waitStart;
    await new Promise((r) => setTimeout(r, 400));
  }
  out.pauseSyncSeenMs = seen;
  const newLines = (await linesNow()).slice(mark);
  out.newLines = newLines;
  out.pauseLines = newLines.filter((l) => l.indexOf('(pause)') !== -1);

  const sync = JSON.parse(await Zotero.ZoteroTTS.diagnostics.positionSync());
  out.ownTransport = { lastTrigger: sync.transport.lastTrigger, lastOutcome: sync.transport.lastOutcome, uploaded: sync.transport.uploaded };
  out.sharedTransport = { lastTrigger: sync.shared.transport.lastTrigger, lastOutcome: sync.shared.transport.lastOutcome, uploaded: sync.shared.transport.uploaded, adopted: sync.shared.transport.adopted };
  out.documents = sync.shared.documents;
  const upload = JSON.parse(await Zotero.ZoteroTTS.diagnostics.settingsUpload());
  out.machine = upload.machine;
  const mm = m();
  out.managerAfter = { active: mm?.active ?? null, paused: mm?.paused ?? null };
  return JSON.stringify(out);
})()
