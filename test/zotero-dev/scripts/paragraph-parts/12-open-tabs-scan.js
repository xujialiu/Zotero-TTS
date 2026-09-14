// The same scan as 06 over readers that are already open, named by attachment
// key: read-only, nothing is opened, clicked or paused. Its use here is the
// "before" state — the owner's own tabs loaded their structures under the build
// that was installed before this run, so the join never ran on them.
// params: scanKeys[] (attachment keys among the open tabs).
(async () => {
  const out = { step: 'open-tabs-scan', readers: [] };
  const P = Zotero.ZoteroTTSRun.params;
  try {
    const keys = P.scanKeys || [];
    const rs = Zotero.Reader._readers || [];
    const endsSentence = t => /[.!?]["'’”)\]]?\s*$/.test(t);
    const startsLower = t => /^\s*[a-zà-ÿ]/.test(t);
    for (let i = 0; i < rs.length; i++) {
      const r = rs[i];
      let key = null;
      try { key = Zotero.Items.get(r.itemID).key; } catch (e) { key = null; }
      if (keys.length && keys.indexOf(key) < 0) continue;
      const ir = r._internalReader;
      const row = { i, itemID: r.itemID, key, tabID: r.tabID };
      try {
        const top = ir._sdt && ir._sdt.structure ? ir._sdt.structure.content : null;
        row.blocks = top ? top.length : null;
        row.withNextPart = 0;
        if (top) for (let j = 0; j < top.length; j++) if (top[j].nextPart !== undefined && top[j].nextPart !== null) row.withNextPart++;
        const segs = ir._readAloudSegments ? ir._readAloudSegments.segments : null;
        row.segments = segs ? segs.length : null;
        if (segs) {
          let ps = 0; const cuts = [];
          for (let j = 0; j < segs.length; j++) {
            if (segs[j].anchor === 'paragraphStart') ps++;
            if (j + 1 >= segs.length) continue;
            const a = segs[j].text, b = segs[j + 1].text;
            if (typeof a !== 'string' || typeof b !== 'string') continue;
            if (!endsSentence(a) && startsLower(b)) cuts.push({ i: j, anchorNext: segs[j + 1].anchor || null, pageA: segs[j].sourcePosition ? segs[j].sourcePosition.pageIndex : null, pageB: segs[j + 1].sourcePosition ? segs[j + 1].sourcePosition.pageIndex : null, a: a.slice(-45), b: b.slice(0, 45) });
          }
          row.paragraphStartSegments = ps;
          row.cutCount = cuts.length;
          let bnd = 0; for (let j = 0; j < cuts.length; j++) if (cuts[j].anchorNext === 'paragraphStart') bnd++;
          row.cutsWithParagraphStart = bnd;
          row.cutIndexes = cuts.map(c => c.i);
          row.cutPages = cuts.map(c => c.pageA + '→' + c.pageB);
          row.cuts = cuts;
        }
      } catch (e) { row.error = String(e); }
      out.readers.push(row);
    }
    out.count = out.readers.length;
  } catch (e) { out.error = String(e); throw e; }
  return JSON.stringify(out);
})()
