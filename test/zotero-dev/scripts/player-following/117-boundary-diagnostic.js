return (async () => {
  const state = Zotero.ZoteroTTSRun.state, h = state.helpers;
  const p = Services.prefs;
  const modePref = 'extensions.zotero.zotero-tts.readAloud.autoScrollMode';
  const keepPref = 'extensions.zotero.zotero-tts.readAloud.keepFollowingWhileVisible';
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const waitFor = async (test, ms = 7000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) { let value = null; try { value = await test(); } catch (e) {} if (value) return value; await sleep(100); }
    return test();
  };
  const readerOf = id => { for (const reader of Zotero.Reader?._readers || []) if (reader?.itemID === id) return reader; return null; };
  const snapshot = (slot, label) => {
    const reader = readerOf(slot?.itemID), view = h.view(slot), win = view?._iframeWindow, doc = win?.document, host = reader?._window;
    const container = doc?.getElementById('viewerContainer'), geometry = h.geometry(slot), manager = h.manager(slot), c = manager?._controller, d = h.diag(slot) || {};
    const selectedTabID = host?.Zotero_Tabs?.selectedID ?? globalThis.Zotero_Tabs?.selectedID ?? null;
    return {
      at: Date.now(), label, itemID: slot?.itemID ?? null, tabID: reader?.tabID ?? null, selectedTabID,
      selected: selectedTabID === reader?.tabID, hostWindowState: host?.windowState ?? null,
      viewSuspended: typeof view?._suspended === 'boolean' ? view._suspended : null,
      iframeDocumentHidden: doc?.hidden ?? null, iframeVisibilityState: doc?.visibilityState ?? null,
      iframeClosed: win?.closed ?? null, active: !!manager?.active, paused: !!manager?.paused,
      position: Number.isFinite(c?._position) ? c._position : null, scrollTop: container?.scrollTop ?? geometry?.viewport?.scrollTop ?? null,
      visibleFragments: geometry?.boxes?.filter(box => box.visible).length ?? null,
      following: d.following ?? null, sentenceProtected: d.sentenceProtected ?? null,
      interacting: d.interacting ?? null, visibilityPaused: d.visibilityPaused ?? null,
      pending: d.pending ?? null, reason: d.reason ?? null,
      last: d.last ? { at: d.last.at, reason: d.last.reason, from: d.last.from, issued: d.last.issued } : null,
    };
  };
  const ready = s => !!s && s.selected === true && s.hostWindowState !== 2 && s.viewSuspended !== true && s.iframeDocumentHidden === false && (!s.iframeVisibilityState || s.iframeVisibilityState === 'visible') && s.iframeClosed !== true;
  const waitReady = async (slot, label, ms = 7000) => {
    const trace = [], end = Date.now() + ms;
    while (Date.now() < end) { const s = snapshot(slot, label); trace.push(s); if (ready(s)) return { ok: true, first: trace[0], last: s, samples: trace }; await sleep(100); }
    return { ok: false, first: trace[0] || null, last: trace[trace.length - 1] || snapshot(slot, label + '-timeout'), samples: trace };
  };
  const timeline = async (slot, label, ms = 2600) => {
    const reader = readerOf(slot?.itemID), view = h.view(slot), win = view?._iframeWindow, doc = win?.document, host = reader?._window;
    const started = Date.now(), rows = [], events = [], cleanups = [];
    const listen = (target, type, name) => { if (!target?.addEventListener) return; const fn = () => { const s = snapshot(slot, name + '-event'); events.push({ at: Date.now() - started, type, name, hidden: s.iframeDocumentHidden, visibilityState: s.iframeVisibilityState, windowState: s.hostWindowState, suspended: s.viewSuspended }); }; target.addEventListener(type, fn, true); cleanups.push(() => target.removeEventListener(type, fn, true)); };
    listen(doc, 'visibilitychange', 'iframe'); listen(win, 'focus', 'iframe'); listen(win, 'pageshow', 'iframe'); listen(win, 'resize', 'iframe');
    listen(host?.document, 'visibilitychange', 'host'); listen(host, 'focus', 'host'); listen(host, 'resize', 'host'); listen(host, 'sizemodechange', 'host');
    while (Date.now() - started <= ms) { rows.push(snapshot(slot, label)); await sleep(100); }
    for (const cleanup of cleanups) try { cleanup(); } catch (e) {}
    const firstRecovery = rows.find(row => row.following === true && row.visibilityPaused === false && row.sentenceProtected !== true);
    return { label, duration: Date.now() - started, count: rows.length, first: rows[0] || null, last: rows[rows.length - 1] || null, firstRecoveryAt: firstRecovery ? firstRecovery.at - started : null, events, rows };
  };
  const setPaused = async slot => { await h.pause(slot); await waitFor(() => h.manager(slot)?.active && h.manager(slot)?.paused, 2000); };
  const selectReady = async (slot, label) => { h.select(slot); const result = await waitReady(slot, label); if (!result.ok) throw new Error(label + ': fixture not visible/ready: ' + JSON.stringify(result.last)); return result; };
  const setupOffscreen = async (slot, keep, label) => {
    p.setStringPref(modePref, 'outside'); p.setBoolPref(keepPref, keep);
    const readyBefore = await selectReady(slot, label + '-ready-before'); await setPaused(slot);
    await h.setSegment(slot, 0); try { h.internal(slot)?._lockPositionToReadAloud?.(); } catch (e) {}
    await sleep(180); const wheel = h.trustedWheel(slot, label + '-wheel');
    const placement = h.arrange(slot, 'outside');
    const readyAfter = await selectReady(slot, label + '-ready-after-placement'); await sleep(220);
    return { readyBefore, wheel, placement, readyAfter, before: snapshot(slot, label + '-before-resume') };
  };
  const gatedResume = async (slot, label) => {
    const pre = await selectReady(slot, label + '-gated-ready');
    const before = snapshot(slot, label + '-gated-before'); let error = null;
    try { h.internal(slot)?.toggleReadAloudPaused?.(false); } catch (e) { error = String(e); }
    const playing = await waitFor(() => h.manager(slot)?.active && !h.manager(slot)?.paused, 2000);
    const start = snapshot(slot, label + '-gated-playing');
    const trace = await timeline(slot, label + '-gated-timeline');
    await setPaused(slot);
    return { pre, before, error, playingStarted: !!playing, start, trace, afterPause: snapshot(slot, label + '-gated-after-pause') };
  };
  const oldFixedResume = async (slot, label) => {
    const pre = await selectReady(slot, label + '-fixed-ready');
    const before = snapshot(slot, label + '-fixed-before');
    const raw = await h.resume(slot, 'native');
    return { pre, before, fixedPlaying: raw.playing, fixedAfterPause: raw.afterPause, errors: { resume: raw.error, pause: raw.pauseError } };
  };
  const runResumeRow = async (slot, keep) => {
    const label = 'pdf-outside-resume-keep-' + keep;
    const fixedSetup = await setupOffscreen(slot, keep, label + '-fixed');
    const fixed = await oldFixedResume(slot, label);
    const gatedSetup = await setupOffscreen(slot, keep, label + '-gated');
    const gated = await gatedResume(slot, label);
    return { kind: 'pdf', keep, fixedSetup, fixed, gatedSetup, gated, status: gated.playingStarted && gated.start.following === true ? 'PASS' : 'FAIL' };
  };
  const runLaterVisible = async slot => {
    const label = 'pdf-outside-later-visible';
    p.setStringPref(modePref, 'outside'); p.setBoolPref(keepPref, true);
    const readyBefore = await selectReady(slot, label + '-ready-before'); await setPaused(slot);
    await h.setSegment(slot, 0); try { h.internal(slot)?._lockPositionToReadAloud?.(); } catch (e) {}
    const visiblePlacement = h.arrange(slot, 'visible'); const readyBeforePlay = await selectReady(slot, label + '-ready-before-play');
    let playError = null; try { h.manager(slot)?.play?.(); } catch (e) { playError = String(e); }
    await waitFor(() => h.manager(slot)?.active && !h.manager(slot)?.paused, 2000); await sleep(220);
    const playingStart = snapshot(slot, label + '-playing-start'); const wheel = h.trustedWheel(slot, label + '-wheel');
    const outsidePlacement = h.arrange(slot, 'outside'); const readyOutside = await selectReady(slot, label + '-ready-outside'); await sleep(220);
    const outside = snapshot(slot, label + '-after-gesture-outside');
    const later = await h.setSegment(slot, 1); const beforeLaterVisible = snapshot(slot, label + '-before-later-visible');
    const laterPlacement = h.arrange(slot, 'visible'); const readyLater = await selectReady(slot, label + '-ready-later-visible');
    await sleep(300); const fixed300 = snapshot(slot, label + '-fixed-300ms');
    const trace = await timeline(slot, label + '-timeline');
    await setPaused(slot);
    const final = snapshot(slot, label + '-final-paused');
    const recovered = trace.firstRecoveryAt !== null || fixed300.following === true;
    return { kind: 'pdf', keep: true, readyBefore, readyBeforePlay, playingStart, wheel, outsidePlacement, readyOutside, outside, later, beforeLaterVisible, laterPlacement, readyLater, fixed300, trace, final, playError, status: recovered ? 'PASS' : 'FAIL' };
  };
  if (!h) return JSON.stringify({ error: 'helpers missing' });
  const modeBefore = { value: p.getStringPref(modePref, 'sentence'), user: p.prefHasUserValue(modePref) };
  const keepBefore = { value: p.getBoolPref(keepPref, true), user: p.prefHasUserValue(keepPref) };
  const slot = state.fixtures?.pdf, reader = readerOf(slot?.itemID);
  if (!slot || !reader) return JSON.stringify({ error: 'PDF fixture reader missing' });
  const rows = [];
  try {
    rows.push(await runResumeRow(slot, true));
    rows.push(await runResumeRow(slot, false));
    rows.push(await runLaterVisible(slot));
  } finally {
    h.restorePref(modePref, modeBefore); h.restorePref(keepPref, keepBefore); await setPaused(slot).catch(() => {});
  }
  const allReady = rows.flatMap(row => row.kind === 'pdf' ? [row.fixedSetup?.readyBefore, row.fixedSetup?.readyAfter, row.gatedSetup?.readyBefore, row.gatedSetup?.readyAfter, row.gated?.pre, row.readyBefore, row.readyBeforePlay, row.readyOutside, row.readyLater] : []).filter(Boolean).every(entry => entry.ok);
  const report = { rows, preconditions: { allReady, modeBefore, keepBefore, modeAfter: { value: p.getStringPref(modePref, '<none>'), user: p.prefHasUserValue(modePref) }, keepAfter: { value: p.getBoolPref(keepPref, true), user: p.prefHasUserValue(keepPref) } } };
  state.boundaryDiagnostic = report;
  return JSON.stringify(report, null, 1);
})()
