// Item 1, second half, and the joins of item 2: what the plugin's _loadSDT
// shadow did to this copy's structure. diagnostics.skippedLines() answers for
// every reader in Zotero.Reader._readers order and names none of them, so the
// entry is picked out by the index of state.current.itemID.
(async () => {
  const out = { step: 'skipped-lines' };
  const S = Zotero.ZoteroTTSRun.state;
  try {
    const itemID = S.current && S.current.itemID;
    if (!itemID) throw new Error('state.current.itemID is missing — run 03 first');
    const rs = Zotero.Reader._readers || [];
    let idx = -1;
    for (let i = 0; i < rs.length; i++) if (rs[i].itemID === itemID) idx = i;
    if (idx < 0) throw new Error('no open reader for item ' + itemID);
    out.itemID = itemID;
    out.readerIndex = idx;
    const list = JSON.parse(await Zotero.ZoteroTTS.diagnostics.skippedLines());
    const e = list[idx];
    out.entry = e ? { patched: e.patched, enabled: e.enabled, joinEnabled: e.joinEnabled, loaded: e.loaded, excluded: e.excluded, at: e.at, restoredCount: (e.restored || []).length, joinedCount: (e.joined || []).length } : null;
    out.restored = e ? e.restored : null;
    out.joined = e ? e.joined : null;
    // the other readers, so a join on the owner's tabs (there should be none:
    // their structures were loaded before this build) is visible too
    out.others = [];
    for (let i = 0; i < list.length; i++) {
      if (i === idx) continue;
      const o = list[i];
      out.others.push({ i, itemID: rs[i] ? rs[i].itemID : null, patched: o && o.patched, joinEnabled: o && o.joinEnabled, loaded: o && o.loaded, restored: o ? (o.restored || []).length : null, joined: o ? (o.joined || []).length : null });
    }
  } catch (e) { out.error = String(e); throw e; }
  return JSON.stringify(out);
})()
