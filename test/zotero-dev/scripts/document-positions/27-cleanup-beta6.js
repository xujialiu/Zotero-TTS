/**
 * The restoration of a run that crafted nothing: the run's PDF tab closed and
 * its attachment erased, the syncs let settle, and the Positions File read one
 * last time — every item in it is genuine, so nothing is deleted from it here
 * (contrast 21-cleanup.js, which removes crafted ids). Reports the tabs left
 * and the file as the owner keeps it. Reads state.pdf; params.expectIds.
 */
(async () => {
  const p = Zotero.ZoteroTTSRun.params;
  const s = Zotero.ZoteroTTSRun.state;
  const out = { steps: [] };
  const win = Zotero.getMainWindow();
  const idle = async (ms) => {
    const t = Date.now();
    while (Date.now() - t < ms) {
      const d = JSON.parse(Zotero.ZoteroTTS.diagnostics.positionSync());
      if (!d.shared.transport.running) return d.shared.transport;
      await new Promise((r) => setTimeout(r, 500));
    }
    return null;
  };
  if (s.pdf && s.pdf.tabID && win.Zotero_Tabs._tabs.some((t) => t.id === s.pdf.tabID)) {
    win.Zotero_Tabs.close(s.pdf.tabID);
    out.steps.push('closed the pdf tab');
    await new Promise((r) => setTimeout(r, 3000));
  }
  if (s.pdf && s.pdf.itemID) {
    const item = Zotero.Items.get(s.pdf.itemID);
    if (item) {
      await item.eraseTx();
      out.steps.push('erased the pdf attachment ' + s.pdf.itemID);
    }
  }
  await new Promise((r) => setTimeout(r, 4000));
  out.transport = await idle(20000);
  const ps = JSON.parse(Zotero.ZoteroTTS.diagnostics.positionSync());
  out.documents = ps.shared.documents;
  out.own = { lastOutcome: ps.transport.lastOutcome, lastError: ps.transport.lastError, uploaded: ps.transport.uploaded, dropped: ps.transport.dropped };

  const pref = (n) => Zotero.Prefs.get('zotero-tts.' + n);
  const url = String(pref('webdav.url') || '').trim().replace(/\/+$/, '') + '/';
  const bytes = new TextEncoder().encode(String(pref('webdav.username') || '') + ':' + String(pref('webdav.password') || ''));
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  const auth = 'Basic ' + btoa(binary);
  const g = await fetch(url + 'xujialiu-positions.json', { method: 'GET', headers: { Authorization: auth }, cache: 'no-store' });
  out.fileStatus = g.status;
  if (g.status === 200) {
    const text = await g.text();
    const file = JSON.parse(text);
    out.fileBytes = text.length;
    out.fileCanonical = text === JSON.stringify({ format: file.format, version: file.version, items: file.items });
    out.fileItems = file.items.map((i) => i.id.slice(0, 14) + '… ' + i.format + ' ' + i.stamp.device + ' ' + i.stamp.at + ' ' + i.locator);
    const want = p.expectIds || [];
    out.allExpectedPresent = want.every((id) => file.items.some((i) => i.id === id));
    const fixture = file.items.find((i) => i.id === p.fixtureDocumentId) || null;
    out.fixtureItem = fixture;
  }
  out.tabsLeft = win.Zotero_Tabs._tabs.map((t) => t.id + ' ' + String(t.title || '').slice(0, 34));
  out.selected = win.Zotero_Tabs.selectedID;
  return JSON.stringify(out);
})()
