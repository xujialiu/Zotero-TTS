/**
 * Item 8's targets: every EPUB reader already open that holds a pre-build
 * `positions` row, the Positions File as it stands, and each row's own `ts`,
 * read from the plugin's own positions file on the same server — a GET, never
 * a write, and the only independent source of the row time a derived item's
 * `stamp.at` has to equal. Credentials are read inside Zotero, never printed.
 * Leaves state.item8 { targets, sharedIdsBefore }.
 */
(async () => {
  const out = {};
  const pref = (n) => Zotero.Prefs.get('zotero-tts.' + n);
  const url = String(pref('webdav.url') || '').trim().replace(/\/+$/, '') + '/';
  const bytes = new TextEncoder().encode(String(pref('webdav.username') || '') + ':' + String(pref('webdav.password') || ''));
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  const auth = 'Basic ' + btoa(binary);
  const get = async (name) => {
    const r = await fetch(url + name, { method: 'GET', headers: { Authorization: auth }, cache: 'no-store' });
    return { status: r.status, text: r.status === 200 ? await r.text() : null };
  };

  const shared = await get('xujialiu-positions.json');
  out.sharedStatus = shared.status;
  const file = shared.text ? JSON.parse(shared.text) : null;
  out.sharedBytes = shared.text ? shared.text.length : null;
  out.sharedItems = file
    ? file.items.map((i) => ({ id: i.id.slice(0, 14) + '…', format: i.format, locator: i.locator, exact: String(i.anchor.exact).slice(0, 60), at: i.stamp.at, device: i.stamp.device }))
    : null;
  const ids = file ? file.items.map((i) => i.id) : [];

  // {lib,key,pos,ts} per row: the row times, without a second DB connection
  const own = await get('zotero-tts-positions.json');
  out.ownStatus = own.status;
  const ownFile = own.text ? JSON.parse(own.text) : null;
  out.ownEntries = ownFile ? ownFile.items.length : null;

  const d = JSON.parse(await Zotero.ZoteroTTS.diagnostics.position());
  out.targets = [];
  for (const r of d.readers) {
    const item = r.itemID ? Zotero.Items.get(r.itemID) : null;
    const lib = item ? item.libraryID : null;
    const key = item ? item.key : null;
    const e = ownFile && lib !== null ? ownFile.items.find((x) => x.lib === lib && x.key === key) : null;
    const reader = (Zotero.Reader._readers || []).find((x) => x.itemID === r.itemID);
    out.targets.push({
      itemID: r.itemID,
      tabID: reader ? reader.tabID : null,
      lib,
      key,
      epub: !!item && item.attachmentContentType === 'application/epub+zip',
      title: item ? String(item.getDisplayTitle()).slice(0, 36) : null,
      rowCfi: r.stored && r.stored.value ? r.stored.value : null,
      rowTs: e ? e.ts : null,
      rowTsCfi: e && e.pos && e.pos.value ? e.pos.value : null,
      fileMatchesRow: !!(e && r.stored && JSON.stringify(e.pos) === JSON.stringify(r.stored)),
    });
  }
  Zotero.ZoteroTTSRun.state.item8 = { targets: out.targets, sharedIdsBefore: ids };
  out.documentsBefore = JSON.parse(Zotero.ZoteroTTS.diagnostics.positionSync()).shared.documents;
  return JSON.stringify(out);
})()
