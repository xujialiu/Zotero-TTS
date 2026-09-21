/**
 * The run's PDF: imported and opened, which is the tab event that pokes both
 * transports (spec 6.8) — and the document item 12's second half needs, an
 * attachment with no Document Id. params.pdfPath, params.pdfTitle.
 * Leaves state.pdf { itemID, tabID }.
 */
(async () => {
  const p = Zotero.ZoteroTTSRun.params;
  const out = {};
  let item = Zotero.ZoteroTTSRun.state.pdf ? Zotero.Items.get(Zotero.ZoteroTTSRun.state.pdf.itemID) : null;
  if (!item) {
    item = await Zotero.Attachments.importFromFile({ file: p.pdfPath, libraryID: Zotero.Libraries.userLibraryID, title: p.pdfTitle });
  }
  out.itemID = item.id;
  out.key = item.key;
  out.contentType = item.attachmentContentType;
  const before = JSON.parse(await Zotero.ZoteroTTS.diagnostics.positionSync());
  out.beforeAdopted = { transport: before.shared.transport.adopted, documents: before.shared.documents.adopted };
  const reader = await Zotero.Reader.open(item.id);
  const started = Date.now();
  while (Date.now() - started < 24000) {
    if (reader?._internalReader && reader._internalReader._readAloudManager) break;
    await new Promise((r) => setTimeout(r, 700));
  }
  out.tabID = reader?.tabID ?? null;
  out.readyMs = Date.now() - started;
  Zotero.ZoteroTTSRun.state.pdf = { itemID: item.id, tabID: out.tabID, key: item.key };
  // the poke is scheduled; give the single-flight its run
  await new Promise((r) => setTimeout(r, 3000));
  const after = JSON.parse(await Zotero.ZoteroTTS.diagnostics.positionSync());
  out.afterAdopted = { transport: after.shared.transport.adopted, documents: after.shared.documents.adopted };
  out.sharedTransport = after.shared.transport;
  out.documents = after.shared.documents;
  const debug = String(await Zotero.Debug.get());
  out.sharedLines = debug.split('\n').filter((l) => l.indexOf('shared position sync') !== -1).slice(-3).map((l) => l.slice(l.indexOf('[zotero-tts]')));
  return JSON.stringify(out);
})()
