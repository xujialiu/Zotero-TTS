// Item 5.9 steps 1-2 (issue #143): open fixture A in a reader WINDOW, wait
// for its _internalReader, close it with reader._window.close() (the path
// that skips Zotero's own reader.close()), and confirm the dead entry
// stays listed. Then open fixture B as a TAB after it and select it so its
// pages render, so a live reader is listed after the gone one.
// params: root, fixturesDir, runId. state: writes fixtures.a/b, deadReader, tabReader.
(async () => {
  const p = Zotero.ZoteroTTSRun.params || {};
  const state = Zotero.ZoteroTTSRun.state;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const join = (a, b) => String(a).replace(/[\\/]$/, '') + (Zotero.isWin ? '\\' : '/') + String(b);
  const dir = p.fixturesDir || join(p.root || '', 'test/fixtures');
  const run = String(p.runId || Date.now()).replace(/[^A-Za-z0-9_-]/g, '_');
  const out = { step: 'window-and-tab' };

  const importOne = async (file, title) => {
    const imported = await Zotero.Attachments.importFromFile({ file: join(dir, file), libraryID: Zotero.Libraries.userLibraryID, title });
    const item = typeof imported === 'number' ? Zotero.Items.get(imported) : imported;
    return { id: item?.id ?? null, key: item?.key ?? null, title: item?.getField?.('title') || title };
  };

  const a = await importOne('fixture-a.pdf', 'Zotero-TTS 143 A ' + run);
  const b = await importOne('fixture-b.pdf', 'Zotero-TTS 143 B ' + run);
  state.fixtures = { a, b };
  out.fixtures = { a, b };

  const findReader = (itemID) => {
    const list = Zotero.Reader?._readers || [];
    for (let i = 0; i < list.length; i++) if (list[i]?.itemID === itemID) return { reader: list[i], index: i };
    return null;
  };
  const waitReader = async (itemID, ceilingMs = 20000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ceilingMs) {
      const found = findReader(itemID);
      if (found && found.reader._internalReader) return found;
      await sleep(100);
    }
    return null;
  };

  // 1. Fixture A in its own reader window.
  const openedWin = Zotero.Reader.open(a.id, null, { openInWindow: true });
  if (openedWin && typeof openedWin.then === 'function') await openedWin;
  const foundA = await waitReader(a.id);
  if (!foundA) throw new Error('fixture A window reader never exposed _internalReader');
  const readerA = foundA.reader;
  out.windowBeforeClose = {
    index: foundA.index,
    isWindow: readerA._window !== Zotero.getMainWindow(),
    windowClosed: !!readerA._window?.closed,
    internalReaderDead: Components.utils.isDeadWrapper(readerA._internalReader),
    iframeWindowDead: readerA._iframeWindow ? Components.utils.isDeadWrapper(readerA._iframeWindow) : null,
  };

  // The script path that skips Zotero's own reader.close() (issue #143).
  readerA._window.close();
  // Teardown of the dead wrappers can lag the synchronous close() by a tick.
  let deadSeen = false;
  for (let i = 0; i < 50; i++) {
    const stillThere = findReader(a.id);
    if (stillThere && stillThere.reader._window?.closed && Components.utils.isDeadWrapper(stillThere.reader._internalReader)) { deadSeen = true; break; }
    await sleep(100);
  }
  const afterA = findReader(a.id);
  out.windowAfterClose = {
    stillListed: !!afterA,
    index: afterA ? afterA.index : null,
    windowClosed: afterA ? !!afterA.reader._window?.closed : null,
    internalReaderDead: afterA ? Components.utils.isDeadWrapper(afterA.reader._internalReader) : null,
    iframeWindowDead: afterA && afterA.reader._iframeWindow ? Components.utils.isDeadWrapper(afterA.reader._iframeWindow) : (afterA ? 'null (already unreadable or absent)' : null),
    settledWithinPoll: deadSeen,
  };
  state.deadReader = { itemID: a.id, index: afterA ? afterA.index : foundA.index };

  // 2. Fixture B as a tab, opened and selected after the gone entry.
  const win = Zotero.getMainWindow();
  const openedTab = Zotero.Reader.open(b.id);
  if (openedTab && typeof openedTab.then === 'function') await openedTab;
  const foundB = await waitReader(b.id);
  if (!foundB) throw new Error('fixture B tab reader never exposed _internalReader');
  const readerB = foundB.reader;
  win.Zotero_Tabs.select(readerB.tabID);

  // Wait for its pages to render (pdf.js discards canvases in a background tab).
  // The PDF viewer lives in a NESTED iframe under the primary view, not the
  // reader-ui document reachable through reader._iframeWindow directly
  // (found live 2026-09-25: the outer document is toolbar/sidebar chrome).
  let pagesRendered = false;
  for (let i = 0; i < 100; i++) {
    try {
      const doc = readerB._internalReader._primaryView._iframeWindow.document;
      const canvases = [...doc.querySelectorAll('.page canvas')];
      if (canvases.length > 0 && canvases.every((c) => c.width > 0 && c.height > 0)) { pagesRendered = true; break; }
    } catch (e) { /* iframe not ready yet */ }
    await sleep(100);
  }
  state.tabReader = { itemID: b.id, tabID: readerB.tabID };
  out.tabReader = {
    index: findReader(b.id)?.index ?? null,
    listedAfterDeadEntry: (findReader(b.id)?.index ?? -1) > (state.deadReader.index ?? Infinity),
    selected: win.Zotero_Tabs.selectedID === readerB.tabID,
    pagesRendered,
  };

  return JSON.stringify(out, null, 1);
})()
