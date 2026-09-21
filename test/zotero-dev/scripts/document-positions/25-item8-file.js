/**
 * Item 8's second half: after the sync the Positions File holds one item per
 * derived document, its `stamp.at` equal to the row's `ts` and its
 * `anchor.exact` the sentence the row named. The row's `ts` comes from
 * state.item8 / state.candidates (the plugin's own positions file, read
 * earlier); the sentence is checked against the row's own CFI — the item's
 * locator is that CFI truncated to the block, and the CFI's character
 * offsets bound the sentence's length.
 * params.derive: the itemIDs opened by 24-item8-derive.js.
 */
(async () => {
  const p = Zotero.ZoteroTTSRun.params;
  const s = Zotero.ZoteroTTSRun.state;
  const out = {};
  const pref = (n) => Zotero.Prefs.get('zotero-tts.' + n);
  const url = String(pref('webdav.url') || '').trim().replace(/\/+$/, '') + '/';
  const bytes = new TextEncoder().encode(String(pref('webdav.username') || '') + ':' + String(pref('webdav.password') || ''));
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  const auth = 'Basic ' + btoa(binary);
  const r = await fetch(url + 'xujialiu-positions.json', { method: 'GET', headers: { Authorization: auth }, cache: 'no-store' });
  out.status = r.status;
  if (r.status !== 200) return JSON.stringify(out);
  const text = await r.text();
  const file = JSON.parse(text);
  out.bytes = text.length;
  out.count = file.items.length;
  out.canonical = text === JSON.stringify({ format: file.format, version: file.version, items: file.items });
  const ids = file.items.map((i) => i.id);
  out.sortedById = ids.join('|') === [...ids].sort().join('|');
  const before = (s.item8 && s.item8.sharedIdsBefore) || [];
  out.newIds = ids.filter((i) => before.indexOf(i) === -1).map((i) => i.slice(0, 14) + '…');

  const rowOf = (itemID) => {
    const all = [...((s.candidates || [])), ...(((s.item8 && s.item8.targets) || []))];
    return all.find((c) => c.itemID === itemID) || null;
  };
  out.derived = [];
  for (const itemID of p.derive || []) {
    const row = rowOf(itemID);
    const check = { itemID, title: row ? row.title : null, rowTs: row ? (row.ts ?? row.rowTs) : null, rowCfi: row ? (row.cfi ?? row.rowCfi) : null };
    const item = row ? file.items.find((i) => i.stamp.at === check.rowTs) : null;
    check.found = !!item;
    if (item) {
      const inner = String(item.locator).replace(/^epubcfi\(|\)$/g, '');
      const cfiInner = String(check.rowCfi || '').replace(/^epubcfi\(|\)$/g, '');
      const offsets = cfiInner.match(/:(\d+),.*?:(\d+)/);
      check.id = item.id.slice(0, 14) + '…';
      check.format = item.format;
      check.locator = item.locator;
      check.locatorIsRowBlock = cfiInner.indexOf(inner + '/') === 0 || cfiInner.indexOf(inner + ',') === 0 || cfiInner === inner;
      check.locatorPattern = /^epubcfi\(\/6\/\d*[02468]!(\/\d*[02468])+\)$/.test(item.locator);
      check.stampAt = item.stamp.at;
      check.stampEqualsRowTs = item.stamp.at === check.rowTs;
      check.device = item.stamp.device;
      check.exact60 = String(item.anchor.exact).slice(0, 60);
      check.exactLength = String(item.anchor.exact).length;
      check.cfiSpan = offsets ? Number(offsets[2]) - Number(offsets[1]) : null;
      check.prefix = String(item.anchor.prefix || '').slice(0, 30);
      check.suffix = String(item.anchor.suffix || '').slice(0, 30);
      check.keyOrder = Object.keys(item).join(',');
    }
    out.derived.push(check);
  }
  out.allItems = file.items.map((i) => i.id.slice(0, 14) + '… ' + i.format + ' ' + i.stamp.device + ' ' + i.stamp.at + ' ' + i.locator);
  Zotero.ZoteroTTSRun.state.fileAfterDerive = text;
  return JSON.stringify(out);
})()
