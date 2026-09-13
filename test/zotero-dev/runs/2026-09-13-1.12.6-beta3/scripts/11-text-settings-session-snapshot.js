(async () => {
  const all = JSON.parse(await Zotero.ZoteroTTS.diagnostics.textSettings());
  const list = Zotero.Reader._readers || [];
  const fixture = [];
  for (let i = 0; i < list.length; i++) {
    if (list[i].itemID !== 24434) continue;
    const manager = list[i]._internalReader && list[i]._internalReader._readAloudManager;
    fixture.push({
      active: !!manager?.active,
      paused: manager ? !!manager.paused : null,
      voice: manager?.selectedVoiceID || null,
      settings: all.find(entry => entry.reader === list[i]._instanceID || entry.itemID === 24434) || null,
    });
  }
  return JSON.stringify({ all, fixture }, null, 1);
})()
