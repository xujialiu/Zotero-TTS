/**
 * Opens an EPUB (importing it first when params.stateKey names no state yet)
 * and captures the issue #129 naming sequence: "document id for lib/key:
 * ... bytes read, ... ms" (identifyAttachment, index.ts), then — only when
 * the id was not already known — "document named on open: lib/key", then
 * the reader-open sync's own "shared position sync (reader-open): N remote,
 * N merged, X adopted". Reader.open does not await any of this, so the
 * lines land asynchronously: polls ready the rulebook's way (≤7 s polls, a
 * ~24 s ceiling), then polls the debug log up to 20 s for the sync line.
 * Snapshots shared.documents immediately before opening and once the sync
 * line has appeared (or the poll gives up).
 * params: stateKey (reads/writes state[stateKey]); fixturePath/fixtureTitle
 * used only when state[stateKey] does not exist yet.
 * Leaves state[stateKey].tabID and state.fixture = state[stateKey], for the
 * generic scripts (06, 07, 13, 17, 18, 20) that read state.fixture.
 */
(async () => {
  const p = Zotero.ZoteroTTSRun.params;
  const s = Zotero.ZoteroTTSRun.state;
  const out = {};
  let rec = s[p.stateKey];
  if (!rec) {
    const item = await Zotero.Attachments.importFromFile({
      file: p.fixturePath,
      libraryID: Zotero.Libraries.userLibraryID,
      title: p.fixtureTitle,
    });
    rec = { itemID: item.id, lib: item.libraryID, key: item.key, tabID: null };
    s[p.stateKey] = rec;
  }
  out.itemID = rec.itemID;
  out.lib = rec.lib;
  out.key = rec.key;

  const linesNow = async () =>
    String(await Zotero.Debug.get()).split('\n').filter((l) => l.indexOf('[zotero-tts]') !== -1).map((l) => l.slice(l.indexOf('[zotero-tts]')));
  const mark = (await linesNow()).length;

  out.before = JSON.parse(await Zotero.ZoteroTTS.diagnostics.positionSync()).shared.documents;

  const reader = await Zotero.Reader.open(rec.itemID);
  const started = Date.now();
  let internal = null;
  let manager = null;
  const steps = [];
  while (Date.now() - started < 24000) {
    internal = reader?._internalReader ?? null;
    manager = internal?._readAloudManager ?? null;
    steps.push(`${Date.now() - started} ms internal=${!!internal} manager=${!!manager}`);
    if (internal && manager) break;
    await new Promise((r) => setTimeout(r, 700));
  }
  out.ready = !!(internal && manager);
  out.readyMs = Date.now() - started;
  rec.tabID = reader?.tabID ?? null;
  s[p.stateKey] = rec;
  s.fixture = rec;

  const idPrefix = `document id for ${rec.lib}/${rec.key}:`;
  const namedLine = `document named on open: ${rec.lib}/${rec.key}`;
  const waitStart = Date.now();
  let seen = [];
  while (Date.now() - waitStart < 20000) {
    seen = (await linesNow()).slice(mark);
    if (seen.some((l) => l.indexOf('shared position sync (reader-open)') !== -1)) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  out.waitedForSyncMs = Date.now() - waitStart;
  out.newLines = seen;
  out.idLine = seen.find((l) => l.indexOf(idPrefix) !== -1) ?? null;
  out.namedLine = seen.find((l) => l.indexOf(namedLine) !== -1) ?? null;
  out.readerOpenSyncLine = seen.find((l) => l.indexOf('shared position sync (reader-open)') !== -1) ?? null;
  out.order = {
    idIndex: seen.findIndex((l) => l.indexOf(idPrefix) !== -1),
    namedIndex: seen.findIndex((l) => l.indexOf(namedLine) !== -1),
    syncIndex: seen.findIndex((l) => l.indexOf('shared position sync (reader-open)') !== -1),
  };

  out.after = JSON.parse(await Zotero.ZoteroTTS.diagnostics.positionSync()).shared.documents;
  return JSON.stringify(out);
})()
