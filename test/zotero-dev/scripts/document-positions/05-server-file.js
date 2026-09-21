/**
 * The Positions File as the server holds it, GET straight from the plugin's
 * configured folder — the credentials are read inside Zotero and never leave
 * it. Validates the fixture's item against spec 6.2/6.4 and params.expectedDocumentId.
 * params: expectedDocumentId. state.fixture for the attachment.
 */
(async () => {
  const p = Zotero.ZoteroTTSRun.params;
  const out = {};
  const pref = (n) => Zotero.Prefs.get('zotero-tts.' + n);
  const url = String(pref('webdav.url') || '').trim().replace(/\/+$/, '') + '/';
  const bytes = new TextEncoder().encode(String(pref('webdav.username') || '') + ':' + String(pref('webdav.password') || ''));
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  const auth = 'Basic ' + btoa(binary);
  const r = await fetch(url + 'xujialiu-positions.json', { method: 'GET', headers: { Authorization: auth }, cache: 'no-store' });
  out.status = r.status;
  const text = r.status === 200 ? await r.text() : '';
  out.bytes = text.length;
  if (r.status !== 200) return JSON.stringify(out);
  const parsed = JSON.parse(text);
  out.top = { format: parsed.format, version: parsed.version, keys: Object.keys(parsed), items: parsed.items.length };
  out.canonical = text === JSON.stringify({ format: parsed.format, version: parsed.version, items: parsed.items });
  out.sortedById = parsed.items.map((i) => i.id).join('|') === parsed.items.map((i) => i.id).sort().join('|');
  const mine = parsed.items.find((i) => i.id === p.expectedDocumentId) || null;
  out.fixtureItem = mine;
  if (mine) {
    out.checks = {
      idMatchesNode: mine.id === p.expectedDocumentId,
      locatorPattern: /^epubcfi\(\/6\/\d*[02468]!(\/\d*[02468])+\)$/.test(mine.locator),
      locatorNoOffsets: !/[\[:,]/.test(mine.locator),
      format: mine.format,
      publicationId: mine.publicationId,
      anchorKeys: Object.keys(mine.anchor),
      stampKeys: Object.keys(mine.stamp),
      itemKeyOrder: Object.keys(mine).join(','),
    };
  }
  out.otherItemIds = parsed.items.filter((i) => i.id !== p.expectedDocumentId).map((i) => i.id.slice(0, 14) + '… ' + i.format);
  const up = JSON.parse(await Zotero.ZoteroTTS.diagnostics.settingsUpload());
  out.machine = up.machine;
  out.files = JSON.parse(await Zotero.ZoteroTTS.diagnostics.settingsFiles());
  return JSON.stringify(out);
})()
