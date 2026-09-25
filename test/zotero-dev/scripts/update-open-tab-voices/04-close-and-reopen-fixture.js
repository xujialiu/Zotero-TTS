// Item 4 (a plain update from 1.14.3, no manual leftover): closes the
// CURRENT fixture reader (reader.close(), the same library item -- never
// re-imported) and, when params.reopen is true, opens a fresh tab for
// that same item and its player (opened + paused in the same script, as
// section 3 of the workflow requires). Run with reopen:false right after
// closing (before installing 1.14.3), then again with reopen:true after
// 1.14.3 is installed. Updates state.fixture.tabID on reopen; the item id
// itself never changes.
// params: reopen (boolean). state: reads/writes fixture.
(async () => {
  const p = Zotero.ZoteroTTSRun.params || {};
  const S = Zotero.ZoteroTTSRun.state;
  const out = { step: 'close-and-reopen-fixture', reopen: !!p.reopen };
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const waitFor = async (test, ms = 7000, step = 100) => {
    const end = Date.now() + ms;
    while (Date.now() < end) { const v = test(); if (v) return v; await sleep(step); }
    return test();
  };
  try {
    const list = Zotero.Reader._readers || [];
    let reader = null;
    for (let i = 0; i < list.length; i++) if (list[i]?.itemID === S.fixture.id) reader = list[i];
    if (reader) {
      const pending = reader.close();
      if (pending && typeof pending.then === 'function') await pending;
      out.closed = true;
    } else out.closed = 'already closed';
    out.readersAfterClose = (Zotero.Reader._readers || []).length;

    if (out.reopen) {
      if (S.baseline.memory && S.baseline.memory.value) {
        const id = JSON.parse(S.baseline.memory.value).voice.id;
        out.memoryIsListed = String(id).includes('::');
        if (!out.memoryIsListed) throw new Error('readAloud.memory no longer names a listed (::) voice -- refusing to open');
      }
      const opened = Zotero.Reader.open(S.fixture.id);
      if (opened && typeof opened.then === 'function') await opened;
      let newReader = null;
      for (let round = 0; round < 4 && !newReader; round++) {
        newReader = await waitFor(() => {
          const l = Zotero.Reader._readers || [];
          for (let i = 0; i < l.length; i++) { const r = l[i]; if (r?.itemID === S.fixture.id && r._internalReader?._readAloudManager) return r; }
          return null;
        }, 7000);
      }
      if (!newReader) throw new Error('reopened fixture reader did not expose _internalReader/_readAloudManager within the ceiling');
      const win = Zotero.getMainWindow();
      if (win && win.Zotero_Tabs && newReader.tabID && win.Zotero_Tabs.selectedID !== newReader.tabID) win.Zotero_Tabs.select(newReader.tabID);

      const m = () => newReader._internalReader?._readAloudManager;
      newReader._internalReader.toggleReadAloudPopup(true);
      await waitFor(() => !!m()?.active);
      newReader._internalReader.toggleReadAloudPaused();
      await waitFor(() => m()?.paused === true);
      await sleep(200);
      out.afterOpen = { active: !!m()?.active, paused: m() ? !!m().paused : null, popupOpen: !!newReader._internalReader?._state?.readAloudState?.popupOpen, selectedVoiceID: m()?.selectedVoiceID ?? null };
      out.selectedVoiceIsListed = String(out.afterOpen.selectedVoiceID || '').includes('::');
      S.fixture.tabID = newReader.tabID || null;
    }
  } catch (e) {
    out.error = String(e);
    out.stack = e && e.stack ? String(e.stack).split('\n').slice(0, 4).join(' | ') : null;
  }
  if (out.error) throw new Error(out.error);
  return JSON.stringify(out, null, 1);
})();
