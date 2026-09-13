return (async () => {
  const state = Zotero.__zttsAllHandoff, fixture = state && state.fixture;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const out = { status: 'PENDING', trace: [], errors: [] };
  if (!fixture) { out.status = 'NOT TESTABLE'; out.errors.push('fixture missing'); return JSON.stringify(out, null, 1); }
  let reader = null;
  const started = Date.now();
  for (let n = 0; n < 65; n++) {
    const list = Zotero.Reader._readers || [];
    for (let i = 0; i < list.length; i++) if (list[i] && list[i].itemID === fixture.itemID) { reader = list[i]; break; }
    const m = reader && reader._internalReader && reader._internalReader._readAloudManager;
    const all = m && m._allVoices || [];
    const counts = {};
    for (let i = 0; i < all.length; i++) { const id = String(all[i] && all[i].id || ''); const p = id.indexOf('::') >= 0 ? id.slice(0, id.indexOf('::')) : 'native'; counts[p] = (counts[p] || 0) + 1; }
    out.trace.push({ ms: Date.now() - started, readers: list.length, all: all.length, counts, selected: m && m.selectedVoiceID || null, tier: m && m._selectedTier || null, segments: m && m._segments ? m._segments.length : null });
    if (Object.keys(counts).length > 1 && all.length > 10) { out.status = 'READY'; break; }
    await sleep(100);
  }
  out.first = out.trace[0] || null; out.last = out.trace[out.trace.length - 1] || null; out.count = out.trace.length;
  return JSON.stringify(out, null, 1);
})()
