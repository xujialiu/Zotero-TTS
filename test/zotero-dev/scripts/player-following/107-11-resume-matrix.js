return (async () => {
  const state = Zotero.ZoteroTTSRun.state, h = state.helpers;
  const modePref = 'extensions.zotero.zotero-tts.readAloud.autoScrollMode';
  const keepPref = 'extensions.zotero.zotero-tts.readAloud.keepFollowingWhileVisible';
  if (!h) return JSON.stringify({ error: 'helpers missing' });
  const p = Services.prefs;
  const originalMode = { value: p.getStringPref(modePref, 'sentence'), user: p.prefHasUserValue(modePref) };
  const originalKeep = { value: p.getBoolPref(keepPref, true), user: p.prefHasUserValue(keepPref) };
  const compact = snap => ({
    label: snap.label, position: snap.position, active: snap.active, paused: snap.paused,
    flow: snap.flow, scrollTop: snap.geometry?.viewport?.scrollTop ?? null, scrollY: snap.geometry?.viewport?.scrollY ?? null,
    visibleFragments: snap.visibleFragments, viewport: snap.geometry?.viewport ?? null,
    boxes: snap.geometry?.boxes?.map(box => ({ screen: box.screen, document: box.document ?? null, visible: box.visible })) ?? [],
    following: snap.following, pausedDiagnostic: snap.pausedDiagnostic, sentenceProtected: snap.sentenceProtected,
    interacting: snap.interacting, visibilityPaused: snap.visibilityPaused, pending: snap.pending, reason: snap.reason,
    last: snap.last ? { at: snap.last.at, reason: snap.last.reason, from: snap.last.from, top: snap.last.top, left: snap.last.left, issued: snap.last.issued } : null,
  });
  const compactPlacement = placement => placement ? ({ desired: placement.desired, arranged: placement.arranged, target: placement.target, actual: placement.actual,
    method: placement.method, note: placement.note, beforeVisible: placement.before?.boxes?.filter(box => box.visible).length ?? null,
    afterVisible: placement.after?.boxes?.filter(box => box.visible).length ?? null, afterViewport: placement.after?.viewport ?? null }) : null;
  const restore = () => { h.restorePref(modePref, originalMode); h.restorePref(keepPref, originalKeep); };
  const arrangePage = async (slot, desired) => {
    const view = h.view(slot);
    const first = async () => { try { await view?.navigateToFirstPage?.(); } catch (e) {} await h.sleep(450); return h.geometry(slot); };
    let geometry = await first();
    if (desired === 'visible' && !(geometry?.boxes || []).some(box => box.visible)) {
      for (let i = 0; i < 3 && !(geometry?.boxes || []).some(box => box.visible); i++) { try { await view?.navigateToNextPage?.(); } catch (e) {} await h.sleep(450); geometry = h.geometry(slot); }
    }
    if (desired === 'outside') {
      for (let i = 0; i < 3 && (geometry?.boxes || []).some(box => box.visible); i++) { try { await view?.navigateToNextPage?.(); } catch (e) {} await h.sleep(450); geometry = h.geometry(slot); }
    }
    if (desired === 'partial') {
      let best = geometry;
      for (let i = 0; i < 3; i++) {
        const count = best?.boxes?.filter(box => box.visible).length || 0;
        if (count > 0 && count < (best?.boxes?.length || 0)) break;
        try { await view?.navigateToNextPage?.(); } catch (e) {}
        await h.sleep(450);
        best = h.geometry(slot);
      }
      geometry = best;
    }
    return { desired, arranged: !!geometry, method: 'page-navigation', before: geometry, after: h.geometry(slot), note: desired === 'partial' && !((geometry?.boxes || []).some(box => box.visible) && (geometry?.boxes || []).some(box => !box.visible)) ? 'no spread-crossing partial sentence was available' : null };
  };
  const arrange = async (slot, desired) => h.view(slot)?.flowMode === 'paginated' ? arrangePage(slot, desired) : h.arrange(slot, desired);
  const prepare = async (slot, kind, desired, keep) => {
    const manager = h.manager(slot), internal = h.internal(slot), view = h.view(slot);
    h.select(slot); p.setBoolPref(keepPref, keep); await h.pause(slot);
    await h.setSegment(slot, kind === 'epubPaginated' ? 50 : 0);
    try { internal?._lockPositionToReadAloud?.(); } catch (e) {}
    await h.sleep(180);
    const wheel = h.trustedWheel(slot, 'resume-setup');
    const placement = await arrange(slot, desired);
    await h.sleep(220);
    // Keep the session paused after page navigation and capture the pause half
    // separately from the subsequent play transition.
    await h.pause(slot);
    const paused = h.snap(slot, 'resume-before-play');
    return { manager, internal, view, wheel, placement, paused };
  };
  const runPath = async (slot, kind, mode, desired, keep, path) => {
    const row = { kind, mode, desired, keep, path, error: null };
    try {
      p.setStringPref(modePref, mode);
      const setup = await prepare(slot, kind, desired, keep);
      const resumed = await h.resume(slot, path);
      row.wheel = setup.wheel;
      row.placement = compactPlacement(setup.placement);
      row.before = compact(setup.paused);
      row.playing = compact(resumed.playing);
      row.afterPause = compact(resumed.afterPause);
      row.errors = { resume: resumed.error, pause: resumed.pauseError };
      row.expectations = {
        actualPathAttempted: true,
        pausedBeforeResume: setup.paused.paused === true,
        pauseNoResume: setup.paused.reason !== 'resume',
        forcedFollowing: resumed.playing.following === true && resumed.playing.reason === 'resume',
        protectionCleared: resumed.playing.sentenceProtected === false,
        // PDF resets its diagnostic last decision after the forced call; the
        // visible target is proved by reason=resume plus the measured return
        // from an offscreen viewport. DOM and paginated views keep a return or
        // page decision in `last`.
        forcedTarget: resumed.playing.reason === 'resume' && (resumed.playing.last?.issued === true || ['return', 'page', 'cut', 'sentence'].includes(resumed.playing.last?.reason) || resumed.playing.visibleFragments > 0),
        pauseHalfDidNotForce: setup.paused.last?.reason !== 'resume',
      };
    } catch (e) { row.error = String(e); }
    return row;
  };
  const rows = [];
  try {
    for (const [kind, slot] of [['pdf', state.fixtures?.pdf], ['epubScrolled', state.fixtures?.epubScrolled], ['epubPaginated', state.fixtures?.epubPaginated]]) {
      if (!slot || !h.reader(slot)) { rows.push({ kind, error: 'fixture reader missing' }); continue; }
      for (const mode of ['sentence', 'outside']) for (const keep of [true, false]) for (const desired of ['visible', 'partial', 'outside']) {
        rows.push(await runPath(slot, kind, mode, desired, keep, 'native'));
        // One real direct-manager path per geometry state keeps provider work
        // bounded while proving it is the state transition, rather than a
        // synthetic setState call, that requests the forced return.
        if (mode === 'sentence' && keep === true && desired === 'outside') rows.push(await runPath(slot, kind, mode, desired, keep, 'direct'));
      }
    }
  } finally { restore(); await h.sleep(220); }
  return JSON.stringify({ rows, restored: { mode: { value: p.getStringPref(modePref, '<none>'), user: p.prefHasUserValue(modePref) }, keep: { value: p.getBoolPref(keepPref, true), user: p.prefHasUserValue(keepPref) } } });
})()
