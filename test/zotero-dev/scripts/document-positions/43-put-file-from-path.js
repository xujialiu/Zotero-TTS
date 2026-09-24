/**
 * Puts the bytes of a local file, read from params.sourcePath, as the
 * Positions File on the test WebDAV server -- unchanged, byte for byte. No
 * stash (28-file-snapshot.js's 'before' snapshot does that) and no sync poke
 * (16-single-poke.js / 09-tab-poke.js do that): this script's only job is
 * the PUT, so a third writer's file (or any other fixed text) can be staged
 * without a case-specific script. Reports the bytes sent and read back;
 * never the file's content.
 * params.sourcePath (absolute).
 */
(async () => {
  const p = Zotero.ZoteroTTSRun.params;
  const out = { sourcePath: p.sourcePath };
  const text = await IOUtils.readUTF8(p.sourcePath);
  out.bytes = text.length;
  const pref = (n) => Zotero.Prefs.get('zotero-tts.' + n);
  const url = String(pref('webdav.url') || '').trim().replace(/\/+$/, '') + '/';
  const bytes = new TextEncoder().encode(String(pref('webdav.username') || '') + ':' + String(pref('webdav.password') || ''));
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  const auth = 'Basic ' + btoa(binary);
  const put = await fetch(url + 'xujialiu-positions.json', { method: 'PUT', headers: { Authorization: auth, 'Content-Type': 'application/json' }, body: text, cache: 'no-store' });
  out.putStatus = put.status;
  const get = await fetch(url + 'xujialiu-positions.json', { method: 'GET', headers: { Authorization: auth }, cache: 'no-store' });
  const readBack = await get.text();
  out.readBackBytes = readBack.length;
  out.readBackIdentical = readBack === text;
  return JSON.stringify(out);
})()
