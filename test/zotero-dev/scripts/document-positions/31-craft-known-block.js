/**
 * A phone's item for a KNOWN block, written straight into the server file,
 * without needing an open reader — item 13 needs the item in place before
 * its tab ever opens (issue #129), and naming happens on open, so nothing
 * here may touch Zotero.Reader. The block's path and text are supplied by
 * the caller (this run's own fixture generator, .tmp/zotero-dev/document-
 * positions/make-fixture.ts, knows its own structure and text), and the
 * sentence/prefix/suffix are cut from that text exactly as
 * 07-craft-phone-item.js cuts them from a live block (32-char context,
 * core/document-anchor.ts's ANCHOR_CONTEXT), so the two produce the same
 * shape of item. The file is read, merged by id and written back; credentials
 * are read inside Zotero and never leave it.
 * params.craft: { documentId, path, blockText, sentence, device, atDelta }.
 * Leaves state.crafted = what was written.
 */
(async () => {
  const p = Zotero.ZoteroTTSRun.params;
  const c = p.craft;
  const out = {};
  const text = String(c.blockText).replace(/\s+/g, ' ').trim();
  out.blockText = text;
  const sentences = text.split(/(?<=[.!?])\s+/);
  out.sentences = sentences.map((s) => s.slice(0, 60));
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
  const held = file.items.find((i) => i.id === c.documentId);
  const item = {
    id: c.documentId,
    format: 'epub',
    publicationId: null,
    locator: 'epubcfi(' + c.path + ')',
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
