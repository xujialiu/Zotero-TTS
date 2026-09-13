(async () => {
  const fixtureID = 24434;
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
  return JSON.stringify({ final, samples: samples.length <= 4 ? samples : [samples[0], samples[1], samples[samples.length - 2], final] }, null, 1);
})()
