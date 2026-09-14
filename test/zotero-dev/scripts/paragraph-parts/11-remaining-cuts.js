// Item 3's other half: for every cut left after the join, which of the sieve's
// four tests it failed. The segment pair is matched back to its top-level blocks
// by text (a segment carries no block index), and the four tests of
// findSplitParagraphs are re-run here on the live structure, so a row says
// "type", "already linked", "text" or "geometry" rather than "still cut".
// Reads the reader of state.current.
(async () => {
  const out = { step: 'remaining-cuts', cuts: [] };
  const S = Zotero.ZoteroTTSRun.state;
  try {
    const itemID = S.current && S.current.itemID;
    if (!itemID) throw new Error('state.current.itemID is missing — run 03 first');
    const rs = Zotero.Reader._readers || [];
    let r = null;
    for (let i = 0; i < rs.length; i++) if (rs[i].itemID === itemID) r = rs[i];
    if (!r) throw new Error('no open reader for item ' + itemID);
    const ir = r._internalReader;
    const top = ir._sdt.structure.content;
    const segs = ir._readAloudSegments.segments;
    out.itemID = itemID;
    out.sourceKey = S.current.key || null;

    // the sieve's own helpers (skipped-lines.ts / paragraph-parts.ts)
    const SENTENCE_END = /[.!?…][)\]}"'”’»]*\s*$/;
    const CONTINUES = /^(?:\p{Ll}|[[(]\s*\p{Nd})/u;
    const COLUMN_TOLERANCE_PT = 12, MAX_GAP_PT = 36;
    const blockText = b => {
      const n = b && b.content; let t = '';
      for (let i = 0; n && i < n.length; i++) if (typeof n[i].text === 'string') t += n[i].text;
      return t;
    };
    const isLeaf = b => {
      if (!b || typeof b !== 'object') return false;
      const n = b.content; if (!n || typeof n.length !== 'number') return true;
      for (let i = 0; i < n.length; i++) if (n[i] && typeof n[i].text !== 'string') return false;
      return true;
    };
    const rectsOf = b => {
      const raw = (b && b.pageRects) || (b && b.anchor && b.anchor.pageRects);
      if (!raw || !raw.length) return null;
      const rects = [];
      for (let i = 0; i < raw.length; i++) { const q = raw[i]; if (!q || q.length < 5) return null; const rect = []; for (let j = 0; j < 5; j++) { const n = Number(q[j]); if (!Number.isFinite(n)) return null; rect.push(n); } rects.push(rect); }
      return rects;
    };
    const endsMid = t => { const s = String(t).trim(); return s.length > 0 && !SENTENCE_END.test(s); };
    const edgesOn = (rects, last) => {
      const page = rects[last ? rects.length - 1 : 0][0];
      let x0 = Infinity, x1 = -Infinity, topY = -Infinity, bottom = Infinity;
      for (let i = 0; i < rects.length; i++) { const q = rects[i]; if (q[0] !== page) continue; x0 = Math.min(x0, q[1]); x1 = Math.max(x1, q[3]); bottom = Math.min(bottom, q[2]); topY = Math.max(topY, q[4]); }
      return { page, x0, x1, top: topY, bottom };
    };
    const key = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '');
    const texts = [];
    for (let i = 0; i < top.length; i++) texts.push(key(blockText(top[i])));
    const findBlock = (needle, fromEnd) => {
      const k = key(needle);
      const probe = fromEnd ? k.slice(-28) : k.slice(0, 28);
      if (probe.length < 8) return -1;
      for (let i = 0; i < texts.length; i++) if (texts[i].indexOf(probe) >= 0) return i;
      return -1;
    };

    const endsSentence = t => /[.!?]["'’”)\]]?\s*$/.test(t);
    const startsLower = t => /^\s*[a-zà-ÿ]/.test(t);
    for (let i = 0; i + 1 < segs.length; i++) {
      const a = segs[i].text, b = segs[i + 1].text;
      if (typeof a !== 'string' || typeof b !== 'string') continue;
      if (endsSentence(a) || !startsLower(b)) continue;
      const ia = findBlock(a, true);
      const ib = findBlock(b, false);
      const A = ia >= 0 ? top[ia] : null;
      const B = ib >= 0 ? top[ib] : null;
      const row = {
        seg: i, anchorNext: segs[i + 1].anchor || null,
        pageA: segs[i].sourcePosition ? segs[i].sourcePosition.pageIndex : null,
        pageB: segs[i + 1].sourcePosition ? segs[i + 1].sourcePosition.pageIndex : null,
        tailA: a.slice(-55), headB: b.slice(0, 55),
        blockA: ia, blockB: ib,
        A: A ? { type: A.type, flowClass: A.flowClass || null, leaf: isLeaf(A), hasNextPart: A.nextPart !== undefined && A.nextPart !== null } : null,
        B: B ? { type: B.type, flowClass: B.flowClass || null, leaf: isLeaf(B), hasPrevPart: B.previousPart !== undefined && B.previousPart !== null } : null,
        between: [],
        failed: [],
      };
      if (ia >= 0 && ib >= 0) {
        for (let k2 = ia + 1; k2 < ib; k2++) row.between.push({ i: k2, type: top[k2].type, flowClass: top[k2].flowClass || null });
        // 1. consecutive top-level leaf paragraphs, only excluded blocks between, no link yet
        if (!A || A.type !== 'paragraph' || A.flowClass === 'excluded' || !isLeaf(A)) row.failed.push('1: A is not a plain leaf paragraph (' + (A ? A.type + '/' + (A.flowClass || 'none') : 'missing') + ')');
        if (!B || B.type !== 'paragraph' || !isLeaf(B)) row.failed.push('1: B is not a leaf paragraph (' + (B ? B.type + '/' + (B.flowClass || 'none') : 'missing') + ')');
        let nonExcluded = 0;
        for (let k2 = ia + 1; k2 < ib; k2++) if (top[k2].flowClass !== 'excluded') nonExcluded++;
        if (nonExcluded) row.failed.push('1: ' + nonExcluded + ' block(s) that are not excluded between them');
        if (A && A.nextPart !== undefined && A.nextPart !== null) row.failed.push('1: A already has a nextPart');
        if (B && B.previousPart !== undefined && B.previousPart !== null) row.failed.push('1: B already has a previousPart');
        // 2 and 3. the texts
        const tA = blockText(A), tB = blockText(B);
        row.blockTailA = tA.slice(-45); row.blockHeadB = tB.slice(0, 45);
        if (!endsMid(tA)) row.failed.push('2: A ends a sentence');
        if (!CONTINUES.test(tB.trim())) row.failed.push('3: B does not start lowercase or with a citation bracket');
        // 4. the geometry
        const ra = rectsOf(A), rb = rectsOf(B);
        if (!ra || !rb) row.failed.push('4: no page rects');
        else {
          const ea = edgesOn(ra, true), eb = edgesOn(rb, false);
          const overlap = Math.min(ea.x1, eb.x1) - Math.max(ea.x0, eb.x0);
          const gap = ea.bottom - eb.top;
          row.geometry = { pageA: ea.page, pageB: eb.page, overlap: Math.round(overlap * 10) / 10, gap: Math.round(gap * 10) / 10, nextColumn: eb.x0 >= ea.x1 - COLUMN_TOLERANCE_PT && eb.top >= ea.bottom };
          const follows = eb.page === ea.page + 1 ? true : (eb.page !== ea.page ? false : ((overlap > 0 && gap >= -2 && gap <= MAX_GAP_PT) || row.geometry.nextColumn));
          row.geometry.follows = follows;
          if (!follows) row.failed.push('4: B is not where A\'s next line would be (gap ' + row.geometry.gap + ' pt, overlap ' + row.geometry.overlap + ')');
        }
        if (!row.failed.length) row.failed.push('none of the four — the pair should have been joined');
      } else {
        row.failed.push('could not match the segment text back to a block (A ' + ia + ', B ' + ib + ')');
      }
      out.cuts.push(row);
    }
    out.cutCount = out.cuts.length;
  } catch (e) { out.error = String(e); throw e; }
  return JSON.stringify(out);
})()
