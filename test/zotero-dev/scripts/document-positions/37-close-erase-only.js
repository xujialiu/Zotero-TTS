/**
 * Final cleanup for a run whose ONE imported fixture must be closed and its
 * attachment erased, but the server file must NOT be touched by hand this
 * time (issue #129's genuine-phone run: the plugin's own store still holds
 * the document's row and item after the erase — by design — and would
 * re-emit them at the next sync, so a hand delete only churns the file).
 * Unlike 21-cleanup.js / 34-cleanup-two-fixtures.js, this never PUTs the
 * file: it closes state.fixture's tab, erases its attachment, waits for
 * the close's own syncs (`position sync (reader-close)` /
 * `shared position sync (reader-close)`) to settle, then reads the file
 * read-only — bytes, SHA-256, item count, the fixture's own item — and
 * diffs every item against state.positionsBefore when present, so "the
 * other items are byte-identical to what the run found" is a reading, not
 * an eyeball. params: expectedDocumentId. Reads state.fixture.
 */
(async () => {
  const p = Zotero.ZoteroTTSRun.params;
  const s = Zotero.ZoteroTTSRun.state;
  const out = { steps: [] };
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

  out.before = JSON.parse(await Zotero.ZoteroTTS.diagnostics.positionSync()).shared;

  const f = s.fixture;
  if (f?.tabID && win.Zotero_Tabs._tabs.some((t) => t.id === f.tabID)) {
    win.Zotero_Tabs.close(f.tabID);
    out.steps.push('closed the fixture tab ' + f.tabID);
    await new Promise((r) => setTimeout(r, 2500));
  } else {
    out.steps.push('fixture tab already gone');
  }
  out.afterClose = await idle(20000);

  if (f?.itemID) {
    const item = Zotero.Items.get(f.itemID);
    if (item) {
      await item.eraseTx();
      out.steps.push('erased the fixture attachment ' + f.itemID);
    } else {
      out.steps.push('fixture attachment already gone');
    }
  }
  await new Promise((r) => setTimeout(r, 2500));
  out.afterErase = await idle(20000);

  out.documentsAfter = JSON.parse(await Zotero.ZoteroTTS.diagnostics.positionSync()).shared.documents;

  // Read-only from here: no PUT, ever, in this script
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
    const parsed = JSON.parse(text);
    out.fileBytes = text.length;
    try {
      const d = await Zotero.getMainWindow().crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
      out.sha256 = Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, '0')).join('');
    } catch (e) {
      out.sha256 = 'n/a: ' + String(e);
    }
    out.itemCount = parsed.items.length;
    out.fixtureItem = parsed.items.find((i) => i.id === p.expectedDocumentId) ?? null;
    const short = (i) => i.id.slice(7, 15) + '…';
    if (typeof s.positionsBefore === 'string') {
      const was = JSON.parse(s.positionsBefore);
      const byId = new Map(was.items.map((i) => [i.id, JSON.stringify(i)]));
      out.diff = {
        changed: parsed.items.filter((i) => byId.get(i.id) !== JSON.stringify(i)).map(short),
        unchanged: parsed.items.filter((i) => byId.get(i.id) === JSON.stringify(i)).map(short),
        gone: was.items.filter((i) => !parsed.items.some((j) => j.id === i.id)).map(short),
      };
    }
  }
  out.tabsLeft = win.Zotero_Tabs._tabs.map((t) => t.id + ' ' + String(t.title || '').slice(0, 40));
  return JSON.stringify(out);
})()
