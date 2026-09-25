// Item 5.9 step 4d (issue #143): a third fixture tab opened AFTER the
// reinstall is attached through the renderToolbar listener alone (nothing
// else calls attach() for a reader that did not exist at startup):
// pluginPlayer() lists it with failed:null, its document already holds
// #ztts-player-toggle/#ztts-player-style before any open, the toolbar
// button opens the Player while Zotero's own popup stays display:none, and
// a trusted Shift+Space (plugin-player item 2's own check) opens it too.
// params: root, fixturesDir, runId. state: writes fixtures.c, reads deadReader/tabReader.
(async () => {
  const p = Zotero.ZoteroTTSRun.params || {};
  const state = Zotero.ZoteroTTSRun.state;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const join = (a, b) => String(a).replace(/[\\/]$/, '') + (Zotero.isWin ? '\\' : '/') + String(b);
  const dir = p.fixturesDir || join(p.root || '', 'test/fixtures');
  const run = String(p.runId || Date.now()).replace(/[^A-Za-z0-9_-]/g, '_');
  const out = { step: 'third-fixture-attach' };

  const beforeCount = JSON.parse(await Zotero.ZoteroTTS.diagnostics.pluginPlayer()).readers.length;

  const imported = await Zotero.Attachments.importFromFile({ file: join(dir, 'fixture-c.pdf'), libraryID: Zotero.Libraries.userLibraryID, title: 'Zotero-TTS 143 C ' + run });
  const item = typeof imported === 'number' ? Zotero.Items.get(imported) : imported;
  const c = { id: item?.id ?? null, key: item?.key ?? null, title: item?.getField?.('title') || null };
  state.fixtures = { ...(state.fixtures || {}), c };
  out.fixture = c;

  const win = Zotero.getMainWindow();
  const findReader = (itemID) => (Zotero.Reader?._readers || []).find((r) => r?.itemID === itemID) || null;
  const opened = Zotero.Reader.open(c.id);
  if (opened && typeof opened.then === 'function') await opened;
  let readerC = null;
  for (let i = 0; i < 150; i++) {
    readerC = findReader(c.id);
    if (readerC && readerC._internalReader) break;
    await sleep(100);
  }
  if (!readerC) throw new Error('fixture C reader never exposed _internalReader');
  win.Zotero_Tabs.select(readerC.tabID);
  state.fixtures.c.tabID = readerC.tabID;

  // Wait for the renderToolbar-driven attach: the toggle/style ids exist,
  // before this script ever opens anything.
  let attached = false;
  let idsBeforeOpen = null;
  for (let i = 0; i < 100; i++) {
    try {
      const doc = readerC._iframeWindow.document;
      const toggle = doc.getElementById('ztts-player-toggle');
      const style = doc.getElementById('ztts-player-style');
      if (toggle && style) { attached = true; idsBeforeOpen = { toggle: true, style: true, frameHiddenOrAbsent: !doc.getElementById('ztts-player-frame') || !!doc.getElementById('ztts-player-frame').hidden }; break; }
    } catch (e) { /* not ready */ }
    await sleep(100);
  }
  out.attachedBeforeOpen = attached;
  out.idsBeforeOpen = idsBeforeOpen;

  const afterAttachCount = JSON.parse(await Zotero.ZoteroTTS.diagnostics.pluginPlayer()).readers.length;
  const pp = JSON.parse(await Zotero.ZoteroTTS.diagnostics.pluginPlayer());
  const newRow = pp.readers[pp.readers.length - 1];
  out.pluginPlayerDiagnostic = { beforeCount, afterAttachCount, grewByOne: afterAttachCount === beforeCount + 1, newRowFailed: newRow ? newRow.failed : 'no-row', newRow };

  const doc = () => readerC._iframeWindow.document;
  const m = () => readerC._internalReader?._readAloudManager;
  const nativeDisplay = () => {
    const d = doc();
    const popup = d.querySelector('.read-aloud-popup');
    const cs = (el) => (el ? d.defaultView.getComputedStyle(el).display : 'ABSENT');
    return cs(popup);
  };
  const playerOpenState = () => {
    try { const frame = doc().getElementById('ztts-player-frame'); return !!frame && !frame.hidden; } catch (e) { return null; }
  };
  const closePlayerAndReading = async () => {
    try { readerC._internalReader.toggleReadAloudPopup(false); } catch (e) {}
    for (let i = 0; i < 60; i++) { if (!m()?.active) break; await sleep(100); }
    try { const btn = doc().getElementById('ztts-player-toggle'); if (btn && playerOpenState()) btn.click(); } catch (e) {}
    await sleep(150);
  };

  // Toolbar button: open: true, Zotero's own popup stays display: none.
  const toggleTrace = [{ t: 0, popup: nativeDisplay(), playerOpen: playerOpenState() }];
  doc().getElementById('ztts-player-toggle').click();
  let toggleOpened = false;
  for (let i = 0; i < 40; i++) {
    const sample = { t: (i + 1) * 100, popup: nativeDisplay(), playerOpen: playerOpenState() };
    toggleTrace.push(sample);
    if (sample.playerOpen) { toggleOpened = true; break; }
    await sleep(100);
  }
  out.toolbarButton = { opened: toggleOpened, allPopupNoneOrAbsent: toggleTrace.every((s) => s.popup === 'none' || s.popup === 'ABSENT'), samples: toggleTrace.length };
  // Close again (no reading was started by the button alone).
  doc().getElementById('ztts-player-toggle').click();
  await sleep(200);

  // Shift+Space, trusted (plugin-player item 2's own check): opens the
  // Player and starts a session; stop it and close the Player afterward.
  const trustedKey = (targetWin, { key, code, keyCode, shiftKey }) => {
    const tip = Components.classes['@mozilla.org/text-input-processor;1'].createInstance(Components.interfaces.nsITextInputProcessor);
    tip.beginInputTransactionForTests(targetWin);
    try {
      const flags = { shiftKey: false };
      if (shiftKey) { flags.shiftKey = true; tip.keydown(new targetWin.KeyboardEvent('', { key: 'Shift', code: 'ShiftLeft', keyCode: 16, ...flags, bubbles: true, cancelable: true })); }
      const consumed = tip.keydown(new targetWin.KeyboardEvent('', { key, code, keyCode, ...flags, bubbles: true, cancelable: true }));
      tip.keyup(new targetWin.KeyboardEvent('', { key, code, keyCode, ...flags, bubbles: true, cancelable: true }));
      if (shiftKey) { tip.keyup(new targetWin.KeyboardEvent('', { key: 'Shift', code: 'ShiftLeft', keyCode: 16, ...flags, bubbles: true, cancelable: true })); }
      return consumed;
    } finally { tip.endInputTransaction?.(); }
  };
  win.Zotero_Tabs.select(readerC.tabID);
  readerC._iframeWindow?.focus?.();
  win.focus();
  await sleep(200);
  // The pass condition is the Player opening (mirrors Zotero's own
  // popupOpen, near-instant: 216ms measured 2026-09-25), not `active`
  // (voice/session activation trails it, sometimes by well over 12s under
  // load on a document's first-ever activation -- see the kit README's
  // Limits and 03b for a longer, isolated re-check when this is borderline).
  const shiftSpaceTrace = [{ t: 0, popup: nativeDisplay(), playerOpen: playerOpenState(), active: !!m()?.active }];
  const consumed = trustedKey(win, { key: ' ', code: 'Space', keyCode: 32, shiftKey: true });
  let shiftSpaceOpened = false;
  const t0 = Date.now();
  while (Date.now() - t0 < 20000) {
    const sample = { t: Date.now() - t0, popup: nativeDisplay(), playerOpen: playerOpenState(), active: !!m()?.active, selectedVoiceID: m()?.selectedVoiceID ?? null };
    shiftSpaceTrace.push(sample);
    if (sample.playerOpen) { shiftSpaceOpened = true; break; }
    await sleep(100);
  }
  const usedMeteredVoice = !!(m()?.selectedVoiceID && !String(m().selectedVoiceID).includes('::'));
  out.shiftSpace = {
    consumed,
    opened: shiftSpaceOpened,
    allPopupNoneOrAbsent: shiftSpaceTrace.every((s) => s.popup === 'none' || s.popup === 'ABSENT'),
    samples: shiftSpaceTrace.length,
    first: shiftSpaceTrace[0],
    last: shiftSpaceTrace[shiftSpaceTrace.length - 1],
    usedMeteredVoice,
  };

  // Stop any reading and close the Player, as the brief asks.
  await closePlayerAndReading();
  out.afterStop = { active: !!m()?.active, playerOpen: playerOpenState() };

  state.thirdFixtureAttach = out;
  return JSON.stringify(out, null, 1);
})()
