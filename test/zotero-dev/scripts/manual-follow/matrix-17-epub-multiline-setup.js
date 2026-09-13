return (async () => {
  const root = Zotero.__ztts100;
  const reader = root.epub.reader;
  const internal = reader._internalReader;
  const manager = internal._readAloudManager;
  const view = internal._primaryView;
  const rw = view.iframeWindow;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  Zotero_Tabs.select(reader.tabID);
  reader.focus();
  rw.focus();
  let flowError = null;
  try { await view.setFlowMode('scrolled'); } catch (e) { flowError = String(e); }
  await sleep(800);
  try { manager.repositionTo(2); } catch (e) {}
  await sleep(500);
  try { if (manager.active && !manager.paused) manager.pause(); } catch (e) {}
  const helper = Components.utils.waiveXrays(view._readAloud);
  const state = Components.utils.waiveXrays(helper.state);
  const selector = helper._resolveSegmentSelector(state);
  const range = selector ? view.toDisplayedRange(selector) : null;
  const rects = [];
  const list = range ? range.getClientRects() : null;
  for (let i = 0; list && i < list.length; i++) { const b = list[i]; rects.push({ index: i, screen: [b.left, b.top, b.right, b.bottom], document: [b.left + rw.scrollX, b.top + rw.scrollY, b.right + rw.scrollX, b.bottom + rw.scrollY] }); }
  const all = JSON.parse(Zotero.ZoteroTTS.diagnostics.autoScroll());
  const index = (Zotero.Reader._readers || []).indexOf(reader);
  const diag = all[index] || null;
  return JSON.stringify({ fixture: 'epub', flowError, flow: view.flowMode, active: !!manager.active, paused: !!manager.paused, position: manager._controller ? manager._controller._position : null, scroll: { x: rw.scrollX, y: rw.scrollY, innerWidth: rw.innerWidth, innerHeight: rw.innerHeight, scrollWidth: rw.document.documentElement.scrollWidth, scrollHeight: rw.document.documentElement.scrollHeight }, segmentText: String(manager.activeSegment ? manager.activeSegment.text : '').slice(0, 180), rects, selector: selector ? { type: selector.type || null, value: String(selector.value || '').slice(0, 180) } : null, diagnostic: diag, hooks: { positionLocked: helper.positionLocked, scrolling: helper.scrolling } });
})()
