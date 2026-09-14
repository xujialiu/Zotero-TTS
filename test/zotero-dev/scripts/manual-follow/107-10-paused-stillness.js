return (async () => {
  const state = Zotero.ZoteroTTSRun.state, h = state.helpers;
  const modePref = 'extensions.zotero.zotero-tts.readAloud.autoScrollMode';
  const keepPref = 'extensions.zotero.zotero-tts.readAloud.keepFollowingWhileVisible';
  if (!h) return JSON.stringify({ error: 'helpers missing' });
  const p = Services.prefs;
  const originalMode = { value: p.getStringPref(modePref, 'sentence'), user: p.prefHasUserValue(modePref) };
  const originalKeep = { value: p.getBoolPref(keepPref, true), user: p.prefHasUserValue(keepPref) };
  const restore = () => { h.restorePref(modePref, originalMode); h.restorePref(keepPref, originalKeep); };
  const rows = [];
  const runOne = async (kind, mode) => {
    const slot = state.fixtures?.[kind], reader = h.reader(slot), view = h.view(slot), manager = h.manager(slot);
    const row = { kind, mode, error: null };
    if (!slot || !reader || !view || !manager) { row.error = 'reader or manager missing'; return row; }
    try {
      p.setStringPref(modePref, mode); h.select(slot); await h.pause(slot);
      await h.setSegment(slot, kind === 'epubPaginated' ? 50 : 0);
      try { view?.navigateToFirstPage?.(); } catch (e) {}
      await h.sleep(350);
      const before = h.snap(slot, 'paused-before');
      const wheel = h.trustedWheel(slot, 'paused');
      let departure;
      if (view.flowMode === 'paginated') {
        let navigationError = null;
        try { view.navigateToNextPage?.(); } catch (e) { navigationError = String(e); }
        await h.sleep(450);
        departure = { navigationError, snapshot: h.snap(slot, 'paused-page-departure') };
        try { view.navigateToPreviousPage?.(); } catch (e) { navigationError = navigationError || String(e); }
        await h.sleep(450);
      } else {
        const outside = h.arrange(slot, 'outside'); await h.sleep(220);
        const outsideState = h.snap(slot, 'paused-outside');
        const reentry = h.arrange(slot, 'visible'); await h.sleep(220);
        departure = { outside, outsideState, reentry, reentryState: h.snap(slot, 'paused-reentry') };
      }
      const beforeSignals = h.snap(slot, 'paused-before-signals');
      let signalError = null;
      try { view.iframeWindow?.dispatchEvent(new view.iframeWindow.Event('focus')); view.iframeWindow?.dispatchEvent(new view.iframeWindow.Event('resize')); reader._window?.dispatchEvent(new reader._window.Event('focus')); reader._window?.dispatchEvent(new reader._window.Event('resize')); } catch (e) { signalError = String(e); }
      p.setStringPref(modePref, mode === 'sentence' ? 'outside' : 'sentence');
      await h.sleep(180);
      try { manager._stateChanged?.(); } catch (e) { signalError = signalError || String(e); }
      await h.sleep(220);
      const after = h.snap(slot, 'paused-after-signals');
      row.before = before; row.wheel = wheel; row.departure = departure; row.beforeSignals = beforeSignals; row.after = after; row.signalError = signalError;
      row.expectations = {
        paused: after.paused === true && after.pausedDiagnostic === true,
        noAutomaticTarget: JSON.stringify(beforeSignals.last) === JSON.stringify(after.last),
        noResumeOnFocusOrMode: after.following === beforeSignals.following || after.reason !== 'resume',
      };
    } catch (e) { row.error = String(e); }
    return row;
  };
  try {
    for (const mode of ['sentence', 'outside']) for (const kind of ['pdf', 'epubScrolled', 'epubPaginated']) rows.push(await runOne(kind, mode));
  } finally { restore(); await h.sleep(180); }
  return JSON.stringify({ rows, restored: { mode: { value: p.getStringPref(modePref, '<none>'), user: p.prefHasUserValue(modePref) }, keep: { value: p.getBoolPref(keepPref, true), user: p.prefHasUserValue(keepPref) } } });
})()
