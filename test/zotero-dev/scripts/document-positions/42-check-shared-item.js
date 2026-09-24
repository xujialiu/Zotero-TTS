/**
 * Read-only: the shared file's (xujialiu-positions.json) item for one
 * Document Id, straight off the server, plus the transports' own stats —
 * item 15/8's end-state check (issue #138), run after a poke sync (e.g.
 * 09-tab-poke.js) has had its own chance to write over what was crafted.
 * Never writes; safe to call as many times as needed.
 * params: documentId.
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
  out.getStatus = get.status;
  if (get.status === 200) {
    const text = await get.text();
    const file = JSON.parse(text);
    out.fileBytes = text.length;
    out.totalItems = file.items.length;
    out.item = file.items.find((i) => i.id === p.documentId) ?? null;
  }
  const ps = JSON.parse(await Zotero.ZoteroTTS.diagnostics.positionSync());
  out.sharedTransport = ps.shared.transport;
  out.sharedDocuments = ps.shared.documents;
  out.ownDatabaseRows = JSON.parse(await Zotero.ZoteroTTS.diagnostics.position()).database.rows;
  return JSON.stringify(out, null, 1);
})();
