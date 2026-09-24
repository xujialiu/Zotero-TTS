/**
 * A native row written by hand straight into the server's own positions
 * file (zotero-tts-positions.json), as another computer's pre-upgrade row
 * (issues #126, #138): `{lib, key, pos, ts}` with `pos` the WHOLE source
 * position object (`{type: 'FragmentSelector', conformsTo, value: <cfi>}`
 * for an EPUB), merged by (lib,key) and written back canonical
 * (position-file.ts's own order: sorted by lib then key). `pos` must come
 * from 38-harvest-positions.js's `state.positions[label].pos` — a real,
 * round-trip-verified Zotero source position, kept whole. A `pos` reduced to
 * `{value: <cfi>}` alone is NOT usable: Zotero's own
 * `EPUBPositionMapper.sourceToSDTPosition` returns null for a position whose
 * `type` is not `'FragmentSelector'` (reader.js 62506-62509), so
 * `deriveSharedFromNative` silently drops such a row without ever logging a
 * `derived` or `not derived` line — measured 2026-09-24, issue #138, the
 * cause of a first attempt's rows going nowhere. The file is read, merged,
 * written back; credentials are read inside Zotero and never leave it.
 * params.craft: { lib, key, ts, pos } — or, since an imported fixture's
 * lib/key are only known once it exists (unlike a static param), { ts,
 * positionsLabel, attachmentStateKey } to read
 * state.positions[positionsLabel].pos and state[attachmentStateKey].{lib,key}
 * instead.
 * params.stateKey: where state.craftedRows[stateKey] is left (what was written).
 */
(async () => {
  const p = Zotero.ZoteroTTSRun.params;
  const s = Zotero.ZoteroTTSRun.state;
  const c = p.craft;
  const pos = c.pos || (c.positionsLabel && s.positions && s.positions[c.positionsLabel] && s.positions[c.positionsLabel].pos);
  const attachment = c.attachmentStateKey ? s[c.attachmentStateKey] : c;
  const lib = attachment ? attachment.lib : undefined;
  const key = attachment ? attachment.key : undefined;
  const out = { craft: c, pos, lib, key };
  if (!pos || !pos.type || lib === undefined || !key) {
    out.error = 'missing pos (whole, with type), lib or key';
    return JSON.stringify(out);
  }
  const pref = (n) => Zotero.Prefs.get('zotero-tts.' + n);
  const url = String(pref('webdav.url') || '').trim().replace(/\/+$/, '') + '/';
  const bytes = new TextEncoder().encode(String(pref('webdav.username') || '') + ':' + String(pref('webdav.password') || ''));
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  const auth = 'Basic ' + btoa(binary);
  const get = await fetch(url + 'zotero-tts-positions.json', { method: 'GET', headers: { Authorization: auth }, cache: 'no-store' });
  out.getStatus = get.status;
  const file = get.status === 200 ? JSON.parse(await get.text()) : { format: 'zotero-tts-positions', version: 1, items: [] };
  out.itemsBefore = file.items.length;
  const entry = { lib, key, pos, ts: c.ts };
  const filtered = file.items.filter((i) => !(i.lib === lib && i.key === key));
  filtered.push(entry);
  filtered.sort((a, b) => a.lib - b.lib || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const body = JSON.stringify({ format: file.format, version: file.version, items: filtered });
  const put = await fetch(url + 'zotero-tts-positions.json', { method: 'PUT', headers: { Authorization: auth, 'Content-Type': 'application/json' }, body, cache: 'no-store' });
  out.putStatus = put.status;
  out.itemsAfter = filtered.length;
  out.wrote = entry;
  const stateKey = p.stateKey || 'lastCraftedRow';
  s.craftedRows = s.craftedRows || {};
  s.craftedRows[stateKey] = entry;
  return JSON.stringify(out, null, 1);
})();
