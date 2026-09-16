return (async () => {
  const state = Zotero.ZoteroTTSRun.state, h = state.helpers;
  const modePref = 'extensions.zotero.zotero-tts.readAloud.autoScrollMode';
  const keepPref = 'extensions.zotero.zotero-tts.readAloud.keepFollowingWhileVisible';
  if (!h) return JSON.stringify({ error: 'helpers missing' });
  const p = Services.prefs;
  const originalMode = { value: p.getStringPref(modePref, 'sentence'), user: p.prefHasUserValue(modePref) };
  const originalKeep = { value: p.getBoolPref(keepPref, true), user: p.prefHasUserValue(keepPref) };
  const compact = snap => ({ label: snap.label, position: snap.position, active: snap.active, paused: snap.paused, flow: snap.flow,
    scrollTop: snap.geometry?.viewport?.scrollTop ?? null, scrollY: snap.geometry?.viewport?.scrollY ?? null, visibleFragments: snap.visibleFragments,
    following: snap.following, pausedDiagnostic: snap.pausedDiagnostic, sentenceProtected: snap.sentenceProtected, interacting: snap.interacting,
    visibilityPaused: snap.visibilityPaused, reason: snap.reason, last: snap.last ? { at: snap.last.at, reason: snap.last.reason, from: snap.last.from, top: snap.last.top, left: snap.last.left, issued: snap.last.issued } : null });
  const restore = () => { h.restorePref(modePref, originalMode); h.restorePref(keepPref, originalKeep); };
  const kinds = ['pdf', 'epubScrolled', 'epubPaginated'];
  const rows = [];
  for (const kind of kinds) {
    const slot = state.fixtures?.[kind], reader = h.reader(slot), manager = h.manager(slot), internal = h.internal(slot), view = h.view(slot);
    const row = { kind, error: null };
    if (!slot || !reader || !manager || !internal || !view) { row.error = 'fixture reader or manager missing'; rows.push(row); continue; }
    try {
      h.select(slot); p.setStringPref(modePref, 'sentence'); p.setBoolPref(keepPref, true); await h.pause(slot); await h.setSegment(slot, kind === 'epubPaginated' ? 50 : 0);
      try { view.navigateToFirstPage?.(); } catch (e) {}
      await h.sleep(450);
      const pausedBefore = h.snap(slot, 'explicit-paused-before');
      const placement = h.arrange(slot, 'outside');
      await h.sleep(260);
      const outside = h.snap(slot, 'explicit-paused-outside');
      let returnError = null;
      try { internal._lockPositionToReadAloud?.(); } catch (e) { returnError = String(e); }
      try { manager._stateChanged?.(); } catch (e) { returnError = returnError || String(e); }
      await h.sleep(450);
      const explicitReturn = h.snap(slot, 'explicit-paused-return');
      await h.pause(slot); await h.setSegment(slot, 0); await h.sleep(250);
      let sentenceError = null, paragraphError = null;
      try { manager.skipAhead?.('sentence', false); } catch (e) { sentenceError = String(e); }
      await h.sleep(320);
      const sentenceSkip = h.snap(slot, 'explicit-paused-sentence-skip');
      try { manager.skipAhead?.('paragraph', false); } catch (e) { paragraphError = String(e); }
      await h.sleep(320);
      const paragraphSkip = h.snap(slot, 'explicit-paused-paragraph-skip');
      // One playing transition per format checks that the explicit skips also
      // work while the session is playing. Audio-clock status is reported
      // separately; a suspended context makes natural advancement untestable.
      let playError = null, playingSkipError = null;
      try { manager.play?.(); } catch (e) { playError = String(e); }
      await h.sleep(280);
      try { manager.skipAhead?.('sentence', false); } catch (e) { playingSkipError = String(e); }
      await h.sleep(350);
      const playingSkip = h.snap(slot, 'explicit-playing-sentence-skip');
      await h.pause(slot);
      // With Keep off, a trusted gesture disengages following and scrolling
      // back or changing mode alone must leave it disengaged.
      p.setBoolPref(keepPref, false); await h.setSegment(slot, kind === 'epubPaginated' ? 50 : 0); await h.pause(slot); await h.sleep(200);
      try { internal._lockPositionToReadAloud?.(); } catch (e) {}
      await h.sleep(180);
      const offBefore = h.snap(slot, 'keep-off-before');
      const wheel = h.trustedWheel(slot, 'keep-off');
      const offPlacement = h.arrange(slot, 'partial'); await h.sleep(220);
      const offAfterMove = h.snap(slot, 'keep-off-after-input');
      const offBack = h.arrange(slot, 'visible'); p.setStringPref(modePref, 'outside'); await h.sleep(220);
      const offAfterBackAndMode = h.snap(slot, 'keep-off-after-back-and-mode');
      let explicitOffError = null;
      try { internal._lockPositionToReadAloud?.(); } catch (e) { explicitOffError = String(e); }
      try { manager._stateChanged?.(); } catch (e) { explicitOffError = explicitOffError || String(e); }
      await h.sleep(420);
      const offExplicit = h.snap(slot, 'keep-off-explicit-return');
      // Ordinary clipping: put a later sentence at an edge while playing and
      // record the target; if the device has no live clock this remains a
      // controlled state observation and is labelled accordingly.
      p.setBoolPref(keepPref, true); p.setStringPref(modePref, 'sentence'); await h.pause(slot); await h.setSegment(slot, 0); await h.sleep(180);
      const ordinaryPlacement = h.arrange(slot, 'visible');
      try { manager.play?.(); } catch (e) { playError = playError || String(e); }
      await h.sleep(260);
      // Pick a later source position that is outside the initial viewport so
      // the normal playing follower must issue a target. The PDF fixture's
      // first segment on page two is index 12; the EPUB copy has sixty
      // repeated paragraphs, so index 20 is several screens below the head.
      const nextIndex = kind === 'pdf' ? 12 : kind === 'epubPaginated' ? 51 : 20;
      const ordinaryTransition = await h.setSegment(slot, nextIndex);
      await h.sleep(380);
      const ordinary = h.snap(slot, 'ordinary-clipping-next-sentence');
      await h.pause(slot);
      row.explicit = { pausedBefore: compact(pausedBefore), placement, outside: compact(outside), returnError, explicitReturn: compact(explicitReturn),
        skips: { sentenceError, sentence: compact(sentenceSkip), paragraphError, paragraph: compact(paragraphSkip), playingSkipError, playing: compact(playingSkip), playError } };
      row.keepOff = { offBefore: compact(offBefore), wheel, placement: offPlacement, afterMove: compact(offAfterMove), back: offBack, afterBackAndMode: compact(offAfterBackAndMode), explicitOffError, explicit: compact(offExplicit) };
      row.ordinary = { naturalAudio: !!state.audio?.out?.find?.(x => x.kind === kind)?.moving, placement: ordinaryPlacement, transition: ordinaryTransition, snapshot: compact(ordinary) };
      row.expectations = {
        pausedReturnForced: explicitReturn.following === true && (explicitReturn.reason === 'explicit' || explicitReturn.last?.reason === 'return'),
        pausedSentenceSkip: sentenceSkip.position !== pausedBefore.position,
        pausedParagraphSkip: paragraphSkip.position !== sentenceSkip.position,
        playingSkipAttempted: !playingSkipError,
        keepOffDisengages: offAfterMove.following === false,
        keepOffPersistsThroughBackAndMode: offAfterBackAndMode.following === false,
        keepOffExplicitRestores: offExplicit.following === true,
        ordinaryTargetRecorded: ordinary.following === true && ordinary.position === nextIndex && ordinary.visibleFragments > 0 && (ordinary.reason === 'resume' || ordinary.last?.issued === true || ordinary.flow === 'paginated'),
      };
    } catch (e) { row.error = String(e); }
    rows.push(row);
  }
  restore(); await h.sleep(220);
  return JSON.stringify({ rows, restored: { mode: { value: p.getStringPref(modePref, '<none>'), user: p.prefHasUserValue(modePref) }, keep: { value: p.getBoolPref(keepPref, true), user: p.prefHasUserValue(keepPref) } } });
})()
