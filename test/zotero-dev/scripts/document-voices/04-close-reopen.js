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
  const fixture = state.fixtures?.A;
  if (!fixture || !state.voices?.B || !state.documentPick?.after) throw new Error('persistence state missing');
  const main = Zotero.getMainWindow?.();
  const current = () => (Zotero.Reader._readers || []).find(reader => reader?.itemID === fixture.itemID);
  const beforeReader = current();
  const beforeTabID = beforeReader?.tabID || null;
  if (!beforeReader) throw new Error('fixture A reader missing before close/reopen');
  if (beforeReader._internalReader?._readAloudManager?.active) beforeReader._internalReader.toggleReadAloudPopup(false);
  if (beforeReader._internalReader?._readAloudManager?.active) await waitFor(() => !beforeReader._internalReader?._readAloudManager?.active, 7000);
  if (main?.Zotero_Tabs?.close && beforeTabID) main.Zotero_Tabs.close(beforeTabID);
  await waitFor(() => !current(), 10000);
  const opened = Zotero.Reader.open(fixture.itemID);
  if (opened && typeof opened.then === 'function') await opened;
  const reader = await waitFor(() => current()?._internalReader?._readAloudManager ? current() : null, 24000);
  if (!reader) throw new Error('fixture A did not reopen');
  await sleep(400);
  const report = JSON.parse(await Zotero.ZoteroTTS.diagnostics.documentVoices());
  const entry = report.readers.find(value => value.key?.endsWith('/' + fixture.key));
  if (!entry || entry.key !== state.documentPick.key || entry.saved?.voice?.id !== state.voices.B.id || entry.saved.manual !== true || entry.active) {
    throw new Error(`close/reopen persistence mismatch: ${JSON.stringify({entry, expectedKey:state.documentPick.key, default:report.defaultVoice})}`);
  }
  state.readers.A.tabID = reader.tabID || null;
  state.persistence = { beforeTabID, afterTabID: reader.tabID || null, key: entry.key, saved: entry.saved, active: entry.active, paused: entry.paused };
  return JSON.stringify({ status: 'PASS', beforeTabID, afterTabID: reader.tabID || null, key: entry.key, saved: entry.saved, active: entry.active, paused: entry.paused, keyStable: entry.key === state.documentPick.key }, null, 1);
})();
