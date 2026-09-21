/**
 * Item 10's restoration for a run that opened TWO fresh EPUB fixtures
 * (issue #129's items 13 and 14 each need their own — 21-cleanup.js
 * assumes one). Closes state.fixture14 / state.fixture13 / state.pdf's
 * tabs, erases all three attachments, waits for the closes' syncs to
 * settle, then removes ONLY params.removeIds from the server file —
 * a deny-list, not 21-cleanup.js's allow-list: the owner's own devices
 * may add or change items while this run is live (observed 2026-09-22,
 * the owner read "Four Thousand Weeks" mid-run), so nothing is kept by
 * enumerating it in advance. Everything else in the file, including any
 * item item 8 derived, is left exactly as found.
 * params: removeIds (document ids to delete).
 */
(async () => {
  const p = Zotero.ZoteroTTSRun.params;
  const s = Zotero.ZoteroTTSRun.state;
  const out = { steps: [] };
  const pref = (n) => Zotero.Prefs.get('zotero-tts.' + n);
  const url = String(pref('webdav.url') || '').trim().replace(/\/+$/, '') + '/';
  const bytes = new TextEncoder().encode(String(pref('webdav.username') || '') + ':' + String(pref('webdav.password') || ''));
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  const auth = 'Basic ' + btoa(binary);
  const win = Zotero.getMainWindow();
  const idle = async (ms) => {
    const t = Date.now();
    while (Date.now() - t < ms) {
      const d = JSON.parse(await Zotero.ZoteroTTS.diagnostics.positionSync());
      if (!d.shared.transport.running) return d.shared.transport;
      await new Promise((r) => setTimeout(r, 500));
    }
    return null;
  };

  for (const key of ['fixture14', 'fixture13', 'pdf']) {
    const rec = s[key];
    if (rec?.tabID && win.Zotero_Tabs._tabs.some((t) => t.id === rec.tabID)) {
      win.Zotero_Tabs.close(rec.tabID);
      out.steps.push('closed ' + key + ' tab ' + rec.tabID);
      await new Promise((r) => setTimeout(r, 2500));
    }
  }
  out.afterCloses = await idle(20000);

  for (const key of ['fixture14', 'fixture13', 'pdf']) {
    const rec = s[key];
    if (rec?.itemID) {
      const item = Zotero.Items.get(rec.itemID);
      if (item) {
        await item.eraseTx();
        out.steps.push('erased ' + key + ' attachment ' + rec.itemID);
      }
    }
  }
  await new Promise((r) => setTimeout(r, 4000));
  out.afterErase = await idle(20000);

  const g = await fetch(url + 'xujialiu-positions.json', { method: 'GET', headers: { Authorization: auth }, cache: 'no-store' });
  out.getStatus = g.status;
  if (g.status !== 200) return JSON.stringify(out);
  const file = JSON.parse(await g.text());
  out.itemsBefore = file.items.map((i) => i.id.slice(0, 14) + '… ' + i.format + ' ' + i.stamp.device);
  const remove = new Set(p.removeIds ?? []);
  const kept = file.items.filter((i) => !remove.has(i.id)).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  out.removed = file.items.filter((i) => remove.has(i.id)).map((i) => i.id.slice(0, 14) + '… ' + i.format + ' ' + i.stamp.device);
  const body = JSON.stringify({ format: file.format, version: file.version, items: kept });
  const put = await fetch(url + 'xujialiu-positions.json', { method: 'PUT', headers: { Authorization: auth, 'Content-Type': 'application/json' }, body, cache: 'no-store' });
  out.putStatus = put.status;
  const g2 = await fetch(url + 'xujialiu-positions.json', { method: 'GET', headers: { Authorization: auth }, cache: 'no-store' });
  const text2 = await g2.text();
  out.finalBytes = text2.length;
  out.finalCanonical = text2 === body;
  out.finalItemIds = JSON.parse(text2).items.map((i) => i.id.slice(0, 14) + '…');
  out.tabsLeft = win.Zotero_Tabs._tabs.map((t) => t.id + ' ' + String(t.title || '').slice(0, 40));
  return JSON.stringify(out);
})()
