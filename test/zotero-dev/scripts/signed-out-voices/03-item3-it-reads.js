// Item 3 (issue #130): "It reads." The fixture's popup is open+paused (01,
// 02). Plays (manager.play(), muted -- readAloud.volume is 0 since 00) and
// polls up to 10s for BOTH manager.active && !manager.paused AND a new
// debug line matching "<provider>: N word timestamp(s) for M chars" (the
// exact format remote-interface.ts's synthesize() writes), scoped to a
// debug-log length offset taken just before play() so an EARLIER item's
// line can never satisfy this check. Confirms manager._voice.tier is
// neither 'standard' nor 'premium'. Then pauses again (bounding spend to
// one short segment) and closes the popup with Zotero's own
// toggleReadAloudPopup(false) (never a bare manager.deactivate() --
// driving notes/rulebook: the open popup would re-activate it at once).
// Leaves the fixture tab OPEN, popup CLOSED, tab still signed out, for
// item 4.
// params: none. state: reads fixtureItemID/fixtureTitle; writes nothing new.
(async () => {
  const out = { step: 'item3-it-reads' };
  const S = Zotero.ZoteroTTSRun.state;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  try {
    const itemID = S.fixtureItemID;
    const fixtureTitle = S.fixtureTitle;
    if (!itemID) throw new Error('state.fixtureItemID is missing -- run 00-baseline-setup.js first');

    const readers = Zotero.Reader._readers || [];
    const r = readers.find((x) => x.itemID === itemID);
    if (!r) throw new Error('fixture reader not found');
    const ir = r._internalReader;
    const m = Components.utils.waiveXrays(ir._readAloudManager);
    if (!m.active) throw new Error('the read-aloud session is not active -- run 01/02 first');

    out.volume = Zotero.Prefs.get('zotero-tts.readAloud.volume');
    out.voiceIDBefore = m._voice ? String(m._voice.id) : (m.selectedVoiceID ? String(m.selectedVoiceID) : null);

    const debugBefore = await Zotero.Debug.get();
    const debugOffset = debugBefore.length;

    m.play();
    const t0 = Date.now();
    let sawActivePlaying = false;
    let sawTimestampLine = false;
    let matchedLine = null;
    let provider = null;
    while (Date.now() - t0 < 10000) {
      if (m.active && !m.paused) sawActivePlaying = true;
      const debugNow = await Zotero.Debug.get();
      const slice = debugNow.slice(debugOffset);
      const match = slice.match(/\[zotero-tts\]\s*([a-z-]+): (\d+) word timestamps? for (\d+) chars/);
      if (match) { sawTimestampLine = true; matchedLine = match[0]; provider = match[1]; break; }
      await sleep(200);
    }
    out.sawActivePlayingWithin10s = sawActivePlaying;
    out.sawTimestampLineWithin10s = sawTimestampLine;
    out.matchedDebugLine = matchedLine;
    out.debugLineProvider = provider;

    out.voiceTierWhilePlaying = m._voice ? m._voice.tier : null;
    out.voiceTierIsNotZotero = out.voiceTierWhilePlaying !== 'standard' && out.voiceTierWhilePlaying !== 'premium';

    // Bound spend: pause again at once.
    try { m.pause(); } catch (e) { /* ignore */ }
    out.pausedAfterCheck = !!m.paused;

    // Stop and close the popup (Zotero's own setter -- never a bare deactivate()).
    ir.toggleReadAloudPopup(false);
    const t1 = Date.now();
    while (Date.now() - t1 < 10000) {
      const popupOpen = ir._state && ir._state.readAloudState ? !!ir._state.readAloudState.popupOpen : null;
      if (popupOpen === false) break;
      await sleep(100);
    }
    out.popupOpenAfterClose = ir._state && ir._state.readAloudState ? !!ir._state.readAloudState.popupOpen : null;
    out.activeAfterClose = !!m.active;
  } catch (e) {
    out.error = String(e);
    out.stack = e && e.stack ? String(e.stack).split('\n').slice(0, 4).join(' | ') : null;
  }
  if (out.error) throw new Error(out.error);
  return JSON.stringify(out, null, 1);
})();
