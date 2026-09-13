return (async () => {
  const root = Zotero.__ztts100, reader = root?.epub?.reader;
  if (!reader) throw new Error('EPUB reader is missing');
  const internal = reader._internalReader, manager = internal?._readAloudManager, view = internal?._primaryView, rw = view?.iframeWindow;
  if (!manager || !view || !rw) throw new Error('EPUB view is not ready');
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  Zotero_Tabs.select(reader.tabID); reader.focus?.(); rw.focus?.();
  let flowError = null;
  try { await view.setFlowMode('paginated'); } catch (e) { flowError = String(e); }
  await sleep(800);
  try { manager.repositionTo(50); } catch (e) {}
  await sleep(650);
  try { if (manager.active && !manager.paused) manager.pause(); } catch (e) {}
  const helper = Components.utils.waiveXrays(view._readAloud), state = Components.utils.waiveXrays(helper.state), selector = helper._resolveSegmentSelector(state), range = selector ? view.toDisplayedRange(selector) : null, rects = [], list = range?.getClientRects?.();
  for (let i = 0; list && i < list.length; i++) { const b = list[i]; rects.push({ index: i, screen: [b.left, b.top, b.right, b.bottom], visible: b.right > 0 && b.bottom > 0 && b.left < rw.innerWidth && b.top < rw.innerHeight }); }
  const all = JSON.parse(Zotero.ZoteroTTS.diagnostics.autoScroll()), index = (Zotero.Reader._readers ?? []).indexOf(reader), diag = all[index] ?? null;
  return JSON.stringify({ fixture: 'epub', flowError, flow: view.flowMode, offset: view.flow?._offsetLeft ?? null, section: view.flow?._currentSectionIndex ?? null, active: !!manager.active, paused: !!manager.paused, position: manager?._controller?._position ?? null, segmentText: String(manager.activeSegment?.text ?? '').slice(0, 160), scroll: { x: rw.scrollX, y: rw.scrollY, width: rw.innerWidth, height: rw.innerHeight, scrollWidth: rw.document.documentElement.scrollWidth, scrollHeight: rw.document.documentElement.scrollHeight }, rects, diagnostic: diag, hooks: { positionLocked: helper.positionLocked, scrolling: helper.scrolling } });
})()
