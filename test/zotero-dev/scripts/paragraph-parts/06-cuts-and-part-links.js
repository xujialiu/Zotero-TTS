// Item 3: every place a sentence is still cut in two — a segment that ends
// without sentence-final punctuation while the next one starts lowercase — with
// how many of those are chain boundaries (anchor `paragraphStart`), plus the
// structure's part links and the count of `paragraphStart` segments, which is
// what tells a join of two halves from a join that swallowed a real paragraph.
// The full cut list goes to the run's results file; the capped result carries
// the counts and the first cuts.
(async () => {
  const out = { step: 'cuts-and-part-links' };
  const S = Zotero.ZoteroTTSRun.state;
  try {
    const itemID = S.current && S.current.itemID;
    if (!itemID) throw new Error('state.current.itemID is missing — run 03 first');
    const rs = Zotero.Reader._readers || [];
    let r = null;
    for (let i = 0; i < rs.length; i++) if (rs[i].itemID === itemID) r = rs[i];
    if (!r) throw new Error('no open reader for item ' + itemID);
    const ir = r._internalReader;
    out.itemID = itemID;
    out.title = S.current.title || null;
    out.sourceKey = S.current.key || null;

    const top = ir._sdt.structure.content;
    out.blocks = top.length;
    out.byType = {};
    out.byFlow = {};
    out.withNextPart = 0;
    out.withPrevPart = 0;
    out.partLinks = [];
    for (let i = 0; i < top.length; i++) {
      const b = top[i];
      out.byType[b.type] = (out.byType[b.type] || 0) + 1;
      const f = b.flowClass || '(none)';
      out.byFlow[f] = (out.byFlow[f] || 0) + 1;
      if (b.nextPart !== undefined && b.nextPart !== null) {
        out.withNextPart++;
        if (out.partLinks.length < 40) out.partLinks.push({ i, nextPart: JSON.parse(JSON.stringify(b.nextPart)) });
      }
      if (b.previousPart !== undefined && b.previousPart !== null) out.withPrevPart++;
    }

    const segs = ir._readAloudSegments.segments;
    const endsSentence = t => /[.!?]["'’”)\]]?\s*$/.test(t);
    const startsLower = t => /^\s*[a-zà-ÿ]/.test(t);
    const cuts = [];
    let paragraphStarts = 0;
    for (let i = 0; i < segs.length; i++) {
      if (segs[i].anchor === 'paragraphStart') paragraphStarts++;
      if (i + 1 >= segs.length) continue;
      const a = segs[i].text, b = segs[i + 1].text;
      if (typeof a !== 'string' || typeof b !== 'string') continue;
      if (!endsSentence(a) && startsLower(b)) {
        cuts.push({
          i,
          anchorNext: segs[i + 1].anchor || null,
          pageA: segs[i].sourcePosition ? segs[i].sourcePosition.pageIndex : null,
          pageB: segs[i + 1].sourcePosition ? segs[i + 1].sourcePosition.pageIndex : null,
          a: a.slice(-60),
          b: b.slice(0, 60),
        });
      }
    }
    out.totalSegments = segs.length;
    out.paragraphStartSegments = paragraphStarts;
    out.cutCount = cuts.length;
    let boundaries = 0;
    for (let i = 0; i < cuts.length; i++) if (cuts[i].anchorNext === 'paragraphStart') boundaries++;
    out.cutsWithParagraphStart = boundaries;
    out.cutIndexes = cuts.map(c => c.i);
    out.cutPages = cuts.map(c => c.pageA + '→' + c.pageB);
    out.cuts = cuts;
  } catch (e) { out.error = String(e); throw e; }
  return JSON.stringify(out);
})()
