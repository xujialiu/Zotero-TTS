// A fresh standalone copy of one of the owner's PDFs, opened in a new tab with
// the player opened muted and paused in this one script.
//
// Why a copy: the switch is read when a document's structure loads, and Zotero
// caches a structure per reader, so the owner's own tabs — loaded before the
// build — would answer for the old code whatever is installed now. The copy is
// a new item, so its structure pack is generated on first use; opening the
// player is what makes Zotero call _loadSDT, and the plugin's walk runs when
// that resolves. Read skippedLines() only after this script.
//
// The copy this run opened last is closed and erased first: Zotero keeps only
// MAX_LOADED_TABS = 5 reader tabs loaded (tabs.js unloadUnusedTabs, by
// timeUnselected) and unloads the rest, so a run that piles up copies unloads
// the owner's own tabs and with them their open players — which happened on
// 2026-09-14 before this was added. params.keepCopies true keeps them all.
//
// params: attachmentKey (the source attachment's key), titlePrefix, keepCopies.
// state: copies[] (every copy this run made, for the cleanup) and current.
(async () => {
  const out = { step: 'open-fresh-copy' };
  const P = Zotero.ZoteroTTSRun.params;
  const S = Zotero.ZoteroTTSRun.state;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  try {
    if (S.current && S.current.itemID && !P.keepCopies) {
      out.previousCopy = { itemID: S.current.itemID, closed: false, erased: false };
      try {
        const rs = Zotero.Reader._readers || [];
        for (let i = 0; i < rs.length; i++) {
          if (rs[i].itemID !== S.current.itemID) continue;
          const w = Zotero.getMainWindow();
          if (w && w.Zotero_Tabs && rs[i].tabID) w.Zotero_Tabs.close(rs[i].tabID);
          out.previousCopy.closed = true;
          await sleep(400);
        }
        const old = Zotero.Items.get(S.current.itemID);
        if (old) { await old.eraseTx(); out.previousCopy.erased = true; }
      } catch (e) { out.previousCopy.error = String(e); }
    }
    const key = P.attachmentKey;
    if (!key) throw new Error('params.attachmentKey is required');
    out.sourceKey = key;
    const src = await Zotero.Items.getByLibraryAndKeyAsync(Zotero.Libraries.userLibraryID, key);
    if (!src) throw new Error('no item with key ' + key + ' in the user library');
    const file = await src.getFilePathAsync();
    if (!file) throw new Error('no file for ' + key);
    out.fileFound = true;
    const title = (P.titlePrefix || 'ztts copy') + ' ' + key + ' ' + new Date().toISOString().slice(11, 19).replace(/:/g, '');
    const item = await Zotero.Attachments.importFromFile({ file, title, libraryID: Zotero.Libraries.userLibraryID });
    out.itemID = item.id;
    out.itemKey = item.key;
    out.title = item.getField('title');
    if (out.title !== title) { try { item.setField('title', title); await item.saveTx(); out.title = item.getField('title'); } catch (e) { out.titleError = String(e); } }
    S.copies = S.copies || [];
    S.copies.push({ key, itemID: item.id, itemKey: item.key, title: out.title });
    S.current = { key, itemID: item.id, title: out.title };

    await Zotero.Reader.open(item.id);
    // ≤7 s polls, a ~30 s ceiling: an in-place install followed at once by a
    // Reader.open froze Zotero once (2026-08-31), so nothing is driven before both exist
    let r = null;
    const t0 = Date.now();
    while (Date.now() - t0 < 60000) {
      r = null;
      const rs = Zotero.Reader._readers || [];
      for (let i = 0; i < rs.length; i++) if (rs[i].itemID === item.id) r = rs[i];
      if (r && r._internalReader && r._internalReader._readAloudManager) break;
      await sleep(300);
    }
    if (!r || !r._internalReader || !r._internalReader._readAloudManager) throw new Error('reader or read-aloud manager never appeared for item ' + item.id);
    out.readerReadyMs = Date.now() - t0;
    out.tabID = r.tabID;
    const rs = Zotero.Reader._readers;
    for (let i = 0; i < rs.length; i++) if (rs[i].itemID === item.id) out.readerIndex = i;
    S.current.readerIndex = out.readerIndex;
    S.current.tabID = r.tabID;

    const ir = r._internalReader;
    const m = ir._readAloudManager;
    out.before = { active: m.active, paused: m.paused, voice: m.selectedVoiceID ? String(m.selectedVoiceID) : null };
    // toggleReadAloudPopup(true) starts playback at once on a document whose
    // memory names a listed voice: pause in the same script, as tightly as
    // the round trip allows, and keep pausing while it re-enters play
    await ir.toggleReadAloudPopup(true);
    // the structure pack of a fresh copy is generated on first use: the wait is
    // for the document worker, not for the round trip, so it is minutes wide
    out.pauses = [];
    const t1 = Date.now();
    while (Date.now() - t1 < 180000) {
      if (m.active && !m.paused) { try { m.pause(); out.pauses.push(Date.now() - t1); } catch (e) { out.pauseError = String(e); } }
      const segs = ir._readAloudSegments ? ir._readAloudSegments.segments : null;
      if (m.active && m.paused && segs && segs.length) break;
      await sleep(50);
    }
    out.playerReadyMs = Date.now() - t1;
    out.after = { active: m.active, paused: m.paused, voice: m.selectedVoiceID ? String(m.selectedVoiceID) : null };
    out.segments = ir._readAloudSegments ? ir._readAloudSegments.segments.length : null;
    out.structureBlocks = ir._sdt && ir._sdt.structure ? ir._sdt.structure.content.length : null;
    S.current.segments = out.segments;
  } catch (e) { out.error = String(e); out.stack = e && e.stack ? String(e.stack).split('\n').slice(0, 4).join(' | ') : null; throw e; }
  return JSON.stringify(out);
})()
