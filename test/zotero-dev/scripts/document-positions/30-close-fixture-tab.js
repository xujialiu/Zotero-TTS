/**
 * The end of a run whose fixture is a document the library already held: the
 * tab closed and nothing erased — 21-cleanup.js and 27-cleanup-beta6.js both
 * delete what their run imported, which a cross-product run must not do. The
 * close is itself a poke (spec 6.8), so its sync is waited out on
 * `running === false` and a risen `lastAt`, and the file is read once more so
 * the report ends on what the server actually holds. Reads state.fixture.
 */
(async () => {
  const p = Zotero.ZoteroTTSRun.params;
  const s = Zotero.ZoteroTTSRun.state;
  const out = {};
  const stats = async () => JSON.parse(await Zotero.ZoteroTTS.diagnostics.positionSync());
  const before = await stats();
  out.before = { transport: before.shared.transport, documents: before.shared.documents };
  const win = Zotero.getMainWindow();
  const f = s.fixture;
  const reader = Zotero.Reader._readers.find((x) => x.tabID === f?.tabID);
  const m = reader?._internalReader?._readAloudManager ?? null;
  out.session = { active: m?.active ?? null, paused: m?.paused ?? null };
  if (f?.tabID && win.Zotero_Tabs._tabs.some((t) => t.id === f.tabID)) {
    win.Zotero_Tabs.close(f.tabID);
    out.closed = f.tabID;
  } else {
    out.closed = null;
  }
  await new Promise((r) => setTimeout(r, 1200));
  out.tabsLeft = win.Zotero_Tabs._tabs.map((t) => t.id);
  const settle = Date.now();
  let after = before;
  while (Date.now() - settle < 25000) {
    after = await stats();
    if (after.shared.transport.running === false && (after.shared.transport.lastAt ?? 0) > (before.shared.transport.lastAt ?? 0)) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  out.settledMs = Date.now() - settle;
  out.after = { transport: after.shared.transport, documents: after.shared.documents };
  const debug = String(await Zotero.Debug.get());
  out.sharedLines = debug.split('\n').filter((l) => l.indexOf('shared position sync') !== -1).slice(-2).map((l) => l.slice(l.indexOf('[zotero-tts]')));
  const pref = (n) => Zotero.Prefs.get('zotero-tts.' + n);
  const url = String(pref('webdav.url') || '').trim().replace(/\/+$/, '') + '/';
  const bytes = new TextEncoder().encode(String(pref('webdav.username') || '') + ':' + String(pref('webdav.password') || ''));
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  const auth = 'Basic ' + btoa(binary);
  const g = await fetch(url + 'xujialiu-positions.json', { method: 'GET', headers: { Authorization: auth }, cache: 'no-store' });
  out.fileStatus = g.status;
  const text = g.status === 200 ? await g.text() : null;
  if (text !== null) {
    const parsed = JSON.parse(text);
    out.fileBytes = text.length;
    out.items = parsed.items.map((i) => i.id.slice(7, 15) + '… ' + i.format + ' ' + i.stamp.device + ' @' + i.stamp.at + ' ' + i.locator);
    out.fixtureItem = parsed.items.find((i) => i.id === p.expectedDocumentId) ?? null;
    if (typeof s.positionsBefore === 'string') {
      const was = JSON.parse(s.positionsBefore);
      const byId = new Map(was.items.map((i) => [i.id, JSON.stringify(i)]));
      out.unchangedSinceBefore = parsed.items.filter((i) => byId.get(i.id) === JSON.stringify(i)).map((i) => i.id.slice(7, 15) + '…');
    }
  }
  return JSON.stringify(out);
})()
