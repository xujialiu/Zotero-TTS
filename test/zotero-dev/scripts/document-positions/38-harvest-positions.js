/**
 * Real block/sentence positions from an OPEN reader's SDT structure, for
 * crafting a native row by hand (issue #138, items 8 and 15): given a list
 * of { label, blockIndex, sentenceIndex }, for each it returns the block's
 * element path, the sentence's own text, and a real Zotero EPUB source
 * position for that sentence — built with mapper.sdtToSourcePosition,
 * round-trip verified against mapper.sourceToSDTPosition in the same call.
 * The WHOLE object `sdtToSourcePosition` returns is kept (`{type:
 * 'FragmentSelector', conformsTo, value: <cfi>}`), never just its `.value`:
 * a native row's `pos` must carry that `type`, or Zotero's own
 * `EPUBPositionMapper.sourceToSDTPosition` returns null for it (reader.js
 * 62506-62509 in the installed omni.ja) and `deriveSharedFromNative` exits
 * at its silent `if (!start || !end) return;` with no log line at all —
 * measured 2026-09-24, issue #138, after a first attempt's rows (built from
 * `.value` alone) produced neither a `derived` nor a `not derived` line for
 * either fixture. A bare block-level CFI (no text offset) does NOT resolve
 * through sourceToSDTPosition either — a live probe against this run's own
 * fixture returned null for one — so a native row's `pos` must come from a
 * sentence-range request here, never `{value: 'epubcfi(' + path + ')'}`
 * alone (that bare shape is right only for the *shared* file's block-level
 * `locator`, e.g. 31-craft-known-block.js). blockAtRef/sdtPositionAt below
 * are chrome-scope ports of src/read-aloud/sdt-anchor.ts's own functions —
 * the module itself is inside the plugin sandbox and not reachable from
 * here.
 * params: stateKey (state[stateKey] = { tabID, ... } of an OPEN reader),
 * requests: [{ label, blockIndex, sentenceIndex }].
 * Leaves state.positions[label] = { blockIndex, path, sentence, pos,
 * cfiValue, blockText, sentenceIndex } — blockText/sentenceIndex so
 * 31-craft-known-block.js's own sentence split can build the *shared*
 * file's item (bare block locator, sentence sliced from blockText) from the
 * same harvest; `pos` (the whole, round-trip-verified selector object) is
 * what a *native* row's `pos` needs whole (39-craft-native-row.js).
 * `cfiValue` (`pos.value` alone) is kept only for the report's readability —
 * never write it alone into a native row again.
 */
(async () => {
  const p = Zotero.ZoteroTTSRun.params;
  const s = Zotero.ZoteroTTSRun.state;
  const rec = s[p.stateKey];
  const out = { stateKey: p.stateKey, blockCount: null, results: [] };
  const waive = (v) => {
    try {
      return Components.utils.waiveXrays(v) ?? v;
    } catch {
      return v;
    }
  };
  const reader = Zotero.Reader._readers.find((x) => x.tabID === rec.tabID);
  const sdt = await reader._internalReader._loadSDT();
  const mapper = waive(sdt.mapper);
  const structure = sdt.structure;
  const win = reader._iframeWindow;
  const entries = mapper._blockEntries;
  out.blockCount = entries.length;

  function blockAtRef(structure, ref) {
    let node = structure;
    for (let at = 0; at < ref.length; at++) {
      if (!node || !Array.isArray(node.content)) return null;
      node = node.content[ref[at]];
    }
    if (!node || typeof node.text === 'string') return null;
    const map = node.anchor && node.anchor.selectorMap;
    if (typeof map !== 'string') return null;
    const children = Array.isArray(node.content) ? node.content : [];
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (child && typeof child.text !== 'string') return null;
    }
    const starts = [];
    let text = '';
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (child && typeof child.text === 'string') {
        starts.push(text.length);
        text += child.text;
      } else {
        starts.push(-1);
      }
    }
    return { ref: [...ref], path: map.replace(/\[[^\]]*\]/g, ''), text, starts };
  }
  function sdtPositionAt(block, start, end) {
    const nodeAt = (offset, strictlyBefore) => {
      let found = null;
      for (let i = 0; i < block.starts.length; i++) {
        const at = block.starts[i];
        if (at < 0) continue;
        if (strictlyBefore ? at < offset : at <= offset) found = i;
      }
      return found;
    };
    const from = nodeAt(start, false);
    const to = end > start ? nodeAt(end, true) : from;
    if (from === null || to === null) return null;
    return { start: [...block.ref, from, start - block.starts[from]], end: [...block.ref, to, end - block.starts[to]] };
  }

  s.positions = s.positions || {};
  for (const req of p.requests || []) {
    const entry = entries[req.blockIndex];
    const block = entry ? blockAtRef(structure, entry.ref) : null;
    const row = { label: req.label, blockIndex: req.blockIndex };
    if (!block) {
      row.error = 'block not found';
      out.results.push(row);
      continue;
    }
    const sentences = block.text.split(/(?<=[.!?])\s+/);
    row.path = block.path;
    row.sentenceCount = sentences.length;
    const sentence = sentences[req.sentenceIndex];
    if (sentence === undefined) {
      row.error = 'sentence not found';
      out.results.push(row);
      continue;
    }
    const start = block.text.indexOf(sentence);
    const end = start + sentence.length;
    row.sentence = sentence;
    row.range = [start, end];
    const sdtPos = start < 0 ? null : sdtPositionAt(block, start, end);
    if (!sdtPos) {
      row.error = 'sdtPositionAt failed';
      out.results.push(row);
      continue;
    }
    let cfi = null;
    let err = null;
    try {
      const input = win ? Components.utils.cloneInto(sdtPos, win) : sdtPos;
      const srcPos = mapper.sdtToSourcePosition(input);
      cfi = srcPos ? JSON.parse(JSON.stringify(srcPos)) : null;
    } catch (e) {
      err = String(e);
    }
    row.pos = cfi;
    row.cfiValue = cfi ? cfi.value : null;
    row.cfiErr = err;
    if (cfi) {
      try {
        const input2 = win ? Components.utils.cloneInto(cfi, win) : cfi;
        const back = mapper.sourceToSDTPosition(input2);
        const backStart = back ? Array.from(back.start || []) : null;
        const backEnd = back ? Array.from(back.end || []) : null;
        row.roundTripMatches = !!back && JSON.stringify(backStart) === JSON.stringify(sdtPos.start) && JSON.stringify(backEnd) === JSON.stringify(sdtPos.end);
      } catch (e) {
        row.roundTripErr = String(e);
      }
    }
    if (row.pos && row.roundTripMatches) {
      // blockText whole, for 31-craft-known-block.js's own sentence split;
      // pos whole (type, conformsTo, value), for a native row's pos
      s.positions[req.label] = { blockIndex: req.blockIndex, path: block.path, sentence, pos: row.pos, cfiValue: row.cfiValue, blockText: block.text, sentenceIndex: req.sentenceIndex };
    }
    out.results.push(row);
  }
  return JSON.stringify(out, null, 1);
})();
