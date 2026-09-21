/**
 * Item 9: a file of a version this build does not know is left strictly alone.
 * Stashes the current file (state and `<tmpDir>/<runId>/positions-before.json`),
 * puts `version: 2` in its place, pokes a tab and reads both transports.
 * Restored by 15-restore-file.js.
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
  const stash = get.status === 200 ? await get.text() : null;
  Zotero.ZoteroTTSRun.state.positionsBefore = stash;
  out.stashedBytes = stash === null ? null : stash.length;
  if (stash !== null) {
    const dir = p.tmpDir + '/' + p.runId;
    await IOUtils.makeDirectory(dir, { ignoreExisting: true });
    await IOUtils.writeUTF8(dir + '/positions-before.json', stash);
    out.stashedTo = dir + '/positions-before.json';
  }
  const body = '{"format":"xujialiu-positions","version":2,"items":[]}';
  const put = await fetch(url + 'xujialiu-positions.json', { method: 'PUT', headers: { Authorization: auth, 'Content-Type': 'application/json' }, body, cache: 'no-store' });
  out.putStatus = put.status;

  const s = Zotero.ZoteroTTSRun.state;
  const win = Zotero.getMainWindow();
  if (s.pdf?.tabID && win.Zotero_Tabs._tabs.some((t) => t.id === s.pdf.tabID)) {
    win.Zotero_Tabs.close(s.pdf.tabID);
    await new Promise((r) => setTimeout(r, 2500));
  }
  const reader = await Zotero.Reader.open(s.pdf.itemID);
  const started = Date.now();
  while (Date.now() - started < 20000 && !reader?._internalReader) await new Promise((r) => setTimeout(r, 700));
  s.pdf.tabID = reader?.tabID ?? s.pdf.tabID;
  await new Promise((r) => setTimeout(r, 3500));

  const d = JSON.parse(await Zotero.ZoteroTTS.diagnostics.positionSync());
  out.shared = d.shared.transport;
  out.own = { lastOutcome: d.transport.lastOutcome, lastTrigger: d.transport.lastTrigger, lastError: d.transport.lastError, uploaded: d.transport.uploaded };
  out.documents = d.shared.documents;
  const after = await fetch(url + 'xujialiu-positions.json', { method: 'GET', headers: { Authorization: auth }, cache: 'no-store' });
  out.fileAfter = after.status === 200 ? await after.text() : ('status ' + after.status);
  out.fileUntouched = out.fileAfter === body;
  return JSON.stringify(out);
})()
