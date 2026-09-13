return (() => {
  const state = Zotero.__zttsAllHandoff, f = state && state.fixture, list = Zotero.Reader._readers || [];
  let reader = null; for (let i = 0; i < list.length; i++) if (list[i] && f && list[i].itemID === f.itemID) { reader = list[i]; break; }
  const m = reader && reader._internalReader && reader._internalReader._readAloudManager, source = m && m.voicesForLanguage || [], rows = [], counts = {};
  for (let i = 0; i < source.length; i++) { const v = source[i]; if (!v || !v.id) continue; const id = String(v.id), provider = id.indexOf('::') >= 0 ? id.slice(0, id.indexOf('::')) : 'native'; rows.push({ i, id, label: String(v.label || ''), language: String(v.language || ''), granularity: String(v.segmentGranularity || '') }); counts[provider] = (counts[provider] || 0) + 1; }
  const samples = {}; for (const p of Object.keys(counts)) samples[p] = rows.filter(r => r.id.indexOf(p + '::') === 0 || (p === 'native' && r.id.indexOf('::') < 0)).slice(0, 6);
  return JSON.stringify({ readerIndex: list.indexOf(reader), selected: m && m.selectedVoiceID || null, menuCount: rows.length, counts, samples }, null, 1);
})()
