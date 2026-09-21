/**
 * The fixture's leaf blocks as Zotero indexes them — `_sdt.mapper._blockEntries`,
 * reached through `waiveXrays` because the mapper crosses as an Xray — so a
 * crafted item can name a real later paragraph and quote its second sentence.
 * Reads state.fixture; leaves state.blocks.
 */
(async () => {
  const f = Zotero.ZoteroTTSRun.state.fixture;
  const waive = (v) => { try { return Components.utils.waiveXrays(v) ?? v; } catch { return v; } };
  const reader = Zotero.Reader._readers.find((x) => x.tabID === f.tabID);
  const sdt = await reader._internalReader._loadSDT();
  const mapper = waive(sdt.mapper);
  const entries = mapper._blockEntries;
  const out = { count: entries.length, blocks: [] };
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const ref = [];
    if (e.ref) for (let j = 0; j < e.ref.length; j++) ref.push(e.ref[j]);
    out.blocks.push({ i, ref, path: String(e.path ?? ''), text: String(e.text ?? '').slice(0, 90) });
  }
  // The block texts as the capture reads them, from the structure itself
  Zotero.ZoteroTTSRun.state.blocks = out.blocks;
  return JSON.stringify(out);
})()
