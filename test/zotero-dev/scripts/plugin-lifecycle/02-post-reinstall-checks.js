// Item 5.9 step 4a-4c (issue #143): after the tester's in-place reinstall
// (a separate zotero_plugin_install call made between 01 and this script),
// check startup identity, the debug log's stop/start pair, the six
// per-reader diagnostics' `{ gone: true }` row for the dead window and a
// real row for the tab, liveVoiceList's non-null entry for the tab, and
// highlight() showing the tab patched.
// params: none. state: reads deadReader, tabReader; writes postReinstall.
(async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const out = { step: 'post-reinstall-checks' };

  const list = Zotero.Reader?._readers || [];
  const indexOf = (itemID) => list.findIndex((r) => r?.itemID === itemID);
  const deadIndex = indexOf(state.deadReader.itemID);
  const tabIndex = indexOf(state.tabReader.itemID);
  out.indices = { deadIndex, tabIndex, listedAfter: tabIndex > deadIndex, totalReaders: list.length };

  // 4a. Startup identity.
  const startup = JSON.parse(Zotero.ZoteroTTS.diagnostics.startup());
  out.startup = { version: startup.version, failed: startup.failed, allOk: startup.steps.every((s) => s.ok) && startup.failed.length === 0 };

  // Debug log: the bare "started" line (not "started without ...") and no
  // dead-object errors from this reinstall's stop/start pair on.
  const debugText = String(await Zotero.Debug.get());
  const lines = debugText.split('\n');
  const stoppedIdx = lines.findIndex((l) => l.includes('[zotero-tts] stopped'));
  const startedIdx = lines.findIndex((l, i) => (stoppedIdx < 0 || i > stoppedIdx) && l.includes('[zotero-tts] started'));
  const startedLine = startedIdx >= 0 ? lines[startedIdx].trim() : null;
  const tail = lines.slice(Math.max(stoppedIdx, 0));
  const deadObjectLines = tail.filter((l) => l.includes("can't access dead object"));
  out.debugLog = {
    stoppedSeen: stoppedIdx >= 0,
    startedSeen: startedIdx >= 0,
    startedBare: startedLine !== null && startedLine.endsWith('[zotero-tts] started') && !startedLine.includes('started without'),
    startedLineTail: startedLine ? startedLine.slice(-60) : null,
    deadObjectCountSinceStop: deadObjectLines.length,
  };

  // 4b. The six per-reader diagnostics: { gone: true } for the dead window,
  // a real (non-gone, non-error-string) row for the tab.
  const checks = ['highlight', 'autoScroll', 'sentenceInView', 'skippedLines', 'textSettings', 'playerVoiceList'];
  const rows = {};
  for (const name of checks) {
    const parsed = JSON.parse(await Zotero.ZoteroTTS.diagnostics[name]());
    const deadRow = parsed[deadIndex];
    const tabRow = parsed[tabIndex];
    const deadIsExactlyGone = deadRow && typeof deadRow === 'object' && Object.keys(deadRow).length === 1 && deadRow.gone === true;
    const tabIsRealObject = tabRow !== null && typeof tabRow === 'object' && !('gone' in tabRow);
    rows[name] = { deadRow, tabRow, deadIsExactlyGone, tabIsRealObject };
  }
  out.rows = rows;
  out.allDeadGone = checks.every((n) => rows[n].deadIsExactlyGone);
  out.allTabReal = checks.every((n) => rows[n].tabIsRealObject);
  out.tabPatched = !!(rows.highlight.tabRow?.views || []).some((v) => v && v.patched === true);

  // 4c. liveVoiceList: a plain array (no gone-guard); non-null for the tab.
  const liveVoices = JSON.parse(Zotero.ZoteroTTS.diagnostics.liveVoiceList ? await Zotero.ZoteroTTS.diagnostics.liveVoiceList() : 'null');
  out.liveVoiceList = { deadEntry: liveVoices ? liveVoices[deadIndex] : undefined, tabEntry: liveVoices ? liveVoices[tabIndex] : undefined, tabNonNull: !!(liveVoices && liveVoices[tabIndex] !== null) };

  state.postReinstall = out;
  return JSON.stringify(out, null, 1);
})()
