/**
 * The Positions File as the server holds it, read-only: its bytes, its SHA-256
 * and one line per item, from a GET made inside Zotero with the plugin's own
 * `webdav.*` prefs, so no credential leaves the process. `params.snapshot`
 * 'before' keeps the whole text in state.positionsBefore (and the file's item
 * for params.expectedDocumentId in state.crafted, which 13-resume-shift-space.js
 * reports — the place the other device left, crafted or genuine); any other
 * value diffs every item against that snapshot, so "the other items are
 * byte-identical" is a reading and not an eyeball.
 */
(async () => {
  const p = Zotero.ZoteroTTSRun.params;
  const s = Zotero.ZoteroTTSRun.state;
  const out = { snapshot: p.snapshot ?? 'after' };
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
  out.bytes = text.length;
  try {
    const d = await Zotero.getMainWindow().crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    out.sha256 = Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch (e) {
    out.sha256 = 'n/a: ' + String(e);
  }
  const parsed = JSON.parse(text);
  out.top = { format: parsed.format, version: parsed.version, items: parsed.items.length };
  out.canonical = text === JSON.stringify({ format: parsed.format, version: parsed.version, items: parsed.items });
  out.sortedById = parsed.items.map((i) => i.id).join('|') === parsed.items.map((i) => i.id).sort().join('|');
  const short = (i) => i.id.slice(7, 15) + '…';
  out.items = parsed.items.map((i) => short(i) + ' ' + i.format + ' ' + i.stamp.device + ' @' + i.stamp.at + ' ' + i.locator);
  out.fixtureItem = parsed.items.find((i) => i.id === p.expectedDocumentId) ?? null;
  if (out.snapshot === 'before') {
    s.positionsBefore = text;
    s.positionsBeforeSha = out.sha256;
    if (out.fixtureItem) s.crafted = out.fixtureItem;
  } else if (typeof s.positionsBefore === 'string') {
    const was = JSON.parse(s.positionsBefore);
    const byId = new Map(was.items.map((i) => [i.id, JSON.stringify(i)]));
    out.diff = {
      fileIdentical: text === s.positionsBefore,
      beforeSha: s.positionsBeforeSha,
      beforeBytes: s.positionsBefore.length,
      changed: parsed.items.filter((i) => byId.get(i.id) !== JSON.stringify(i)).map(short),
      unchanged: parsed.items.filter((i) => byId.get(i.id) === JSON.stringify(i)).map(short),
      gone: was.items.filter((i) => !parsed.items.some((j) => j.id === i.id)).map(short),
      fixtureBefore: was.items.find((i) => i.id === p.expectedDocumentId) ?? null,
    };
  }
  return JSON.stringify(out);
})()
