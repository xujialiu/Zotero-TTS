return (async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const ownerKey = String(Zotero.ZoteroTTSRun.params.ownerKey || '');
  if (!ownerKey) throw new Error('ownerKey param is required');
  const out = { startup: null, selectionStart: null, owner: null };
  try { out.startup = JSON.parse(Zotero.ZoteroTTS.diagnostics.startup()); } catch (e) { out.startup = { error: String(e) }; }
  try { out.selectionStart = JSON.parse(Zotero.ZoteroTTS.diagnostics.selectionStart()); } catch (e) { out.selectionStart = { error: String(e) }; }
  const owner = (Zotero.Reader._readers || []).find(reader => {
    try { return Zotero.Items.get(reader.itemID)?.key === ownerKey; } catch (e) { return false; }
  });
  if (!owner?._internalReader) {
    out.owner = { available: false, key: ownerKey, reason: 'requested owner attachment is not loaded' };
    return JSON.stringify(out);
  }
  const ir = owner._internalReader;
  const segments = ir._readAloudSegments?.segments || [];
  const mapper = ir._sdt?.mapper;
  let expected = -1;
  for (let i = 0; i < segments.length; i++) if (String(segments[i]?.text || '').startsWith('That said,')) { expected = i; break; }
  const rows = [];
  const diag = () => {
    try { return JSON.parse(Zotero.ZoteroTTS.diagnostics.selectionStart()); } catch (e) { return { error: String(e) }; }
  };
  if (!mapper || expected < 0) {
    out.owner = { available: true, key: ownerKey, expected, segments: segments.length, error: 'owner mapper or target segment missing' };
    return JSON.stringify(out);
  }
  const first = ir._readAloudSegments.getSegmentTextSpans(segments[expected])[0];
  const makePosition = (offset, length) => {
    const span = {
      ref: JSON.parse(JSON.stringify(first.ref)),
      node: JSON.parse(JSON.stringify(first.node)),
      start: first.start + offset,
      end: first.start + offset + length,
    };
    const spans = Components.utils.cloneInto([span], owner._iframeWindow);
    return mapper.textNodeSpansToSourcePosition(spans);
  };
  for (const [label, offset, length] of [['opening word', 0, 9], ['first character', 0, 1], ['inside word', 1, 8], ['word tail', 5, 4]]) {
    try {
      const position = makePosition(offset, length);
      const mapped = mapper.sourceToSDTPosition(position);
      const actual = ir._findReadAloudStartIndex(segments, position);
      rows.push({ label, selectedText: first.node.text.slice(first.start + offset, first.start + offset + length), mapped, expected, actual, pass: actual === expected });
    } catch (e) { rows.push({ label, error: String(e) }); }
  }
  const boundaries = [];
  for (const offset of [0, 1]) {
    try {
      const start = JSON.parse(JSON.stringify(segments[expected].position.start));
      start[start.length - 1] += offset;
      const position = Components.utils.cloneInto({ start, end: start }, owner._iframeWindow);
      boundaries.push({ offset, actual: ir._findReadAloudStartIndex(segments, position), expected });
    } catch (e) { boundaries.push({ offset, error: String(e) }); }
  }
  let unknown = null;
  try { unknown = ir._findReadAloudStartIndex(segments, Components.utils.cloneInto({ start: [999999], end: [999999] }, owner._iframeWindow)); } catch (e) { unknown = 'error:' + String(e); }
  const after = diag();
  state.ownerResolver = { key: ownerKey, expected, rows, boundaries, unknown, before: out.selectionStart, after };
  out.owner = { available: true, key: ownerKey, expected, segments: segments.length, rows, boundaries, unknown, state: { active: !!ir._readAloudManager?.active, paused: !!ir._readAloudManager?.paused, popupOpen: !!ir._state?.readAloudState?.popupOpen }, diagnostics: after };
  return JSON.stringify(out);
})()
