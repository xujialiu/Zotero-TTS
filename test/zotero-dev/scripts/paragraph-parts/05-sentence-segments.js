// Item 2: the reported sentence, in Zotero's own segment list
// (_readAloudSegments.segments, before the plugin's remote interface sees a
// segment), with two neighbors either side — index, text, anchor and
// sourcePosition (page index and rects). One hit holding both halves is the fix;
// two hits, the second anchored `paragraphStart`, is the bug.
// params: needles[] (the strings to look for).
(async () => {
  const out = { step: 'sentence-segments' };
  const P = Zotero.ZoteroTTSRun.params;
  const S = Zotero.ZoteroTTSRun.state;
  try {
    const itemID = S.current && S.current.itemID;
    if (!itemID) throw new Error('state.current.itemID is missing — run 03 first');
    const rs = Zotero.Reader._readers || [];
    let r = null;
    for (let i = 0; i < rs.length; i++) if (rs[i].itemID === itemID) r = rs[i];
    if (!r) throw new Error('no open reader for item ' + itemID);
    const segs = r._internalReader._readAloudSegments.segments;
    const needles = P.needles || [];
    out.itemID = itemID;
    out.total = segs.length;
    out.needles = needles;
    const hits = [];
    for (let i = 0; i < segs.length; i++) {
      const t = segs[i].text;
      if (typeof t !== 'string') continue;
      for (let n = 0; n < needles.length; n++) if (t.indexOf(needles[n]) >= 0) { hits.push(i); break; }
    }
    out.hits = hits;
    out.hitCount = hits.length;
    const wanted = [];
    for (let h = 0; h < hits.length; h++) for (let d = -2; d <= 2; d++) { const i = hits[h] + d; if (i >= 0 && i < segs.length && wanted.indexOf(i) < 0) wanted.push(i); }
    wanted.sort((a, b) => a - b);
    out.dump = [];
    for (let k = 0; k < wanted.length; k++) {
      const i = wanted[k];
      const s = segs[i];
      const sp = s.sourcePosition;
      out.dump.push({
        i,
        hit: hits.indexOf(i) >= 0,
        text: s.text,
        len: s.text ? s.text.length : null,
        anchor: s.anchor === undefined ? undefined : (s.anchor ? JSON.parse(JSON.stringify(s.anchor)) : s.anchor),
        pageIndex: sp ? sp.pageIndex : null,
        rects: sp && sp.rects ? JSON.parse(JSON.stringify(sp.rects)) : null,
      });
    }
    // every needle in one segment?
    out.needlesTogether = null;
    for (let h = 0; h < hits.length; h++) {
      const t = segs[hits[h]].text;
      let all = true;
      for (let n = 0; n < needles.length; n++) if (t.indexOf(needles[n]) < 0) all = false;
      if (all) out.needlesTogether = hits[h];
    }
  } catch (e) { out.error = String(e); throw e; }
  return JSON.stringify(out);
})()
