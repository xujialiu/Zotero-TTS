/**
 * Item 10's restoration for items 15 and 8 (issue #138): closes and erases
 * every fixture named in params.stateKeys (B, its block-harvest helper, C,
 * the PDF poke), waits for the closes'/erases' syncs to settle, then —
 * a deny-list, not an allow-list, safe against a concurrent device's own
 * writes (34-cleanup-two-fixtures.js's rule) — removes params.removeIds
 * (the Document Ids items 15/8 introduced) from the shared file
 * (xujialiu-positions.json) and confirms the native file
 * (zotero-tts-positions.json) has no row left for any erased attachment —
 * erasing an attachment tombstones its own native row automatically
 * (index.ts's deletion observer; case file item 10), so this only verifies
 * and reports, never force-rewrites that file. When a file's own item count
 * reaches params.expectEmptyIfZero for a file that was 404 before this run,
 * it is DELETEd outright, restoring "absent" (the brief's own instruction);
 * otherwise it is left with only the deny-listed ids gone.
 * params: stateKeys (string[]), removeIds (Document Ids to strip from the
 * shared file), deleteSharedFileIfEmpty (bool), deleteNativeFileIfEmpty (bool).
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
      if (!d.transport.running && !d.shared.transport.running) return { nativeRunning: d.transport.running, sharedRunning: d.shared.transport.running };
      await new Promise((r) => setTimeout(r, 500));
    }
    return { timedOut: true };
  };

  const keys = p.stateKeys || [];
  const erasedAttachments = [];
  for (const key of keys) {
    const rec = s[key];
    if (rec && rec.tabID && win.Zotero_Tabs._tabs.some((t) => t.id === rec.tabID)) {
      win.Zotero_Tabs.close(rec.tabID);
      out.steps.push('closed ' + key + ' tab ' + rec.tabID);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  out.afterCloses = await idle(20000);

  for (const key of keys) {
    const rec = s[key];
    if (rec && rec.itemID) {
      const item = Zotero.Items.get(rec.itemID);
      if (item) {
        erasedAttachments.push({ key, lib: rec.lib, itemKey: rec.key });
        await item.eraseTx();
        out.steps.push('erased ' + key + ' attachment ' + rec.itemID);
      }
    }
  }
  await new Promise((r) => setTimeout(r, 4000));
  out.afterErase = await idle(20000);
  out.erasedAttachments = erasedAttachments;

  // Shared file (xujialiu-positions.json): deny-list removal of the Document
  // Ids this run introduced
  const gs = await fetch(url + 'xujialiu-positions.json', { method: 'GET', headers: { Authorization: auth }, cache: 'no-store' });
  out.sharedGetStatus = gs.status;
  if (gs.status === 200) {
    const file = JSON.parse(await gs.text());
    out.sharedItemsBefore = file.items.map((i) => i.id.slice(0, 14) + '… ' + i.format + ' ' + i.stamp.device + ' ' + i.stamp.at);
    const remove = new Set(p.removeIds || []);
    const kept = file.items.filter((i) => !remove.has(i.id)).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    out.sharedRemoved = file.items.filter((i) => remove.has(i.id)).map((i) => i.id.slice(0, 14) + '… ' + i.format + ' ' + i.stamp.device);
    if (kept.length === 0 && p.deleteSharedFileIfEmpty) {
      const del = await fetch(url + 'xujialiu-positions.json', { method: 'DELETE', headers: { Authorization: auth } });
      out.sharedDeleteStatus = del.status;
    } else {
      const body = JSON.stringify({ format: file.format, version: file.version, items: kept });
      const put = await fetch(url + 'xujialiu-positions.json', { method: 'PUT', headers: { Authorization: auth, 'Content-Type': 'application/json' }, body, cache: 'no-store' });
      out.sharedPutStatus = put.status;
      out.sharedItemsAfter = kept.length;
    }
  }

  // Native file (zotero-tts-positions.json): verify the erase's own
  // tombstone already dropped every row this run crafted or touched — never
  // force-rewritten here
  const gn = await fetch(url + 'zotero-tts-positions.json', { method: 'GET', headers: { Authorization: auth }, cache: 'no-store' });
  out.nativeGetStatus = gn.status;
  if (gn.status === 200) {
    const nfile = JSON.parse(await gn.text());
    const remaining = nfile.items.filter((i) => erasedAttachments.some((e) => e.lib === i.lib && e.itemKey === i.key));
    out.nativeRemainingForErased = remaining;
    out.nativeItemsAfter = nfile.items.length;
    if (nfile.items.length === 0 && p.deleteNativeFileIfEmpty) {
      const del = await fetch(url + 'zotero-tts-positions.json', { method: 'DELETE', headers: { Authorization: auth } });
      out.nativeDeleteStatus = del.status;
    }
  }

  out.tabsLeft = win.Zotero_Tabs._tabs.map((t) => t.id + ' ' + String(t.title || '').slice(0, 40));
  return JSON.stringify(out, null, 1);
})();
