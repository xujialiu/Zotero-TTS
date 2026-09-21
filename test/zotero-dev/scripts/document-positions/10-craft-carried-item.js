/**
 * Item 4's carry-through: an item this build cannot use — `format` `pdf`, a
 * fresh id — put into the file by hand, so the next upload has to keep it
 * byte-identical and in id order. params.carriedId.
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
  const get = await fetch(url + 'xujialiu-positions.json', { method: 'GET', headers: { Authorization: auth }, cache: 'no-store' });
  const file = get.status === 200 ? JSON.parse(await get.text()) : { format: 'xujialiu-positions', version: 1, items: [] };
  const item = {
    id: p.carriedId,
    format: 'pdf',
    publicationId: null,
    locator: 'page=7',
    anchor: { exact: 'A sentence a pdf writer would quote.', prefix: 'before ', suffix: ' after' },
    stamp: { at: Date.now() - 5000, device: 'someone-elses-device' },
  };
  file.items = file.items.filter((i) => i.id !== item.id).concat([item]);
  // deliberately NOT sorted: the hand edit need not be canonical
  const body = JSON.stringify({ format: file.format, version: file.version, items: file.items });
  const put = await fetch(url + 'xujialiu-positions.json', { method: 'PUT', headers: { Authorization: auth, 'Content-Type': 'application/json' }, body, cache: 'no-store' });
  out.putStatus = put.status;
  out.wrote = item;
  out.itemsNow = file.items.map((i) => i.id.slice(0, 20) + '… ' + i.format);
  out.handEditOrder = file.items.map((i) => i.id);
  Zotero.ZoteroTTSRun.state.carried = item;
  return JSON.stringify(out);
})()
