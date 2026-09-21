/**
 * Item 9's restoration, and the run's: the Positions File put back to the text
 * 14-version-2.js stashed (or to params.restoreText when one is given), then
 * the state cleared so nothing stale is restored twice.
 */
(async () => {
  const p = Zotero.ZoteroTTSRun.params;
  const out = {};
  const text = p.restoreText ?? Zotero.ZoteroTTSRun.state.positionsBefore;
  if (typeof text !== 'string') return JSON.stringify({ skipped: 'nothing stashed' });
  const pref = (n) => Zotero.Prefs.get('zotero-tts.' + n);
  const url = String(pref('webdav.url') || '').trim().replace(/\/+$/, '') + '/';
  const bytes = new TextEncoder().encode(String(pref('webdav.username') || '') + ':' + String(pref('webdav.password') || ''));
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  const auth = 'Basic ' + btoa(binary);
  const put = await fetch(url + 'xujialiu-positions.json', { method: 'PUT', headers: { Authorization: auth, 'Content-Type': 'application/json' }, body: text, cache: 'no-store' });
  out.putStatus = put.status;
  out.bytes = text.length;
  const get = await fetch(url + 'xujialiu-positions.json', { method: 'GET', headers: { Authorization: auth }, cache: 'no-store' });
  out.readBack = (await get.text()) === text;
  Zotero.ZoteroTTSRun.state.positionsBefore = null;
  return JSON.stringify(out);
})()
