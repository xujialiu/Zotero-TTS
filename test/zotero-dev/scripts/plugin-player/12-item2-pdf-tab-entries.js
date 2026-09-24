// Item 2, PDF fixture in a tab: all four entry points (toolbar button,
// Cmd/Ctrl+Shift+R, Shift+Space, Read Aloud from Here) open the Player
// (open: true) while Zotero's own popup and headphone button stay
// `display: none` on every 50ms sample from before the open through the
// reading starting. Also proves item 1 live: the icon/Player still attach
// with usePluginPlayer=false (written by 11, still false here).
// params: root, fixturesDir, runId. state: writes windowBaseline, fixtures.pdf/epub, reads usePluginPlayerBaseline.
(async () => {
  const p = Zotero.ZoteroTTSRun.params || {};
  const state = Zotero.ZoteroTTSRun.state;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const join = (a, b) => String(a).replace(/[\\/]$/, '') + (Zotero.isWin ? '\\' : '/') + String(b).split('/').join(Zotero.isWin ? '\\' : '/');
  const dir = p.fixturesDir || join(p.root || '', 'test/fixtures');
  const out = { step: 'item2-pdf-tab-entries', entries: [] };

  // Snapshot the host window once, for the final cleanup script's restore.
  const win = Zotero.getMainWindow();
  state.windowBaseline = { windowState: win.windowState, outerWidth: win.outerWidth, outerHeight: win.outerHeight, screenX: win.screenX, screenY: win.screenY, selectedTab: win.Zotero_Tabs?.selectedID };
  out.windowBaseline = state.windowBaseline;
  win.minimize();
  await sleep(200);

  const importOne = async (path, title) => {
    const imported = await Zotero.Attachments.importFromFile({ file: path, libraryID: Zotero.Libraries.userLibraryID, title });
    const item = typeof imported === 'number' ? Zotero.Items.get(imported) : imported;
    return { id: item?.id ?? null, key: item?.key ?? null, title: item?.getField?.('title') || title };
  };
  const run = String(p.runId || Date.now()).replace(/[^A-Za-z0-9_-]/g, '_');
  const pdf = await importOne(join(dir, 'fixture-a.pdf'), 'Zotero-TTS 134 PDF ' + run);
  const epub = await importOne(join(dir, 'return-key/return-key.epub'), 'Zotero-TTS 134 EPUB ' + run);
  state.fixtures = { pdf, epub };
  out.pdf = pdf; out.epub = epub;

  const waitReader = async (id) => {
    for (let i = 0; i < 120; i++) {
      for (const r of (Zotero.Reader?._readers ?? [])) if (r?.itemID === id && r._internalReader?._readAloudManager) return r;
      await sleep(100);
    }
    return null;
  };
  const opened = Zotero.Reader.open(pdf.id);
  if (opened && typeof opened.then === 'function') await opened;
  let reader = await waitReader(pdf.id);
  if (!reader) throw new Error('PDF fixture reader never exposed _internalReader/_readAloudManager');
  out.readerFound = { itemID: reader.itemID, tabID: reader.tabID };

  const doc = () => reader._iframeWindow.document;
  const m = () => reader._internalReader?._readAloudManager;
  const nativeDisplay = () => {
    const d = doc();
    const popup = d.querySelector('.read-aloud-popup');
    const btn = d.querySelector('#read-aloud');
    const cs = (el) => (el ? d.defaultView.getComputedStyle(el).display : 'ABSENT');
    return { popup: cs(popup), button: cs(btn) };
  };
  const playerOpenState = () => {
    try {
      const frame = doc().getElementById('ztts-player-frame');
      return !!frame && !frame.hidden;
    } catch (e) { return null; }
  };

  // Sample .read-aloud-popup / #read-aloud computed display every 50ms while acting.
  const sampleWhile = async (label, action, ceilingMs = 12000) => {
    const trace = [];
    const t0 = Date.now();
    trace.push({ t: 0, phase: 'before', ...nativeDisplay(), playerOpen: playerOpenState() });
    await action();
    let playing = false;
    while (Date.now() - t0 < ceilingMs) {
      const mm = m();
      const sample = { t: Date.now() - t0, ...nativeDisplay(), playerOpen: playerOpenState(), active: !!mm?.active, paused: !!mm?.paused };
      trace.push(sample);
      if (mm?.active && !mm?.paused) { playing = true; break; }
      await sleep(50);
    }
    // one more sample once it plays, for the "and #read-aloud read none ... until the reading plays" endpoint
    trace.push({ t: Date.now() - t0, phase: 'after-playing', ...nativeDisplay(), playerOpen: playerOpenState() });
    const allNonePopup = trace.every((s) => s.popup === 'none' || s.popup === 'ABSENT');
    const allNoneButton = trace.every((s) => s.button === 'none' || s.button === 'ABSENT');
    return { label, playing, samples: trace.length, first: trace[0], last: trace[trace.length - 1], allNonePopup, allNoneButton, zoteroNeverShown: allNonePopup && allNoneButton };
  };

  const closeReading = async () => {
    try { reader._internalReader.toggleReadAloudPopup(false); } catch (e) {}
    for (let i = 0; i < 60; i++) { if (!m()?.active) break; await sleep(100); }
    // also close our own Player panel if it stayed open
    try { const btn = doc().getElementById('ztts-player-toggle'); if (btn && playerOpenState()) btn.click(); } catch (e) {}
    await sleep(200);
  };

  // 1) Toolbar button
  out.entries.push(await sampleWhile('toolbar-button', async () => {
    const btn = doc().getElementById('ztts-player-toggle');
    if (!btn) throw new Error('no #ztts-player-toggle button');
    btn.click();
  }));
  await closeReading();

  // Restore + focus the host for the two trusted-key entry points.
  win.restore();
  win.Zotero_Tabs.select(reader.tabID);
  reader._iframeWindow?.focus?.();
  win.focus();
  await sleep(300);

  const trustedKey = (targetWin, { key, code, keyCode, ctrlKey, altKey, metaKey, shiftKey }) => {
    const tip = Components.classes['@mozilla.org/text-input-processor;1'].createInstance(Components.interfaces.nsITextInputProcessor);
    tip.beginInputTransactionForTests(targetWin);
    const mods = [];
    if (ctrlKey) mods.push({ key: 'Control', code: 'ControlLeft', keyCode: 17, prop: 'ctrlKey' });
    if (altKey) mods.push({ key: 'Alt', code: 'AltLeft', keyCode: 18, prop: 'altKey' });
    if (metaKey) mods.push({ key: 'Meta', code: 'MetaLeft', keyCode: 91, prop: 'metaKey' });
    try {
      const flags = { ctrlKey: false, altKey: false, metaKey: false, shiftKey: false };
      for (const mod of mods) { flags[mod.prop] = true; tip.keydown(new targetWin.KeyboardEvent('', { key: mod.key, code: mod.code, keyCode: mod.keyCode, ...flags, bubbles: true, cancelable: true })); }
      if (shiftKey) { flags.shiftKey = true; tip.keydown(new targetWin.KeyboardEvent('', { key: 'Shift', code: 'ShiftLeft', keyCode: 16, ...flags, bubbles: true, cancelable: true })); }
      const consumed = tip.keydown(new targetWin.KeyboardEvent('', { key, code, keyCode, ...flags, bubbles: true, cancelable: true }));
      tip.keyup(new targetWin.KeyboardEvent('', { key, code, keyCode, ...flags, bubbles: true, cancelable: true }));
      if (shiftKey) { tip.keyup(new targetWin.KeyboardEvent('', { key: 'Shift', code: 'ShiftLeft', keyCode: 16, ...flags, bubbles: true, cancelable: true })); flags.shiftKey = false; }
      for (let i = mods.length - 1; i >= 0; i--) { const mod = mods[i]; tip.keyup(new targetWin.KeyboardEvent('', { key: mod.key, code: mod.code, keyCode: mod.keyCode, ...flags, bubbles: true, cancelable: true })); flags[mod.prop] = false; }
      return consumed;
    } finally { tip.endInputTransaction?.(); }
  };

  // 2) Cmd/Ctrl+Shift+R (Zotero's own reader shortcut -- reader.js `${pm}-Shift-r`)
  out.entries.push(await sampleWhile('cmd-ctrl-shift-r', async () => {
    win.Zotero_Tabs.select(reader.tabID);
    const consumed = trustedKey(win, { key: 'r', code: 'KeyR', keyCode: 82, metaKey: Zotero.isMac, ctrlKey: !Zotero.isMac, shiftKey: true });
    out.__consumedR = consumed;
  }));
  out.consumedCmdCtrlShiftR = out.__consumedR; delete out.__consumedR;
  await closeReading();

  // 3) Shift+Space (Zotero's own play/pause-from-here shortcut)
  win.Zotero_Tabs.select(reader.tabID);
  await sleep(150);
  out.entries.push(await sampleWhile('shift-space', async () => {
    const consumed = trustedKey(win, { key: ' ', code: 'Space', keyCode: 32, shiftKey: true });
    out.__consumedSpace = consumed;
  }));
  out.consumedShiftSpace = out.__consumedSpace; delete out.__consumedSpace;
  await closeReading();

  win.minimize();
  await sleep(150);

  // 4) "Read Aloud from Here" -- ir.startReadAloudAtPosition(sourcePosition), an explicit mid-document target
  await reader._internalReader._loadSDT();
  const ir = reader._internalReader;
  const view = ir._primaryView;
  const rw = view._iframeWindow;
  const segs = (ir._readAloudSegments && ir._readAloudSegments.segments) || [];
  const targetIndex = Math.min(3, segs.length - 1);
  const spanFor = (segment) => {
    const spans = ir._readAloudSegments.getSegmentTextSpans(segment) || [];
    for (const span of spans) if (span && span.node && Number.isInteger(span.start) && Number.isInteger(span.end) && span.end > span.start) return span;
    return null;
  };
  const span = targetIndex >= 0 ? spanFor(segs[targetIndex]) : null;
  const sourcePosition = span ? ir._sdt.mapper.textNodeSpansToSourcePosition(Components.utils.cloneInto([{ ref: JSON.parse(JSON.stringify(span.ref)), node: JSON.parse(JSON.stringify(span.node)), start: span.start, end: span.end }], rw)) : null;
  out.readAloudFromHereTarget = { targetIndex, gotSourcePosition: !!sourcePosition };
  out.entries.push(await sampleWhile('read-aloud-from-here', async () => {
    if (sourcePosition) ir.startReadAloudAtPosition(sourcePosition); else ir.startReadAloudAtPosition();
  }));
  await closeReading();

  // Leave the reading idle (not playing) for later scripts; item1 live check while the pref is still false.
  const pp = JSON.parse(await Zotero.ZoteroTTS.diagnostics.pluginPlayer());
  out.pluginPlayerAfter = { readersCount: pp.readers.length, resource: pp.resource };
  out.usePluginPlayerStillFalse = Zotero.Prefs.get('zotero-tts.readAloud.usePluginPlayer') === false;

  return JSON.stringify(out, null, 1);
})()
