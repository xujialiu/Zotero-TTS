return (async () => {
  const run = Zotero.ZoteroTTSRun, state = run.state, h = state.helpers;
  const modePref = 'extensions.zotero.zotero-tts.readAloud.autoScrollMode';
  const keepPref = 'extensions.zotero.zotero-tts.readAloud.keepFollowingWhileVisible';
  if (!h) return JSON.stringify({ error: 'helpers missing' });
  const p = Services.prefs;
  const originalMode = { value: p.getStringPref(modePref, 'sentence'), user: p.prefHasUserValue(modePref) };
  const originalKeep = { value: p.getBoolPref(keepPref, true), user: p.prefHasUserValue(keepPref) };
  const restore = () => {
    h.restorePref(modePref, originalMode);
    h.restorePref(keepPref, originalKeep);
  };
  const result = { scrollable: [], paginated: [] };
  const testScrollable = async (kind, mode) => {
    const slot = state.fixtures?.[kind];
    if (!slot || !h.reader(slot)) return { kind, mode, error: 'fixture reader missing' };
    const manager = h.manager(slot), internal = h.internal(slot);
    const row = { kind, mode, keep: true, error: null };
    try {
      p.setStringPref(modePref, mode);
      h.select(slot);
      await h.pause(slot);
      await h.setSegment(slot, 0);
      try { internal?._lockPositionToReadAloud?.(); } catch (e) {}
      await h.sleep(160);
      const setup = h.arrange(slot, 'visible');
      try { manager?._stateChanged?.(); } catch (e) {}
      await h.sleep(220);
      row.setup = { placement: setup, snapshot: h.snap(slot, 'setup') };
      let playError = null;
      try { manager?.play?.(); } catch (e) { playError = String(e); }
      await h.sleep(220);
      const wheel = h.trustedWheel(slot, 'current');
      const partialPlacement = h.arrange(slot, 'partial');
      await h.sleep(250);
      const partial = h.snap(slot, 'current-partial-settled');
      const pushes = await h.statePushes(slot, 2, 'same-sentence-push');
      const partialAfterPush = h.snap(slot, 'current-partial-after-pushes');
      const outsidePlacement = h.arrange(slot, 'outside');
      await h.sleep(250);
      const outside = h.snap(slot, 'current-outside-settled');
      const outsidePushes = await h.statePushes(slot, 2, 'outside-same-sentence-push');
      const outsideAfterPush = h.snap(slot, 'current-outside-after-pushes');
      const reentryPlacement = h.arrange(slot, 'partial');
      await h.sleep(250);
      const reentry = h.snap(slot, 'current-partial-reentry');
      const beforeLaterOutsidePlacement = h.arrange(slot, 'outside');
      await h.sleep(220);
      const beforeLaterOutside = h.snap(slot, 'before-later-outside');
      const laterOutside = await h.setSegment(slot, 1);
      const laterOutsideState = h.snap(slot, 'later-outside');
      const laterOutsidePushes = await h.statePushes(slot, 1, 'later-outside-push');
      const laterVisiblePlacement = h.arrange(slot, 'visible');
      await h.sleep(300);
      const laterVisible = h.snap(slot, 'later-visible-reentry');
      row.wheel = wheel;
      row.current = { partialPlacement, partial, pushes, partialAfterPush, outsidePlacement, outside, outsidePushes, outsideAfterPush, reentryPlacement, reentry };
      try { if (manager?.active && !manager.paused) manager.pause(); } catch (e) {}
      row.later = { beforeLaterOutsidePlacement, beforeLaterOutside, playError, laterOutside, laterOutsideState, laterOutsidePushes, laterVisiblePlacement, laterVisible };
      row.expectations = {
        trustedWheel: wheel.events?.some(event => event.trusted),
        protectedAfterGesture: partialAfterPush.sentenceProtected === true && partialAfterPush.interacting === false,
        noTargetWhileProtected: !(partialAfterPush.last?.issued && partialAfterPush.last?.at > partial.at),
        outsideNoPullback: outside.following === false && outside.visibilityPaused === true,
        reentryStillProtected: reentry.following === false && reentry.sentenceProtected === true,
        laterOutsideNoPullback: laterOutsideState.following === false,
        laterVisibleResumes: laterVisible.following === true && laterVisible.visibilityPaused === false,
      };
    } catch (e) { row.error = String(e); }
    return row;
  };
  const testPaginated = async mode => {
    const kind = 'epubPaginated', slot = state.fixtures?.[kind];
    if (!slot || !h.reader(slot)) return { kind, mode, error: 'paginated fixture reader missing' };
    const view = h.view(slot), manager = h.manager(slot), row = { kind, mode, keep: true, flow: view?.flowMode, error: null };
    try {
      p.setStringPref(modePref, mode); h.select(slot); await h.pause(slot); await h.setSegment(slot, 50); await h.sleep(180);
      try { view?.navigateToFirstPage?.(); } catch (e) {}
      await h.sleep(550);
      row.setup = h.snap(slot, 'paginated-setup');
      let playError = null;
      try { manager?.play?.(); } catch (e) { playError = String(e); }
      await h.sleep(220);
      const wheel = h.trustedWheel(slot, 'paginated-current');
      let nextError = null;
      try { view?.navigateToNextPage?.(); } catch (e) { nextError = String(e); }
      await h.sleep(550);
      const outside = h.snap(slot, 'paginated-current-outside');
      const pushes = await h.statePushes(slot, 2, 'paginated-same-sentence-push');
      // Move the current spread to the later sentence's actual selector while
      // the original sentence remains protected. The selector navigation is
      // a controlled viewport operation; it does not synthesize a new state.
      let targetNavigationError = null;
      try {
        const helper = Components.utils.waiveXrays(view._readAloud);
        const target = manager._segments[51];
        const selector = helper._positionToSelector(target.sourcePosition);
        const options = Components.utils.cloneInto({ ifNeeded: false, block: 'start', behavior: 'instant' }, view.iframeDocument);
        await view.navigateToSelector(selector, options);
      } catch (e) { targetNavigationError = String(e); }
      await h.sleep(550);
      const reentry = h.snap(slot, 'paginated-current-reentry');
      const later = await h.setSegment(slot, 51);
      await h.sleep(350);
      const laterState = h.snap(slot, 'paginated-later-visible');
      row.wheel = wheel; row.outside = outside; row.pushes = pushes; row.reentry = reentry; row.later = { later, laterState };
      try { if (manager?.active && !manager.paused) manager.pause(); } catch (e) {}
      row.navigation = { nextError, targetNavigationError, playError };
      row.expectations = {
        trustedWheel: wheel.events?.some(event => event.trusted),
        protectedAfterGesture: outside.sentenceProtected === true || outside.interacting === false,
        noPullbackOutside: outside.following === false || outside.visibilityPaused === true,
        reentryDoesNotAutoCenter: reentry.following === false || reentry.sentenceProtected === true,
        laterStateCaptured: laterState.position === 51,
        laterVisibleResumes: laterState.following === true && laterState.visibilityPaused === false && laterState.paused === false,
      };
      try { manager?._stateChanged?.(); } catch (e) {}
    } catch (e) { row.error = String(e); }
    return row;
  };
  try {
    for (const mode of ['sentence', 'outside']) {
      result.scrollable.push(await testScrollable('pdf', mode));
      result.scrollable.push(await testScrollable('epubScrolled', mode));
      result.paginated.push(await testPaginated(mode));
    }
  } finally {
    restore();
    await h.sleep(180);
  }
  return JSON.stringify({ result, restored: { mode: { value: p.getStringPref(modePref, '<none>'), user: p.prefHasUserValue(modePref) }, keep: { value: p.getBoolPref(keepPref, true), user: p.prefHasUserValue(keepPref) } } });
})()
