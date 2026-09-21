/**
 * Item 8, live: the tab of an EPUB that holds a pre-build `positions` row is
 * opened — the `renderToolbar` hook index.ts:768 derives from — and
 * `shared.documents.items` must rise by one within a few seconds, with no
 * error from `deriveSharedFromNative`. Each tab is closed again, which is
 * also the sync poke item 8's second half needs; nothing is played, so the
 * sampler's `wasActive` guard keeps the owner's row untouched.
 * params.derive: the itemIDs to open, in order. Leaves state.derived.
 */
(async () => {
  const p = Zotero.ZoteroTTSRun.params;
  const out = { opened: [] };
  const stats = () => JSON.parse(Zotero.ZoteroTTS.diagnostics.positionSync()).shared.documents;
  const lines = async () =>
    String(await Zotero.Debug.get())
      .split('\n')
      .filter((l) => l.indexOf('[zotero-tts]') !== -1)
      .map((l) => l.slice(l.indexOf('[zotero-tts]')));
  const errorsNow = () => Zotero.getErrors(true).length;

  out.before = stats();
  const mark = (await lines()).length;
  const errMark = errorsNow();
  const win = Zotero.getMainWindow();
  out.selectedBefore = win.Zotero_Tabs.selectedID;
  const tabs = [];

  for (const itemID of p.derive) {
    const step = { itemID };
    const item = Zotero.Items.get(itemID);
    step.title = item ? String(item.getDisplayTitle()).slice(0, 36) : null;
    const itemsBefore = stats().items;
    step.itemsBefore = itemsBefore;
    const t0 = Date.now();
    const reader = await Zotero.Reader.open(itemID);
    step.tabID = reader ? reader.tabID : null;
    if (step.tabID) tabs.push(step.tabID);
    while (Date.now() - t0 < 24000) {
      if (reader && reader._internalReader && reader._internalReader._readAloudManager) break;
      await new Promise((r) => setTimeout(r, 700));
    }
    step.readyMs = Date.now() - t0;
    // The derive is fired and forgotten by attachReader: poll its effect
    const t1 = Date.now();
    while (Date.now() - t1 < 30000) {
      if (stats().items > itemsBefore) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    step.derivedMs = Date.now() - t1;
    step.itemsAfter = stats().items;
    step.rose = step.itemsAfter - itemsBefore;
    out.opened.push(step);
  }

  out.afterOpens = stats();
  const seen = (await lines()).slice(mark);
  out.derivedLines = seen.filter((l) => l.indexOf('document id for') !== -1 || l.indexOf('sourceToSDTPosition') !== -1 || l.indexOf('derive') !== -1);
  out.errorLines = seen.filter((l) => l.toLowerCase().indexOf('error') !== -1 || l.indexOf('not reachable') !== -1);
  out.newConsoleErrors = Zotero.getErrors(true)
    .slice(errMark)
    .filter((e) => String(e).indexOf('zotero-tts') !== -1 || String(e).indexOf('sourceToSDT') !== -1)
    .map((e) => String(e).slice(0, 200));

  // Closing each tab restores the owner's tab set and pokes both transports
  for (const tabID of tabs) {
    if (win.Zotero_Tabs._tabs.some((t) => t.id === tabID)) {
      win.Zotero_Tabs.close(tabID);
      await new Promise((r) => setTimeout(r, 2500));
    }
  }
  win.Zotero_Tabs.select(out.selectedBefore);
  out.tabsLeft = win.Zotero_Tabs._tabs.map((t) => t.id);
  // Let the sync that the closes poked finish
  const t2 = Date.now();
  while (Date.now() - t2 < 25000) {
    const t = JSON.parse(Zotero.ZoteroTTS.diagnostics.positionSync()).shared.transport;
    if (!t.running && t.lastAt && t.uploaded !== null) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  const ps = JSON.parse(Zotero.ZoteroTTS.diagnostics.positionSync());
  out.transport = ps.shared.transport;
  out.documents = ps.shared.documents;
  out.syncLines = (await lines()).filter((l) => l.indexOf('shared position sync') !== -1).slice(-3);
  Zotero.ZoteroTTSRun.state.derived = out.opened;
  return JSON.stringify(out);
})()
