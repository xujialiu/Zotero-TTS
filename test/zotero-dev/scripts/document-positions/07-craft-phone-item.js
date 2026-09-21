/**
 * A phone's item for the fixture's Document Id, written straight into the
 * server file: the locator of a real later block and, as `anchor.exact`, a
 * sentence taken from that block's own text (params.craft.sentence, 0-based)
 * — or params.craft.exact for the sentence that is not in the book (item 6).
 * The file is read, merged by id and written back canonical; credentials are
 * read inside Zotero and never leave it.
 * params.craft: { blockIndex, sentence?, exact?, device, atDelta }.
 * Leaves state.crafted = what was written.
 */
(async () => {
  const p = Zotero.ZoteroTTSRun.params;
  const c = p.craft;
  const f = Zotero.ZoteroTTSRun.state.fixture;
  const waive = (v) => { try { return Components.utils.waiveXrays(v) ?? v; } catch { return v; } };
  const out = {};
  const reader = Zotero.Reader._readers.find((x) => x.tabID === f.tabID);
  const sdt = await reader._internalReader._loadSDT();
  const mapper = waive(sdt.mapper);
  const entry = mapper._blockEntries[c.blockIndex];
  const path = String(entry.path);
  // The block's text as the worker wrote it: its text nodes concatenated
  const ref = [];
  for (let i = 0; i < entry.ref.length; i++) ref.push(entry.ref[i]);
  let node = sdt.structure;
  for (const step of ref) node = node.content[step];
  let text = '';
  for (let i = 0; i < node.content.length; i++) {
    const t = node.content[i]?.text;
    if (typeof t === 'string') text += t;
  }
  text = text.replace(/\s+/g, ' ').trim();
  out.blockPath = path;
  out.blockText = text;
  const sentences = text.split(/(?<=[.!?])\s+/);
  out.sentences = sentences.map((s) => s.slice(0, 50));
  const exact = c.exact ?? sentences[c.sentence];
  const at = text.indexOf(exact);
  const prefix = at > 0 ? text.slice(Math.max(0, at - 32), at) : '';
  const suffix = at >= 0 ? text.slice(at + exact.length, at + exact.length + 32) : '';

  const pref = (n) => Zotero.Prefs.get('zotero-tts.' + n);
  const url = String(pref('webdav.url') || '').trim().replace(/\/+$/, '') + '/';
  const bytes = new TextEncoder().encode(String(pref('webdav.username') || '') + ':' + String(pref('webdav.password') || ''));
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  const auth = 'Basic ' + btoa(binary);
  const get = await fetch(url + 'xujialiu-positions.json', { method: 'GET', headers: { Authorization: auth }, cache: 'no-store' });
  const file = get.status === 200 ? JSON.parse(await get.text()) : { format: 'xujialiu-positions', version: 1, items: [] };
  const held = file.items.find((i) => i.id === p.expectedDocumentId);
  const item = {
    id: p.expectedDocumentId,
    format: 'epub',
    publicationId: null,
    locator: 'epubcfi(' + path + ')',
    anchor: { exact, prefix: c.exact ? '' : prefix, suffix: c.exact ? '' : suffix },
    stamp: { at: Math.max(Date.now(), held ? held.stamp.at : 0) + (c.atDelta ?? 1000), device: c.device },
  };
  file.items = file.items.filter((i) => i.id !== item.id).concat([item]).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const body = JSON.stringify({ format: file.format, version: file.version, items: file.items });
  const put = await fetch(url + 'xujialiu-positions.json', { method: 'PUT', headers: { Authorization: auth, 'Content-Type': 'application/json' }, body, cache: 'no-store' });
  out.putStatus = put.status;
  out.wrote = item;
  out.fileItems = file.items.length;
  out.previousHeld = held ? { at: held.stamp.at, device: held.stamp.device, exact: held.anchor.exact } : null;
  Zotero.ZoteroTTSRun.state.crafted = item;
  return JSON.stringify(out);
})()
