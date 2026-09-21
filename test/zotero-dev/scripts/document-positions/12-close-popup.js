/**
 * The fixture's own Read Aloud session closed, so the next Shift+Space takes
 * the idle branch (ui/read-aloud-shortcuts.ts:340) — the resume path items 5
 * and 6 are about — and the quiet-period sync after the stop has run.
 * Reads state.fixture.
 */
(async () => {
  const f = Zotero.ZoteroTTSRun.state.fixture;
  const out = {};
  const reader = Zotero.Reader._readers.find((x) => x.tabID === f.tabID);
  const m = () => reader?._internalReader?._readAloudManager ?? null;
  out.before = { active: m()?.active ?? null, paused: m()?.paused ?? null };
  reader._internalReader.toggleReadAloudPopup(false);
  await new Promise((r) => setTimeout(r, 1200));
  out.after = { active: m()?.active ?? null, paused: m()?.paused ?? null };
  // The stop schedules both files ten quiet seconds later (spec 6.8)
  await new Promise((r) => setTimeout(r, 13000));
  const d = JSON.parse(await Zotero.ZoteroTTS.diagnostics.position());
  const row = d.readers.find((x) => x.itemID === f.itemID) ?? null;
  out.row = row;
  const s = JSON.parse(await Zotero.ZoteroTTS.diagnostics.positionSync());
  out.shared = { transport: s.shared.transport, documents: s.shared.documents };
  const debug = String(await Zotero.Debug.get());
  out.tail = debug.split('\n').filter((l) => l.indexOf('[zotero-tts]') !== -1).slice(-5).map((l) => l.slice(l.indexOf('[zotero-tts]')));
  return JSON.stringify(out);
})()
