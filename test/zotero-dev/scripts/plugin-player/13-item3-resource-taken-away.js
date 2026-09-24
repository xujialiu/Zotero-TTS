// Item 3: with the Player's own resource substitution removed, a NEW
// fixture tab's Player never connects -- failed: "frame" after 5s, one
// "player did not finish loading" error, the toolbar button shows the
// toast and starts nothing, Shift+Space closes the reading within 250ms
// with the same toast (once), and Zotero's own popup is never displayed.
// Leaves the substitution broken on purpose -- item 4's reinstall (run
// right after this) registers a fresh one.
// params: root, fixturesDir, runId. state: reads windowBaseline, writes fixtures.failed, resourceHost.
(async () => {
  const p = Zotero.ZoteroTTSRun.params || {};
  const state = Zotero.ZoteroTTSRun.state;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const join = (a, b) => String(a).replace(/[\\/]$/, '') + (Zotero.isWin ? '\\' : '/') + String(b).split('/').join(Zotero.isWin ? '\\' : '/');
  const dir = p.fixturesDir || join(p.root || '', 'test/fixtures');
  const out = { step: 'item3-resource-taken-away' };

  const win = Zotero.getMainWindow();
  win.minimize();
  await sleep(150);

  const before = JSON.parse(await Zotero.ZoteroTTS.diagnostics.pluginPlayer());
  const host = new URL(before.resource).host;
  out.resourceHost = host;
  state.resourceHost = host;
  const handler = Services.io.getProtocolHandler('resource').QueryInterface(Components.interfaces.nsISubstitutingProtocolHandler);

  handler.setSubstitution(host, null);
  out.substitutionRemoved = true;
  try { handler.resolveURI(Services.io.newURI(before.resource)); out.hostStillResolves = true; } catch (e) { out.hostStillResolves = false; out.resolveError = String(e).slice(0, 120); }

  const run = String(p.runId || Date.now()).replace(/[^A-Za-z0-9_-]/g, '_');
  const imported = await Zotero.Attachments.importFromFile({ file: join(dir, 'fixture-b.pdf'), libraryID: Zotero.Libraries.userLibraryID, title: 'Zotero-TTS 134 failed-player PDF ' + run });
  const item = typeof imported === 'number' ? Zotero.Items.get(imported) : imported;
  const fixture = { id: item?.id ?? null, key: item?.key ?? null };
  state.fixtures = state.fixtures || {};
  state.fixtures.failed = fixture;
  out.fixture = fixture;

  const waitReader = async (id) => {
    for (let i = 0; i < 120; i++) {
      for (const r of (Zotero.Reader?._readers ?? [])) if (r?.itemID === id) return r;
      await sleep(100);
    }
    return null;
  };
  const opened = Zotero.Reader.open(fixture.id);
  if (opened && typeof opened.then === 'function') await opened;
  const reader = await waitReader(fixture.id);
  if (!reader) throw new Error('failed-player fixture never produced a reader');
  out.readerFound = { itemID: reader.itemID, tabID: reader.tabID };

  const t0 = Date.now();
  // Every OTHER open reader's frame already connected before the substitution broke; only
  // this fresh one can end up failed:"frame", so it is found by being the one such entry.
  let pluginPlayerFailedEntry = null;
  while (Date.now() - t0 < 6500 && !pluginPlayerFailedEntry) {
    const pp = JSON.parse(await Zotero.ZoteroTTS.diagnostics.pluginPlayer());
    pluginPlayerFailedEntry = (pp.readers || []).find((r) => r.failed === 'frame') || null;
    if (!pluginPlayerFailedEntry) await sleep(200);
  }
  out.pluginPlayerFailedEntry = pluginPlayerFailedEntry;

  const errorsHave = async (needle) => String(await Zotero.Debug.get()).split('\n').some((l) => l.includes(needle));
  let failedFrame = false, sawLoadError = false;
  for (let i = 0; i < 60; i++) {
    const doc = reader._iframeWindow?.document;
    const frameEl = doc?.getElementById('ztts-player-frame');
    // A failed reader's frame never gets a `.player` node inside it.
    const ready = !!frameEl?.contentDocument?.querySelector?.('.player');
    if (!ready && Date.now() - t0 > 5100) { failedFrame = true; break; }
    if (ready) break;
    await sleep(100);
  }
  await sleep(300);
  sawLoadError = await errorsHave('player did not finish loading');
  out.after5s = { failedFrame, sawLoadError, elapsedMs: Date.now() - t0 };

  // The plugin's own button: toast, nothing reads.
  const doc = () => reader._iframeWindow.document;
  const btn = doc().getElementById('ztts-player-toggle');
  out.buttonFound = !!btn;
  const readToast = () => {
    for (const d of [reader._iframeWindow?.document, win.document]) {
      try { const el = d && d.getElementById('ztts-speed-toast'); const text = el ? String(el.textContent || '').trim() : ''; if (text) return text; } catch (e) {}
    }
    return null;
  };
  btn?.click();
  await sleep(300);
  out.toastAfterButton = readToast();
  out.activeAfterButton = !!reader._internalReader?._readAloudManager?.active;
  out.zoteroPopupDisplayAfterButton = (() => { const el = doc().querySelector('.read-aloud-popup'); return el ? doc().defaultView.getComputedStyle(el).display : 'ABSENT'; })();

  // Shift+Space: opens a reading (Zotero's own path, unaware the Player failed), which the tick() refuses within 250ms.
  win.restore();
  win.Zotero_Tabs.select(reader.tabID);
  reader._iframeWindow?.focus?.();
  win.focus();
  await sleep(300);
  const tip = Components.classes['@mozilla.org/text-input-processor;1'].createInstance(Components.interfaces.nsITextInputProcessor);
  tip.beginInputTransactionForTests(win);
  const flags = { shiftKey: true };
  tip.keydown(new win.KeyboardEvent('', { key: 'Shift', code: 'ShiftLeft', keyCode: 16, ...flags, bubbles: true, cancelable: true }));
  const consumed = tip.keydown(new win.KeyboardEvent('', { key: ' ', code: 'Space', keyCode: 32, ...flags, bubbles: true, cancelable: true }));
  tip.keyup(new win.KeyboardEvent('', { key: ' ', code: 'Space', keyCode: 32, ...flags, bubbles: true, cancelable: true }));
  tip.keyup(new win.KeyboardEvent('', { key: 'Shift', code: 'ShiftLeft', keyCode: 16, bubbles: true, cancelable: true }));
  tip.endInputTransaction?.();
  out.shiftSpaceConsumed = consumed;

  const trace = [];
  const t1 = Date.now();
  while (Date.now() - t1 < 1200) {
    const m = reader._internalReader?._readAloudManager;
    trace.push({ t: Date.now() - t1, popupOpen: !!m?.popupOpen, active: !!m?.active });
    await sleep(50);
  }
  const firstOpenIdx = trace.findIndex((s) => s.popupOpen || s.active);
  let closedWithin250ms = null;
  if (firstOpenIdx >= 0) {
    const openedAtT = trace[firstOpenIdx].t;
    const closedAgain = trace.slice(firstOpenIdx + 1).find((s) => !s.popupOpen && !s.active);
    closedWithin250ms = !!closedAgain && (closedAgain.t - openedAtT) <= 300;
    out.shiftSpaceOpenedAtT = openedAtT;
    out.shiftSpaceClosedAtT = closedAgain ? closedAgain.t : null;
  }
  out.shiftSpaceTrace = { firstOpenIdx, count: trace.length, first: trace[0], last: trace[trace.length - 1], closedWithin250ms };
  out.toastAfterShiftSpace = readToast();
  out.zoteroPopupDisplayAfterShiftSpace = (() => { const el = doc().querySelector('.read-aloud-popup'); return el ? doc().defaultView.getComputedStyle(el).display : 'ABSENT'; })();

  win.minimize();
  return JSON.stringify(out, null, 1);
})()
