/**
 * The place the desktop leaves for the phone: a last few seconds read aloud,
 * paused, and the quiet-period sync waited out so the server file carries this
 * machine's own item for the fixture. Reports the sentence and the item.
 * Reads state.fixture.
 */
(async () => {
  const p = Zotero.ZoteroTTSRun.params;
  const f = Zotero.ZoteroTTSRun.state.fixture;
  const out = {};
  const waive = (v) => { try { return Components.utils.waiveXrays(v) ?? v; } catch { return v; } };
  const win = Zotero.getMainWindow();
  win.Zotero_Tabs.select(f.tabID);
  win.focus();
  await new Promise((r) => setTimeout(r, 400));
  const reader = Zotero.Reader._readers.find((x) => x.tabID === f.tabID);
  const m = () => reader?._internalReader?._readAloudManager ?? null;
  out.before = { active: m()?.active ?? null, paused: m()?.paused ?? null };
  if (m() && m().paused) reader._internalReader.toggleReadAloudPaused();
  await new Promise((r) => setTimeout(r, 3200));
  if (m() && !m().paused) reader._internalReader.toggleReadAloudPaused(true);
  await new Promise((r) => setTimeout(r, 800));
  const seg = waive(m())?.activeSegment ?? null;
  out.activeSegmentText = seg && typeof seg.text === 'string' ? seg.text : null;
  out.after = { active: m()?.active ?? null, paused: m()?.paused ?? null };
  // The pause sends both files up after ten quiet seconds (spec 6.8)
  await new Promise((r) => setTimeout(r, 13500));
  const d = JSON.parse(await Zotero.ZoteroTTS.diagnostics.position());
  out.row = d.readers.find((x) => x.itemID === f.itemID) ?? null;
  const s = JSON.parse(await Zotero.ZoteroTTS.diagnostics.positionSync());
  out.sharedTransport = s.shared.transport;
  out.documents = s.shared.documents;
  const pref = (n) => Zotero.Prefs.get('zotero-tts.' + n);
  const url = String(pref('webdav.url') || '').trim().replace(/\/+$/, '') + '/';
  const bytes = new TextEncoder().encode(String(pref('webdav.username') || '') + ':' + String(pref('webdav.password') || ''));
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  const auth = 'Basic ' + btoa(binary);
  const g = await fetch(url + 'xujialiu-positions.json', { method: 'GET', headers: { Authorization: auth }, cache: 'no-store' });
  const file = JSON.parse(await g.text());
  out.fixtureItem = file.items.find((i) => i.id === p.expectedDocumentId) ?? null;
  out.itemIds = file.items.map((i) => i.id.slice(7, 15) + '… ' + i.format + ' ' + i.stamp.device);
  return JSON.stringify(out);
})()
