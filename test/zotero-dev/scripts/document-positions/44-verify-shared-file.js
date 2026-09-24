/**
 * Item 16's read-only check: GETs the Positions File and reports, for a
 * named set of ids (params.fixtureIds -- never hard-coded), whether the file
 * is compact with no newline, whether it is sorted by id as a whole, and for
 * each fixture id: its file text re-serialised (JSON.stringify of the parsed
 * item reproduces the exact substring for a compact, key-ordered file) next
 * to the same id's item in params.canonicalPath when given, byte for byte,
 * plus its top-level/anchor/stamp key lists (so "no publicationId key" or
 * "anchor has exact,prefix,suffix" is a reading, not an eyeball). Every item
 * NOT in fixtureIds is this machine's own: reported as a count and each id's
 * first 8 characters only, never its fields. params.saveAs stashes the whole
 * text into state[saveAs]; params.compareToStateKey diffs the whole text
 * against state[compareToStateKey] byte for byte.
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
  const g = await fetch(url + 'xujialiu-positions.json', { method: 'GET', headers: { Authorization: auth }, cache: 'no-store' });
  out.status = g.status;
  if (g.status !== 200) return JSON.stringify(out);
  const text = await g.text();
  out.bytes = text.length;
  const digest = await Zotero.getMainWindow().crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  out.sha256 = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
  const parsed = JSON.parse(text);
  out.top = { format: parsed.format, version: parsed.version, items: parsed.items.length };
  out.noNewline = !text.includes('\n') && !text.includes('\r');
  out.canonicalWhole = text === JSON.stringify({ format: parsed.format, version: parsed.version, items: parsed.items });
  const ids = parsed.items.map((i) => i.id);
  out.sortedById = ids.join('\u0000') === [...ids].sort().join('\u0000');

  const fixtureIds = p.fixtureIds || [];
  let canonicalById = null;
  if (p.canonicalPath) {
    const canonicalText = await IOUtils.readUTF8(p.canonicalPath);
    const canonicalParsed = JSON.parse(canonicalText);
    canonicalById = new Map(canonicalParsed.items.map((i) => [i.id, i]));
    out.canonicalItemCount = canonicalParsed.items.length;
  }
  const byId = new Map(parsed.items.map((i) => [i.id, i]));
  out.fixtureOrder = fixtureIds.filter((id) => byId.has(id)).sort().map((id) => id.slice(0, 8) || '(empty)');
  out.fixture = {};
  for (const id of fixtureIds) {
    const item = byId.get(id);
    const shortId = id === '' ? '(empty)' : id.slice(0, 8);
    if (!item) { out.fixture[shortId] = { present: false }; continue; }
    const rec = { present: true, topKeys: Object.keys(item), anchorKeys: item.anchor ? Object.keys(item.anchor) : null, stampKeys: item.stamp ? Object.keys(item.stamp) : null };
    if (canonicalById) {
      const want = canonicalById.get(id);
      rec.canonicalPresent = !!want;
      rec.byteIdenticalToCanonical = want ? JSON.stringify(item) === JSON.stringify(want) : null;
    }
    out.fixture[shortId] = rec;
  }
  const own = parsed.items.filter((i) => !fixtureIds.includes(i.id));
  out.ownCount = own.length;
  out.ownIdPrefixes = own.map((i) => i.id.slice(0, 8));

  if (p.saveAs) s[p.saveAs] = text;
  if (p.compareToStateKey && typeof s[p.compareToStateKey] === 'string') {
    out.identicalToStateKey = p.compareToStateKey;
    out.identicalToState = text === s[p.compareToStateKey];
  }
  const d = JSON.parse(await Zotero.ZoteroTTS.diagnostics.positionSync());
  out.sharedDocumentsItems = d.shared.documents.items;
  out.sharedTransport = d.shared.transport;
  return JSON.stringify(out);
})()
