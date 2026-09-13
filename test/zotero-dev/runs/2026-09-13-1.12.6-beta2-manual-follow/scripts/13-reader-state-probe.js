return JSON.stringify((() => {
  const root = Zotero.__ztts100;
  const readers = Zotero.Reader._readers ?? [];
  const diag = JSON.parse(Zotero.ZoteroTTS.diagnostics.autoScroll());
  const rows = readers.map((reader, index) => {
    const manager = reader?._internalReader?._readAloudManager;
    const controller = manager?._controller;
    const view = reader?._internalReader?._primaryView;
    const slot = reader === root?.pdf?.reader ? 'pdf' : reader === root?.epub?.reader ? 'epub' : 'user';
    let scroll = null;
    try {
      const doc = view?._iframeWindow?.document;
      const container = doc?.getElementById('viewerContainer');
      scroll = container ? { scrollTop: container.scrollTop, scrollLeft: container.scrollLeft, clientWidth: container.clientWidth, clientHeight: container.clientHeight, scrollWidth: container.scrollWidth, scrollHeight: container.scrollHeight } : view?.iframeWindow ? { scrollTop: view.iframeWindow.scrollY, scrollLeft: view.iframeWindow.scrollX, clientWidth: view.iframeWindow.innerWidth, clientHeight: view.iframeWindow.innerHeight, scrollWidth: doc?.documentElement?.scrollWidth ?? null, scrollHeight: doc?.documentElement?.scrollHeight ?? null } : null;
    } catch (e) {}
    return { slot, itemID: reader?.itemID ?? null, index, active: !!manager?.active, paused: !!manager?.paused, position: controller?._position ?? null, currentIndex: controller?._currentIndex ?? null, flow: view?.flowMode ?? null, scroll, diag: diag[index] ?? null };
  });
  return rows;
})())
