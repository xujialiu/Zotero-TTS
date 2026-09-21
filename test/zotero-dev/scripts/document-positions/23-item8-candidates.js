/**
 * Item 8's remaining candidates: the EPUB attachments that hold a pre-build
 * `positions` row and have no item in the Positions File yet — the documents
 * whose tab, opened, must derive one. The rows come from the plugin's own
 * positions file on the server (a GET), the item match from the shared file's
 * locators: an item's locator is its row's CFI truncated to the block, so a
 * row whose CFI starts with a listed locator already has its item.
 * Leaves state.candidates (smallest file first). Nothing is played or written.
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
    return r.status === 200 ? await r.text() : null;
  };
  const shared = JSON.parse((await get('xujialiu-positions.json')) || '{"items":[]}');
  const locators = shared.items.map((i) => i.locator.replace(/^epubcfi\(|\)$/g, ''));
  const own = JSON.parse((await get('zotero-tts-positions.json')) || '{"items":[]}');
  out.rows = own.items.length;

  const openIDs = new Set((Zotero.Reader._readers || []).map((r) => r.itemID));
  const list = [];
  for (const e of own.items) {
    let item = null;
    try {
      item = await Zotero.Items.getByLibraryAndKeyAsync(e.lib, e.key);
    } catch (err) {
      item = null;
    }
    if (!item || item.attachmentContentType !== 'application/epub+zip') continue;
    const cfi = e.pos && e.pos.value ? String(e.pos.value) : '';
    const inner = cfi.replace(/^epubcfi\(|\)$/g, '');
    const hasItem = locators.some((l) => inner === l || inner.indexOf(l + '/') === 0 || inner.indexOf(l + ',') === 0);
    let path = null;
    let size = null;
    try {
      path = await item.getFilePathAsync();
      size = path ? (await IOUtils.stat(path)).size : null;
    } catch (err) {
      size = String(err);
    }
    list.push({
      itemID: item.id,
      lib: e.lib,
      key: e.key,
      title: String(item.getDisplayTitle()).slice(0, 36),
      ts: e.ts,
      cfi: cfi.slice(0, 44),
      hasItem,
      open: openIDs.has(item.id),
      bytes: size,
    });
  }
  list.sort((a, b) => (typeof a.bytes === 'number' ? a.bytes : Infinity) - (typeof b.bytes === 'number' ? b.bytes : Infinity));
  out.epubRows = list.length;
  out.withItem = list.filter((x) => x.hasItem).length;
  out.candidates = list.filter((x) => !x.hasItem && !x.open);
  Zotero.ZoteroTTSRun.state.candidates = out.candidates;
  out.candidateSummary = out.candidates.map((c) => c.itemID + ' ' + c.title + ' ' + c.bytes + 'B ts=' + c.ts);
  return JSON.stringify(out);
})()
