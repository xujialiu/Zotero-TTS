/**
 * A document already in the library, opened by item id: the fixture of a
 * cross-product run is found, not imported (params.openItemID, params.openKey
 * to prove it is the right attachment). The rulebook's poll for
 * `_internalReader` and `_readAloudManager`, the session read so the caller
 * knows whether 12-close-popup.js is needed, then the reader-open poke waited
 * out on `running === false` and a risen `lastAt` — the stats are only that
 * sync's once the single-flight has let go (2026-09-21). Leaves
 * state.fixture { itemID, lib, key, tabID }.
 */
(async () => {
  const p = Zotero.ZoteroTTSRun.params;
  const s = Zotero.ZoteroTTSRun.state;
  const out = {};
  const item = Zotero.Items.get(p.openItemID);
  out.item = item
    ? { id: item.id, lib: item.libraryID, key: item.key, contentType: item.attachmentContentType, title: (item.parentItem ?? item).getField('title') }
    : null;
  out.keyMatches = !p.openKey || (item && item.key === p.openKey);
  if (!item || !out.keyMatches) return JSON.stringify(out);
  const before = JSON.parse(await Zotero.ZoteroTTS.diagnostics.positionSync());
  out.before = { documents: before.shared.documents, transport: before.shared.transport };
  const lineCount = async () => String(await Zotero.Debug.get()).split('\n').filter((l) => l.indexOf('[zotero-tts]') !== -1).length;
  const seen = await lineCount();
  const win = Zotero.getMainWindow();
  const open = win.Zotero_Tabs._tabs.find((t) => t.data && t.data.itemID === item.id);
  out.reusedTab = open ? open.id : null;
  const reader = open ? Zotero.Reader._readers.find((x) => x.tabID === open.id) : await Zotero.Reader.open(item.id);
  const started = Date.now();
  let internal = null;
  let manager = null;
  while (Date.now() - started < 24000) {
    internal = reader?._internalReader ?? null;
    manager = internal?._readAloudManager ?? null;
    if (internal && manager) break;
    await new Promise((r) => setTimeout(r, 700));
  }
  out.ready = !!(internal && manager);
  out.readyMs = Date.now() - started;
  out.tabID = reader?.tabID ?? null;
  out.session = { active: manager?.active ?? null, paused: manager?.paused ?? null };
  s.fixture = { itemID: item.id, lib: item.libraryID, key: item.key, tabID: out.tabID };
  const settle = Date.now();
  let after = before;
  while (Date.now() - settle < 25000) {
    after = JSON.parse(await Zotero.ZoteroTTS.diagnostics.positionSync());
    if (after.shared.transport.running === false && (after.shared.transport.lastAt ?? 0) > (before.shared.transport.lastAt ?? 0)) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  out.settledMs = Date.now() - settle;
  out.after = { documents: after.shared.documents, transport: after.shared.transport };
  const lines = String(await Zotero.Debug.get()).split('\n').filter((l) => l.indexOf('[zotero-tts]') !== -1).map((l) => l.slice(l.indexOf('[zotero-tts]')));
  out.newLines = lines.slice(seen);
  return JSON.stringify(out);
})()
