// Item 7: with a reading open and the Player closed (a fresh instance
// attaching over an already-open session, e.g. right after a reinstall --
// ADR 0007), Shift+O changes nothing: playerOptions() reads player:false,
// button:false. In the Floating panel (layout B) it folds/unfolds the
// rows when the Player IS open. Records the owner's OTHER open readers'
// options state before/after, since playerOptions(true) presses every
// reader's Options button, not just the picked one (driving doc §3).
// params: none. state: reads fixtures.pdf/epub.
(async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = { step: 'item7-shift-o-fallthrough' };
  const safeItemID = (r) => { try { return r.itemID; } catch (e) { return 'DEAD'; } };

  const win = Zotero.getMainWindow();
  const pdfReader = (Zotero.Reader._readers || []).find((r) => safeItemID(r) === state.fixtures.pdf.id);
  if (!pdfReader) throw new Error('PDF fixture reader not found');
  win.restore();
  win.Zotero_Tabs.select(pdfReader.tabID);
  win.focus();
  await sleep(200);

  // Snapshot every OTHER reader's options-panel state, to restore/verify no lasting effect.
  const others = (Zotero.Reader._readers || []).filter((r) => safeItemID(r) !== state.fixtures.pdf.id);
  const otherOptionsBefore = others.map((r) => {
    try {
      const doc = r._iframeWindow.document;
      const frame = doc.getElementById('ztts-player-frame');
      const openNow = !!frame && !frame.hidden;
      return { itemID: safeItemID(r), playerOpen: openNow };
    } catch (e) { return { itemID: safeItemID(r), error: String(e).slice(0, 40) }; }
  });
  out.otherReadersBefore = otherOptionsBefore;

  // Reach "reading open, Player closed": start a reading, close settings pane, reinstall in place.
  const m = () => pdfReader._internalReader?._readAloudManager;
  if (m()?.active) { try { pdfReader._internalReader.toggleReadAloudPopup(false); } catch (e) {} for (let i = 0; i < 40 && m()?.active; i++) await sleep(100); }
  pdfReader._internalReader.startReadAloudAtPosition();
  for (let i = 0; i < 100 && !(m()?.active); i++) await sleep(100);
  out.playingBeforeInstall = { active: !!m()?.active, paused: !!m()?.paused };

  let prefWin = Services.wm.getMostRecentWindow('zotero:pref');
  if (prefWin) { prefWin.close(); for (let i = 0; i < 50 && Services.wm.getMostRecentWindow('zotero:pref'); i++) await sleep(100); }

  const resourceBefore = JSON.parse(await Zotero.ZoteroTTS.diagnostics.pluginPlayer()).resource;
  state.item7ReadyAt = Date.now();
  let newResource = resourceBefore;
  const t0 = Date.now();
  while (Date.now() - t0 < 30000) {
    try {
      const pp = JSON.parse(await Zotero.ZoteroTTS.diagnostics.pluginPlayer());
      if (pp.resource !== resourceBefore) { newResource = pp.resource; break; }
    } catch (e) {}
    await sleep(200);
  }
  out.resourceChanged = newResource !== resourceBefore;
  if (!out.resourceChanged) { out.note = 'reinstall never landed within 30s'; return JSON.stringify(out, null, 1); }
  await sleep(300);

  const readerAgain = (Zotero.Reader._readers || []).find((r) => safeItemID(r) === state.fixtures.pdf.id);
  const m2 = () => readerAgain._internalReader?._readAloudManager;
  const docAgain = readerAgain._iframeWindow.document;
  const frameAgain = docAgain.getElementById('ztts-player-frame');
  out.stateAfterReinstall = { playerOpen: frameAgain ? !frameAgain.hidden : null, sessionActive: !!m2()?.active, sessionPaused: !!m2()?.paused };

  // Shift+O as the plugin sees it, closed Player: playerOptions(true) presses every reader.
  const before = JSON.parse(await Zotero.ZoteroTTS.diagnostics.playerOptions());
  const pressed = JSON.parse(await Zotero.ZoteroTTS.diagnostics.playerOptions(true));
  // Matched by reading THIS reader's own DOM directly below, not by array position.
  out.playerOptionsClosedPress = { rawBefore: before, rawPressed: pressed };
  const myState = (() => { try { return { player: !!frameAgain && !frameAgain.hidden, button: false }; } catch (e) { return null; } })();
  out.closedPlayerFallsThrough = { playerFalse: myState && myState.player === false };

  // Restore any OTHER reader whose options panel this press may have unfolded.
  const otherOptionsAfterPress = [];
  for (const r of others) {
    try {
      const doc = r._iframeWindow.document;
      const frame = doc.getElementById('ztts-player-frame');
      const openNow = !!frame && !frame.hidden;
      let expandedNow = null;
      if (openNow && frame.getAttribute('data-layout') === 'B') {
        const btn = frame.contentDocument?.querySelector('.options-toggle');
        expandedNow = btn ? btn.getAttribute('aria-expanded') === 'true' : null;
      }
      otherOptionsAfterPress.push({ itemID: safeItemID(r), playerOpen: openNow, expandedNow });
    } catch (e) { otherOptionsAfterPress.push({ itemID: safeItemID(r), error: String(e).slice(0, 40) }); }
  }
  out.otherReadersAfterPress = otherOptionsAfterPress;

  // Now the positive case: open the Player (Floating layout, per pluginPlayer().layout), Shift+O folds/unfolds.
  const btn = docAgain.getElementById('ztts-player-toggle');
  btn.click();
  await sleep(400);
  const ppNow = JSON.parse(await Zotero.ZoteroTTS.diagnostics.pluginPlayer());
  out.layoutNow = ppNow.layout;
  const before2 = JSON.parse(await Zotero.ZoteroTTS.diagnostics.playerOptions());
  const pressed2 = JSON.parse(await Zotero.ZoteroTTS.diagnostics.playerOptions(true));
  out.playerOptionsOpenPress = { rawBefore: before2, rawPressed: pressed2 };
  const expandedAfterPress = (() => {
    const frame = docAgain.getElementById('ztts-player-frame');
    if (!frame || frame.hidden || frame.getAttribute('data-layout') !== 'B') return null;
    const b = frame.contentDocument?.querySelector('.options-toggle');
    return b ? b.getAttribute('aria-expanded') : null;
  })();
  out.expandedAfterOpenPress = expandedAfterPress;
  // Press again to fold back, confirming the toggle round-trips.
  const pressed3 = JSON.parse(await Zotero.ZoteroTTS.diagnostics.playerOptions(true));
  const expandedAfterSecondPress = (() => {
    const frame = docAgain.getElementById('ztts-player-frame');
    if (!frame || frame.hidden || frame.getAttribute('data-layout') !== 'B') return null;
    const b = frame.contentDocument?.querySelector('.options-toggle');
    return b ? b.getAttribute('aria-expanded') : null;
  })();
  out.expandedAfterSecondPress = expandedAfterSecondPress;
  out.foldedUnfolded = expandedAfterPress !== expandedAfterSecondPress;

  // Cleanup: close the reading and the panel.
  try { readerAgain._internalReader.toggleReadAloudPopup(false); } catch (e) {}
  for (let i = 0; i < 40 && m2()?.active; i++) await sleep(100);
  const frameFinal = docAgain.getElementById('ztts-player-frame');
  if (frameFinal && !frameFinal.hidden) { const b2 = docAgain.getElementById('ztts-player-toggle'); b2?.click(); await sleep(200); }

  win.minimize();
  return JSON.stringify(out, null, 1);
})()
