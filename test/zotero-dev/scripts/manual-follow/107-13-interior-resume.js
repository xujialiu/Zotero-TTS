return (async () => {
  const state = Zotero.ZoteroTTSRun.state, h = state.helpers;
  const modePref = 'extensions.zotero.zotero-tts.readAloud.autoScrollMode';
  const keepPref = 'extensions.zotero.zotero-tts.readAloud.keepFollowingWhileVisible';
  if (!h) throw new Error('helpers missing');
  const p = Services.prefs;
  const originalMode = { value: p.getStringPref(modePref, 'sentence'), user: p.prefHasUserValue(modePref) };
  const originalKeep = { value: p.getBoolPref(keepPref, true), user: p.prefHasUserValue(keepPref) };
  const slots = [['pdf', state.fixtures?.pdf], ['epubScrolled', state.fixtures?.epubScrolled]];
  const scrollValue = geometry => geometry?.kind === 'pdf' ? Number(geometry.viewport?.scrollTop) : Number(geometry.viewport?.scrollY);
  const maxScroll = geometry => geometry?.kind === 'pdf' ? Number(geometry.viewport?.maxScrollTop) : Number(geometry.viewport?.maxScrollY);
  const viewportTop = geometry => geometry?.kind === 'pdf' ? Number(geometry.viewport?.top || 0) : 0;
  const viewportHeight = geometry => Number(geometry?.viewport?.height || 0);
  const wholeBox = geometry => {
    const boxes = geometry?.boxes || [];
    if (!boxes.length) return null;
    return [Math.min(...boxes.map(box => box.screen[0])), Math.min(...boxes.map(box => box.screen[1])), Math.max(...boxes.map(box => box.screen[2])), Math.max(...boxes.map(box => box.screen[3]))];
  };
  const expectedCenter = geometry => {
    const whole = wholeBox(geometry), current = scrollValue(geometry), height = viewportHeight(geometry);
    if (!whole || !Number.isFinite(current) || !Number.isFinite(height)) return null;
    const target = current + ((whole[1] + whole[3]) / 2 - (viewportTop(geometry) + height / 2));
    return Math.max(0, Math.min(maxScroll(geometry), target));
  };
  const compact = snap => ({
    label: snap.label, position: snap.position, active: snap.active, paused: snap.paused, flow: snap.flow,
    scroll: scrollValue(snap.geometry), visibleFragments: snap.visibleFragments,
    boxes: snap.geometry?.boxes?.map(box => ({ screen: box.screen, visible: box.visible })) || [],
    following: snap.following, pausedDiagnostic: snap.pausedDiagnostic, sentenceProtected: snap.sentenceProtected,
    interacting: snap.interacting, visibilityPaused: snap.visibilityPaused, reason: snap.reason,
    last: snap.last ? { at: snap.last.at, reason: snap.last.reason, from: snap.last.from, top: snap.last.top, left: snap.last.left, issued: snap.last.issued } : null,
  });
  const assert = (condition, message, evidence) => {
    if (!condition) throw new Error(message + ' ' + JSON.stringify(evidence));
  };
  const place = async (slot, desired, geometry) => {
    const whole = wholeBox(geometry), current = scrollValue(geometry), height = viewportHeight(geometry), top = viewportTop(geometry), max = maxScroll(geometry);
    assert(whole && Number.isFinite(current) && Number.isFinite(height), 'cannot place sentence: geometry unavailable', { desired, geometry: compact(h.snap(slot, 'placement-geometry')) });
    let target = current;
    if (desired === 'visible-offcenter') target = current + whole[1] - (top + Math.min(120, height / 3));
    if (desired === 'partial') target = current + whole[1] - (top - Math.max(2, (whole[3] - whole[1]) / 2));
    if (desired === 'outside') target = current + whole[3] - top + 120;
    target = Math.max(0, Math.min(max, Math.round(target)));
    const actual = h.scroll(slot, target);
    await h.sleep(120);
    return { desired, target, actual, before: geometry, after: h.geometry(slot) };
  };
  const candidateFor = async (kind, slot) => {
    const manager = h.manager(slot), internal = h.internal(slot);
    h.select(slot); await h.pause(slot);
    let candidate = null;
    const count = Math.min(manager?._segments?.length || 0, 100);
    for (let index = 1; index < count; index++) {
      await h.setSegment(slot, index); await h.pause(slot); h.scroll(slot, 0); await h.sleep(100);
      const geometry = h.geometry(slot), whole = wholeBox(geometry), height = viewportHeight(geometry);
      if (!whole || !(height > 0) || whole[3] - whole[1] > height - 2) continue;
      const placement = await place(slot, 'visible-offcenter', geometry), placed = placement.after, placedWhole = wholeBox(placed);
      const top = viewportTop(placed), bottom = top + viewportHeight(placed), center = placedWhole && (placedWhole[1] + placedWhole[3]) / 2;
      const target = expectedCenter(placed);
      const fullyVisible = !!placedWhole && placedWhole[1] >= top && placedWhole[3] <= bottom;
      const offCenter = fullyVisible && Math.abs(center - (top + viewportHeight(placed) / 2)) > 20;
      if (fullyVisible && offCenter && target > 2 && target < maxScroll(placed) - 2) {
        candidate = { index, text: String(manager._segments[index]?.text || '').slice(0, 120), geometry: placed, placement, targetFormula: 'clamp(current + sentenceCenter - viewportCenter, 0, maxScroll)', target };
        break;
      }
      h.scroll(slot, 0);
    }
    assert(candidate, 'no interior fitting sentence has a non-edge center target', { kind, count });
    h.scroll(slot, 0); await h.sleep(120);
    return candidate;
  };
  const rows = [];
  let candidates = {};
  try {
    for (const [kind, slot] of slots) {
      assert(slot && h.reader(slot) && h.manager(slot), 'fixture reader missing', { kind });
      p.setStringPref(modePref, 'sentence'); p.setBoolPref(keepPref, true);
      candidates[kind] = await candidateFor(kind, slot);
    }
    for (const [kind, slot] of slots) {
      const manager = h.manager(slot), internal = h.internal(slot), candidate = candidates[kind];
      for (const mode of ['sentence', 'outside']) {
        for (const desired of ['visible-offcenter', 'partial', 'outside']) {
          const row = { kind, mode, desired, index: candidate.index, text: candidate.text, path: 'native', error: null };
          try {
            p.setStringPref(modePref, mode); p.setBoolPref(keepPref, true); h.select(slot);
            await h.pause(slot); await h.setSegment(slot, candidate.index); await h.pause(slot);
            try { internal?._lockPositionToReadAloud?.(); } catch (e) {}
            try { manager?._stateChanged?.(); } catch (e) {}
            h.scroll(slot, 0); await h.sleep(180);
            let startError = null;
            try { internal.toggleReadAloudPaused(false); } catch (e) { startError = String(e); }
            await h.sleep(360);
            const playingAtStart = h.snap(slot, 'native-start-playing');
            const wheel = h.trustedWheel(slot, 'interior-resume');
            const placement = await place(slot, desired, h.geometry(slot));
            await h.sleep(220);
            const protectedBeforePause = h.snap(slot, 'protected-before-native-pause');
            const beforePauseScroll = scrollValue(protectedBeforePause.geometry);
            assert(wheel.events?.some(event => event.trusted), 'native resume row lacked trusted wheel evidence', { wheel, row });
            assert(playingAtStart.paused === false, 'native play half did not enter playing state', { row, startError, playingAtStart: compact(playingAtStart) });
            if (desired === 'partial') {
              const whole = wholeBox(protectedBeforePause.geometry), top = viewportTop(protectedBeforePause.geometry);
              assert(whole && whole[1] < top && whole[3] > top, 'partial placement did not clip the sentence', { row, placement, protectedBeforePause: compact(protectedBeforePause) });
            }
            assert(protectedBeforePause.sentenceProtected === true && protectedBeforePause.interacting === false, 'manual protection was not settled before native pause', { row, protectedBeforePause: compact(protectedBeforePause) });
            let pauseError = null;
            try { internal.toggleReadAloudPaused(true); } catch (e) { pauseError = String(e); }
            await h.sleep(360);
            const paused = h.snap(slot, 'native-pause-half');
            const pausedScroll = scrollValue(paused.geometry);
            assert(paused.paused === true && paused.pausedDiagnostic === true, 'native pause half did not report paused', { row, pauseError, paused: compact(paused) });
            assert(Number.isFinite(beforePauseScroll) && Number.isFinite(pausedScroll) && Math.abs(pausedScroll - beforePauseScroll) <= 1, 'native pause half pulled the protected sentence', { row, beforePause: compact(protectedBeforePause), paused: compact(paused), beforePauseScroll, pausedScroll });
            assert(JSON.stringify(paused.last) === JSON.stringify(protectedBeforePause.last), 'native pause half changed the follow target', { row, beforePause: compact(protectedBeforePause), paused: compact(paused) });
            const formulaTarget = expectedCenter(paused.geometry);
            assert(Number.isFinite(formulaTarget), 'resume center target could not be calculated', { row, paused: compact(paused) });
            let resumeError = null;
            try { internal.toggleReadAloudPaused(false); } catch (e) { resumeError = String(e); }
            await h.sleep(420);
            let resumed = h.snap(slot, 'native-resume');
            let actual = scrollValue(resumed.geometry), delta = Math.abs(actual - formulaTarget);
            for (let i = 0; i < 8 && delta > 1; i++) { await h.sleep(120); resumed = h.snap(slot, 'native-resume-settled'); actual = scrollValue(resumed.geometry); delta = Math.abs(actual - formulaTarget); }
            const diagnosticTarget = resumed.last?.top ?? null;
            assert(resumed.paused === false && resumed.pausedDiagnostic === false, 'native resume false did not enter playing state', { row, resumeError, resumed: compact(resumed) });
            assert(resumed.following === true && resumed.reason === 'resume' && resumed.sentenceProtected === false, 'native resume did not force following/clear protection', { row, resumed: compact(resumed) });
            assert(delta <= 1, 'native resume center target missed by more than 1px', { row, targetFormula: 'clamp(current + sentenceCenter - viewportCenter, 0, maxScroll)', expected: formulaTarget, actual, delta, diagnosticTarget, paused: compact(paused), resumed: compact(resumed) });
            row.wheel = wheel; row.placement = { desired, target: placement.target, actual: placement.actual, beforeVisible: placement.before?.boxes?.filter(box => box.visible).length ?? null, afterVisible: placement.after?.boxes?.filter(box => box.visible).length ?? null, after: compact(h.snap(slot, 'placement-after')) };
            row.start = compact(playingAtStart); row.pauseHalf = { before: compact(protectedBeforePause), after: compact(paused), movement: Math.abs(pausedScroll - beforePauseScroll), pauseError };
            row.resume = { targetFormula: 'clamp(current + sentenceCenter - viewportCenter, 0, maxScroll)', expected: formulaTarget, actual, delta, diagnosticTarget, resumeError, state: compact(resumed) };
            row.status = 'PASS';
          } catch (e) {
            row.error = String(e); row.status = 'FAIL'; throw e;
          } finally {
            try { if (manager?.active && !manager.paused) internal.toggleReadAloudPaused(true); } catch (e) {}
            try { h.scroll(slot, 0); } catch (e) {}
            await h.sleep(120);
          }
          rows.push(row);
        }
      }
    }
  } finally {
    for (const [, slot] of slots) {
      try { const internal = h.internal(slot), manager = h.manager(slot); if (manager?.active && !manager.paused) internal?.toggleReadAloudPaused?.(true); } catch (e) {}
      try { h.scroll(slot, 0); } catch (e) {}
    }
    h.restorePref(modePref, originalMode); h.restorePref(keepPref, originalKeep); await h.sleep(220);
  }
  const restored = { mode: { value: p.getStringPref(modePref, '<none>'), user: p.prefHasUserValue(modePref) }, keep: { value: p.getBoolPref(keepPref, true), user: p.prefHasUserValue(keepPref) } };
  assert(restored.mode.value === originalMode.value && restored.mode.user === originalMode.user && restored.keep.value === originalKeep.value && restored.keep.user === originalKeep.user, 'supplemental pref restoration mismatch', { originalMode, originalKeep, restored });
  return JSON.stringify({ rows, candidates, restored, audioMoving: !!state.audio?.anyMoving });
})()
