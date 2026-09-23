// Item 4, bullet 3 (EPUB, paginated, Top bar): a sentence at a page's top
// turns no page -- last does not change and no navigation is recorded.
// Paginated gets no inset at all (item 4 bullet 1: covered stays {0,0}
// regardless of layout), so nothing the bar covers can ever look clipped;
// this exercises that a state push in this layout is a genuine no-op.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const wait = async (test, ms = 7000) => { const end = Date.now() + ms; while (Date.now() < end) { const v = test(); if (v) return v; await sleep(60); } return test(); };
  const state = Zotero.ZoteroTTSRun.state;
  const host = Zotero.getMainWindow();
  const layoutPref = 'extensions.zotero.zotero-tts.readAloud.playerLayout';

  const itemID = state.fixtures.epub.itemID;
  const readers = Zotero.Reader._readers || [];
  const idx = readers.findIndex((r) => r.itemID === itemID);
  const reader = readers[idx];
  host.Zotero_Tabs.select(reader.tabID);
  await sleep(150);
  const ir = reader._internalReader;
  const view = ir._primaryView;
  const m = ir._readAloudManager;
  const diagFor = async () => { const d = JSON.parse(await Zotero.ZoteroTTS.diagnostics.autoScroll()); return d[idx]; };
  const setLayout = async (layout) => { Zotero.ZoteroTTS.pluginPlayer.setLayout(layout); await wait(() => Services.prefs.getStringPref(layoutPref, '') === layout ? true : null, 5000); await sleep(150); };
  const pageState = () => ({ section: view.flow?._currentSectionIndex ?? null, offsetLeft: view.flow?._offsetLeft ?? null, pageIndex: view.pageIndex ?? null });

  await setLayout('top');
  await view.setFlowMode('paginated');
  await sleep(700);
  if (!m.paused) { try { m.pause(); } catch (e) {} await sleep(200); }
  // Position 12 sits at the top of its own section per the earlier scrolled-flow
  // measurement (its box's top is a section/page boundary in this fixture).
  try { m.repositionTo(12); } catch (e) {}
  await sleep(1200);

  const before = await diagFor();
  const pageBefore = pageState();
  m._stateChanged();
  await sleep(700);
  const after = await diagFor();
  const pageAfter = pageState();

  await setLayout('top');
  try { m.pause(); } catch (e) {}
  await wait(() => m.paused, 2000);
  await view.setFlowMode('scrolled'); // restore the flow item 4's other bullets left it in
  await sleep(400);

  const checks = {
    coveredZeroBefore: before?.covered?.top === 0 && before?.covered?.bottom === 0,
    coveredZeroAfter: after?.covered?.top === 0 && after?.covered?.bottom === 0,
    lastUnchanged: before?.last?.at === after?.last?.at,
    noPageNavigation: pageBefore.section === pageAfter.section && pageBefore.offsetLeft === pageAfter.offsetLeft && pageBefore.pageIndex === pageAfter.pageIndex,
  };

  return JSON.stringify({ pageBefore, pageAfter, before: { covered: before?.covered, last: before?.last, flow: before?.flow }, after: { covered: after?.covered, last: after?.last, flow: after?.flow }, checks }, null, 1);
})();
