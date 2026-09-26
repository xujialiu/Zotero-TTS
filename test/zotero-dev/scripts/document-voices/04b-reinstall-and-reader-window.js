(async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const fixture = state.fixtures?.A;
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
  const find = predicate => readers().find(predicate);
  const report = async () => JSON.parse(await Zotero.ZoteroTTS.diagnostics.documentVoices());
  if (!fixture || !state.voices?.B || !state.persistence) throw new Error('post-install persistence state missing');
  const main = Zotero.getMainWindow?.();
  const live = await waitFor(() => find(reader => reader?.itemID === fixture.itemID && reader?._internalReader?._readAloudManager), 24000);
  if (!live) throw new Error('fixture A reader/manager did not recover after in-place install');
  const afterInstall = await report();
  const sameKey = afterInstall.readers.find(entry => entry.key?.endsWith('/' + fixture.key));
  if (!sameKey || sameKey.key !== state.persistence.key || sameKey.saved?.voice?.id !== state.voices.B.id || sameKey.saved.manual !== true) {
    throw new Error(`post-install saved record mismatch: ${JSON.stringify({sameKey, expected:state.persistence})}`);
  }
  const beforeCount = readers().filter(reader => reader?.itemID === fixture.itemID).length;
  const opened = Zotero.Reader.open(fixture.itemID, null, { openInWindow: true });
  if (opened && typeof opened.then === 'function') await opened;
  const separate = await waitFor(() => {
    const candidates = readers().filter(reader => reader?.itemID === fixture.itemID && reader !== live && reader?._internalReader?._readAloudManager);
    return candidates.find(reader => reader._window && reader._window !== main) || candidates[0] || null;
  }, 24000);
  if (!separate) throw new Error(`separate reader window did not open (before count ${beforeCount})`);
  await sleep(400);
  const second = await report();
  const entries = second.readers.filter(entry => entry.key === sameKey.key);
  if (entries.length < 2 || entries.some(entry => entry.saved?.voice?.id !== state.voices.B.id || entry.saved.manual !== true)) throw new Error(`separate reader did not restore same record: ${JSON.stringify(entries)}`);
  const separateInfo = { itemID: separate.itemID, tabID: separate.tabID || null, key: entries[entries.length - 1].key, saved: entries[entries.length - 1].saved, active: entries[entries.length - 1].active, paused: entries[entries.length - 1].paused, window: separate._window !== main };
  if (separate._window && separate._window !== main) separate._window.close();
  await waitFor(() => !readers().some(reader => reader === separate), 10000);
  state.persistence.postInstall = { key: sameKey.key, saved: sameKey.saved, separate: separateInfo, startup: 'passed' };
  return JSON.stringify({ status: 'PASS', installed: '1.15.2-beta2', startup: 'passed', key: sameKey.key, saved: sameKey.saved, separate: separateInfo, readerCountAfterClose: readers().filter(reader => reader?.itemID === fixture.itemID).length }, null, 1);
})();
