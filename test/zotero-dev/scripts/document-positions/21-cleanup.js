/**
 * Item 10's restoration, in the order that keeps it: the failure window waited
 * out and a last sync let through so the file carries this machine's own item,
 * both fixture tabs closed, the run's PDF attachment erased, and only then the
 * crafted items deleted from the file — nothing may sync after that, or a
 * download would carry them back. params.keepIds: the ids to leave in place.
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
  // 1. Out of the 60 s failure window, so the closes below really sync
  await new Promise((r) => setTimeout(r, p.windowWaitMs ?? 62000));
  out.steps.push('waited out the failure window');

  // 2. The fixture's tab closed (the brief leaves it closed for the phone)
  if (s.fixture?.tabID && win.Zotero_Tabs._tabs.some((t) => t.id === s.fixture.tabID)) {
    win.Zotero_Tabs.close(s.fixture.tabID);
    out.steps.push('closed the fixture tab');
    await new Promise((r) => setTimeout(r, 4000));
  }
  out.afterFixtureClose = await idle(20000);

  // 3. The run's PDF: tab closed and the attachment erased
  if (s.pdf?.tabID && win.Zotero_Tabs._tabs.some((t) => t.id === s.pdf.tabID)) {
    win.Zotero_Tabs.close(s.pdf.tabID);
    out.steps.push('closed the pdf tab');
    await new Promise((r) => setTimeout(r, 3000));
  }
  if (s.pdf?.itemID) {
    const item = Zotero.Items.get(s.pdf.itemID);
    if (item) { await item.eraseTx(); out.steps.push('erased the pdf attachment ' + s.pdf.itemID); }
  }
  await new Promise((r) => setTimeout(r, 4000));
  out.afterPdfErase = await idle(20000);
  out.sharedBeforeEdit = out.afterPdfErase;

  // 4. Only now the crafted items leave the file
  const g = await fetch(url + 'xujialiu-positions.json', { method: 'GET', headers: { Authorization: auth }, cache: 'no-store' });
  out.getStatus = g.status;
  if (g.status !== 200) return JSON.stringify(out);
  const file = JSON.parse(await g.text());
  out.itemsBefore = file.items.map((i) => i.id.slice(7, 15) + '… ' + i.format + ' ' + i.stamp.device);
  const keep = new Set(p.keepIds ?? []);
  const kept = file.items.filter((i) => keep.has(i.id)).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  out.removed = file.items.filter((i) => !keep.has(i.id)).map((i) => i.id.slice(7, 15) + '… ' + i.format + ' ' + i.stamp.device);
  const body = JSON.stringify({ format: file.format, version: file.version, items: kept });
  const put = await fetch(url + 'xujialiu-positions.json', { method: 'PUT', headers: { Authorization: auth, 'Content-Type': 'application/json' }, body, cache: 'no-store' });
  out.putStatus = put.status;
  const g2 = await fetch(url + 'xujialiu-positions.json', { method: 'GET', headers: { Authorization: auth }, cache: 'no-store' });
  const text2 = await g2.text();
  out.finalBytes = text2.length;
  out.finalCanonical = text2 === body;
  out.finalFile = JSON.parse(text2);
  out.tabsLeft = win.Zotero_Tabs._tabs.map((t) => t.id + ' ' + String(t.title || '').slice(0, 34));
  return JSON.stringify(out);
})()
