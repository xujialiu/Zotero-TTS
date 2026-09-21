/**
 * The Document Id the plugin named the fixture with, and the id line it
 * logged, against the id computed outside Zotero (params.expectedDocumentId).
 * Reads state.fixture.
 */
(async () => {
  const p = Zotero.ZoteroTTSRun.params;
  const f = Zotero.ZoteroTTSRun.state.fixture;
  const out = { fixture: f };
  const sync = JSON.parse(await Zotero.ZoteroTTS.diagnostics.positionSync());
  out.documents = sync.shared.documents;
  out.transport = sync.shared.transport;
  const debug = String(await Zotero.Debug.get());
  const lines = debug.split('\n').filter((l) => l.indexOf('[zotero-tts]') !== -1);
  const mine = `document id for ${f.lib}/${f.key}:`;
  out.idLine = lines.filter((l) => l.indexOf(mine) !== -1).map((l) => l.slice(l.indexOf('[zotero-tts]')));
  out.sharedSync = lines.filter((l) => l.indexOf('shared position sync') !== -1).slice(-4).map((l) => l.slice(l.indexOf('[zotero-tts]')));
  out.expectedDocumentId = p.expectedDocumentId;
  return JSON.stringify(out);
})()
