return (() => {
  const s = Zotero.__zttsAllHandoff, f = s && s.fixture, list = Zotero.Reader._readers || [];
  let r = null; for (let i = 0; i < list.length; i++) if (list[i] && f && list[i].itemID === f.itemID) { r = list[i]; break; }
  const m = r && r._internalReader && r._internalReader._readAloudManager;
  if (!m) return JSON.stringify({ status: 'NOT TESTABLE', error: 'fixture manager missing' }, null, 1);
  try { m.setLanguage('mul', { region: null, persist: false }); } catch (e) { return JSON.stringify({ status: 'FAIL', error: String(e) }, null, 1); }
  const rows = [], source = m.voicesForLanguage || [];
  for (let i = 0; i < source.length; i++) { const v = source[i]; if (v && v.id) rows.push({ id: String(v.id), label: String(v.label || ''), language: String(v.language || '') }); }
  return JSON.stringify({ status: 'PASS', lang: m._lang || null, menuCount: rows.length, providers: rows.reduce((o, v) => { const p = v.id.indexOf('::') >= 0 ? v.id.slice(0, v.id.indexOf('::')) : 'native'; o[p] = (o[p] || 0) + 1; return o; }, {}), head: rows.slice(0, 30) }, null, 1);
})()
