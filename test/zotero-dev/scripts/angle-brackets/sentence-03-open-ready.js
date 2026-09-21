(async () => {
  const fixtureID = Zotero.ZoteroTTSRun.state.fixtureItemID;
  if (!fixtureID) return JSON.stringify({ error: 'fixtureItemID missing from state' });
  let openError = null;
  try {
    Zotero.Reader.open(fixtureID);
  } catch (e) { openError = String(e); }
  const samples = [];
  for (let i = 0; i < 80; i++) {
    const list = Zotero.Reader._readers || [];
    const rows = [];
    for (let j = 0; j < list.length; j++) {
      const reader = list[j];
      const manager = reader._internalReader && reader._internalReader._readAloudManager;
      rows.push({
        itemID: reader.itemID,
        internal: !!reader._internalReader,
        manager: !!manager,
        remoteInterface: !!(manager && manager._options && manager._options.remoteInterface),
        selectedVoiceID: manager ? manager.selectedVoiceID : null,
      });
    }
    samples.push({ ms: i * 100, rows });
    let hit = false;
    for (let j = 0; j < rows.length; j++) {
      const row = rows[j];
      if (row.itemID === fixtureID && row.internal && row.manager && row.remoteInterface) { hit = true; break; }
    }
    if (hit) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const final = samples[samples.length - 1] || null;
  const fixtureRow = final ? final.rows.find(r => r.itemID === fixtureID) : null;
  return JSON.stringify({
    openError,
    ready: !!(fixtureRow && fixtureRow.internal && fixtureRow.manager && fixtureRow.remoteInterface),
    fixtureRow,
    samplesCount: samples.length,
  }, null, 1);
})()
