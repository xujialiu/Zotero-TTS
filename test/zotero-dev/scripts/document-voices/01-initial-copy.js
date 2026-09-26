(async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const waitFor = async (test, ms = 24000, step = 150) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const value = test();
      if (value) return value;
      await sleep(step);
    }
    return test();
  };
  const readers = () => Zotero.Reader?._readers || [];
  const open = async fixture => {
    const result = Zotero.Reader.open(fixture.itemID);
    if (result && typeof result.then === 'function') await result;
    const reader = await waitFor(() => {
      const list = readers();
      for (let i = 0; i < list.length; i++) {
        if (list[i]?.itemID === fixture.itemID && list[i]?._internalReader?._readAloudManager) return list[i];
      }
      return null;
    });
    if (!reader) throw new Error(`reader did not initialize for ${fixture.kind}`);
    return reader;
  };
  const diag = async () => JSON.parse(await Zotero.ZoteroTTS.diagnostics.documentVoices());
  const getReader = (report, itemID) => report.readers.find(reader => readers().some(r => r?.itemID === itemID && reader.key));
  if (!state.fixtures?.A || !state.fixtures?.B || !state.voices?.A) throw new Error('baseline state missing');
  const opened = {};
  const existing = readers();
  if (existing.length && existing.some(reader => ![state.fixtures.A.itemID, state.fixtures.B.itemID].includes(reader?.itemID))) {
    throw new Error(`unexpected owner reader before initial copy: ${existing.length}`);
  }
  opened.A = existing.find(reader => reader?.itemID === state.fixtures.A.itemID) || await open(state.fixtures.A);
  opened.B = existing.find(reader => reader?.itemID === state.fixtures.B.itemID) || await open(state.fixtures.B);
  await sleep(400);
  const report = await diag();
  const byItem = {};
  for (const fixture of [state.fixtures.A, state.fixtures.B]) {
    const reader = readers().find(r => r?.itemID === fixture.itemID);
    const entry = report.readers.find(r => r.key && r.key.endsWith('/' + fixture.key));
    if (!reader || !entry) throw new Error(`document diagnostic omitted ${fixture.kind} ${fixture.key}`);
    byItem[fixture.kind] = { itemID: fixture.itemID, tabID: reader.tabID || null, diagnostic: entry };
  }
  state.readers = { A: byItem.pdf, B: byItem.epub };
  const records = Object.values(report.records || {});
  const valid = Object.values(byItem).every(entry => entry.diagnostic.saved?.voice?.id === state.voices.A.id && entry.diagnostic.saved.manual === false && !entry.diagnostic.active);
  const keysDistinct = byItem.pdf.diagnostic.key !== byItem.epub.diagnostic.key;
  if (!valid || !keysDistinct) throw new Error(`initial records mismatch: ${JSON.stringify({byItem, defaultVoice: report.defaultVoice})}`);
  return JSON.stringify({
    status: 'PASS', defaultVoice: report.defaultVoice, records: report.records,
    readers: byItem, keysDistinct, recordCount: records.length,
    activeSessions: Object.values(byItem).filter(entry => entry.diagnostic.active).length,
  }, null, 1);
})();
