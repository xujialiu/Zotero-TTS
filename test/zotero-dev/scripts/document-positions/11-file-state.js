/**
 * The server file as it stands: canonical text or not, id order, and every
 * item whole — the check every later item re-reads. Credentials stay inside
 * Zotero. Reads params.expectedDocumentId and params.carriedId when set.
 */
(async () => {
  const p = Zotero.ZoteroTTSRun.params;
  const pref = (n) => Zotero.Prefs.get('zotero-tts.' + n);
  const url = String(pref('webdav.url') || '').trim().replace(/\/+$/, '') + '/';
  const bytes = new TextEncoder().encode(String(pref('webdav.username') || '') + ':' + String(pref('webdav.password') || ''));
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  const auth = 'Basic ' + btoa(binary);
  const r = await fetch(url + 'xujialiu-positions.json', { method: 'GET', headers: { Authorization: auth }, cache: 'no-store' });
  const out = { status: r.status };
  if (r.status !== 200) return JSON.stringify(out);
  const text = await r.text();
  out.bytes = text.length;
  const parsed = JSON.parse(text);
  out.top = { format: parsed.format, version: parsed.version, keyOrder: Object.keys(parsed).join(','), count: parsed.items.length };
  out.canonical = text === JSON.stringify({ format: parsed.format, version: parsed.version, items: parsed.items });
  const ids = parsed.items.map((i) => i.id);
  out.idOrder = ids.map((i) => i.slice(7, 15) + '…');
  out.sortedById = ids.join('|') === [...ids].sort().join('|');
  out.items = parsed.items.map((i) => ({ id: i.id.slice(7, 15) + '…', format: i.format, locator: i.locator, exact: i.anchor.exact, prefix: i.anchor.prefix, suffix: i.anchor.suffix, at: i.stamp.at, device: i.stamp.device, keyOrder: Object.keys(i).join(',') }));
  const carried = p.carriedId ? parsed.items.find((i) => i.id === p.carriedId) : null;
  out.carriedItem = carried ?? null;
  const fixture = parsed.items.find((i) => i.id === p.expectedDocumentId) ?? null;
  out.fixtureItem = fixture;
  return JSON.stringify(out);
})()
